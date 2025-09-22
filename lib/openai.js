import axios from 'axios'
import { PassThrough } from 'stream'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { OPENAI_MODEL, STREAM_PRE_TOOL } from '../config.js'
import { felosearch } from './felo.js'
import { key } from './get_key.js'
import UserAgent from 'user-agents'
import { nekoEditUrl, bufferFromDataUrl, nekoGenUrl } from './img_edit.js'

// Streaming chat dengan OpenAI (Chat Completions SSE)
// Mengubah stream SSE OpenAI menjadi potongan JSON mirip Vertex agar kompatibel
// dengan parser yang sudah ada di server/api.
// --- Tooling: realtime via Felo lib ---
const OPENAI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'realtime_info',
      description: 'Get up-to-date information from the internet via an aggregated API. Use this when data may be outdated.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Question or topic to lookup' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_current_datetime',
      description: 'Get precise current date and time from the server clock. ALWAYS use for questions asking today\'s date, the current time, or time-related calculations.',
      parameters: {
        type: 'object',
        properties: {
          timeZone: { type: 'string', description: 'IANA timezone, e.g., Asia/Jakarta; defaults to server TZ' },
          locale: { type: 'string', description: 'BCP-47 locale for formatting, e.g., id-ID' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Generate a new image from text and return a URL. Use ONLY when the user asks to create/draw/render something from scratch AND no user image needs to be modified. If the user uploaded/provided an image and asks to change/add/remove something, DO NOT use this; call edit_image instead. IMPORTANT: Convert the user request to clear English in the prompt. Prefer aspect_ratio (e.g., 1:1, 16:9).',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed description of the image to generate' },
          aspect_ratio: { type: 'string', description: 'Aspect ratio such as 1:1, 16:9, 2:3, 3:2, 4:5, 5:4, 9:16, 21:9, 9:21' },
          size: { type: 'string', description: 'Optional size hint like 256x256, 512x512, 1024x1024 (used only to infer aspect ratio if aspect_ratio is missing).', enum: ['256x256','512x512','1024x1024'] },
          style: { type: 'string', description: 'Optional style, e.g., photorealistic, cartoon, cyberpunk' }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_image',
      description: 'Edit/modify an existing image the user provided. Use this when the user uploads/sends an image and asks to change/add/remove elements, adjust background, or otherwise transform the image. If the user only wants a description of the image, DO NOT call this tool. If the user wants edits, you MUST call this tool exactly once. Provide the image via image_url if available; if omitted, the tool will use the most recent uploaded image from context. The prompt MUST restate the requested edits in clear English (concise, specific). Return the final image URL; after the tool returns, embed it with Markdown and a short Indonesian caption.',
      parameters: {
        type: 'object',
        properties: {
          image_url: { type: 'string', description: 'Direct HTTP(S) URL to the source image' },
          image_base64: { type: 'string', description: 'Base64 string or data URL (data:image/...;base64,...)' },
          prompt: { type: 'string', description: 'Detailed edit instructions; write in English for best results' }
        },
        required: ['prompt']
      }
    }
  }
]

async function realtime_info({ query }) {
  const q = String(query || '')
  const { text, sources } = await felosearch(q)
  /*const { gpt: text, source: sources } = await (await axios.get(`https://beta.anabot.my.id/api/ai/perplexity?prompt=${encodeURIComponent(q)}&apikey=freeApikey`)).data.data.result*/
  return JSON.stringify({ query: q, answer: text || '', sources, status: 'ok' })
}

function sanitizeText(s = '', maxLen = 80) {
  try { s = String(s) } catch { s = '' }
  s = s.replace(/[\n\r\t]+/g, ' ').trim()
  if (s.length > maxLen) s = s.slice(0, maxLen - 1) + '…'
  return s
}


function uploadsDirPath() {
  // Mirror server/index.mjs logic
  const dir = path.join(process.cwd(), 'uploads')
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  return dir
}

function randomAlphaNum(len = 20) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

function publicBaseUrl() {
  const base = (process.env.PUBLIC_BASE_URL || '').trim()
  if (base) return base.replace(/\/$/, '')
  const port = process.env.PORT || 7860
  return `http://localhost:${port}`
}

async function saveImageToUploads(buf, contentType) {
  const dir = uploadsDirPath()
  // Determine extension
  let ext = '.png'
  if (typeof contentType === 'string') {
    if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg'
    else if (contentType.includes('webp')) ext = '.webp'
    else if (contentType.includes('gif')) ext = '.gif'
  } else {
    try {
      if (buf && buf.length > 1 && buf[0] === 0xff && buf[1] === 0xd8) ext = '.jpg'
      else if (buf && buf.length > 3 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) ext = '.png'
    } catch {}
  }
  const name = `${Date.now()}_${randomAlphaNum(10)}${ext}`
  const filePath = path.join(dir, name)
  await fsp.writeFile(filePath, buf)
  const url = `${publicBaseUrl()}/uploads/${name}`
  return url
}

async function generate_image({ prompt, size = '1024x1024', style, aspect_ratio }) {
  // Do not truncate prompt; keep as provided
  const safePrompt = String(prompt ?? '')
  if (!safePrompt) return JSON.stringify({ status: 'error', error: 'prompt_required' })

  // Nekolabs flux/dev supports only 9:16, 1:1, 16:9
  const allowedRatios = ['1:1','16:9','9:16']
  let ratio = (aspect_ratio && typeof aspect_ratio === 'string') ? aspect_ratio.trim() : ''
  if (!allowedRatios.includes(ratio)) {
    // Infer from size if provided
    const m = typeof size === 'string' ? size.match(/^(\d+)x(\d+)$/) : null
    if (m) {
      const w = parseInt(m[1], 10) || 1
      const h = parseInt(m[2], 10) || 1
      const r = (w / Math.max(1, h))
      // map to closest supported
      const diff = [
        { ar: '1:1', v: Math.abs(r - 1) },
        { ar: '16:9', v: Math.abs(r - (16/9)) },
        { ar: '9:16', v: Math.abs(r - (9/16)) }
      ].sort((a,b)=>a.v-b.v)
      ratio = diff[0].ar
    }
    if (!allowedRatios.includes(ratio)) ratio = '1:1'
  }

  try {
    const url = await nekoGenUrl(safePrompt, ratio)
    return JSON.stringify({
      status: 'ok',
      provider: 'nekolabs',
      url,
      aspect_ratio: ratio,
      prompt: safePrompt,
      style: style ? String(style) : undefined
    })
  } catch (e) {
    const msg = e?.response?.data?.message || e?.message || 'request_failed'
    return JSON.stringify({ status: 'error', provider: 'nekolabs', error: String(msg) })
  }
}

function convertMessages(msgs) {
  // Map developer/system to system for OpenAI and preserve tool messages.
  // Also build multimodal user messages when an image attachment exists.
  return msgs.map(m => {
    if (!m || !m.role) return null
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      const out = { role: 'assistant', tool_calls: m.tool_calls }
      if (typeof m.content !== 'undefined') out.content = m.content
      return out
    }
    if (m.role === 'tool') {
      const out = { role: 'tool', content: String(m.content ?? '') }
      if (m.tool_call_id) out.tool_call_id = m.tool_call_id
      return out
    }
    let role = m.role
    if (role === 'developer' || role === 'system') role = 'system'

    const raw = String(m.content ?? '')
    // Extract attachment hints added by server
    let attachUrl = ''
    let dataUrl = ''
    try {
      const mu = raw.match(/ATTACHMENT_URL:\s*(https?:[^\s]+)/i)
      if (mu) attachUrl = mu[1]
      const md = raw.match(/ATTACHMENT_DATA_URL:\s*(data:[^\s]+)/)
      if (md) dataUrl = md[1]
    } catch {}
    // Clean the visible text
    const textOnly = raw
      .replace(/ATTACHMENT_URL:\s*https?:[^\s]+/ig, '')
      .replace(/ATTACHMENT_DATA_URL:\s*data:[^\s]+/ig, '')
      .trim()

    if (role === 'user' && (attachUrl || dataUrl)) {
      const parts = []
      if (textOnly) parts.push({ type: 'text', text: textOnly })
      const url = dataUrl || attachUrl
      parts.push({ type: 'image_url', image_url: { url, detail: 'high' } })
      return { role: 'user', content: parts }
    }

    return { role, content: textOnly }
  }).filter(Boolean)
}

export async function chat(messages) {
  if (!Array.isArray(messages)) throw new Error('Messages array is required')
  const apiKey = await key() || process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY')

  const working = [...messages]
  const out = new PassThrough()

  const authHeaders = {
    'content-type': 'application/json',
    'authorization': `Bearer ${apiKey}`
  }

  function writeText(text) {
    if (!text) return
    const vertexLike = { candidates: [ { content: { parts: [ { text } ] } } ] }
    out.write(JSON.stringify(vertexLike))
  }

  async function sendAndStream(msgs) {
    const body = {
      model: OPENAI_MODEL,
      stream: true,
      messages: convertMessages(msgs),
      tools: OPENAI_TOOLS,
      tool_choice: 'auto'
    }
    const DEBUG = String(process.env.DEBUG || '').toLowerCase() === 'true'
    if (DEBUG) {
      try {
        console.log('[openai:req]', JSON.stringify({ model: OPENAI_MODEL, msgCount: body.messages.length }))
      } catch {}
    }

    let resp
    try {
      resp = await axios.post('https://api.openai.com/v1/chat/completions', body, { responseType: 'stream', headers: authHeaders })
    } catch (e) {
      const status = e?.response?.status
      if (status === 401) {
        const err = new Error('OpenAI unauthorized: missing/invalid OPENAI_API_KEY')
        err.status = 401
        throw err
      }
      const detail = e?.response?.data?.error?.message || e?.message || 'request failed'
      const err = new Error(`OpenAI request failed (${status ?? 'no_status'}): ${detail}`)
      err.status = status
      throw err
    }

    const decoder = new TextDecoder('utf-8')
    let buf = ''
    const toolCalls = [] // accumulate merged tool calls {id, type, function: {name, arguments}}
    const toolArgs = [] // accumulating arguments per index
    const toolIds = []
    const toolNames = []
    let sawToolCall = false
    let pendingText = '' // buffer textual deltas until we know if a tool call occurs

    // writeText defined above

    resp.data.on('data', (chunk) => {
      try { buf += decoder.decode(chunk, { stream: true }) } catch { buf += chunk.toString() }
      let idx
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line || line.startsWith(':')) continue
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const obj = JSON.parse(data)
          const choice = obj?.choices?.[0]
          const delta = choice?.delta || {}
          // Stream immediately if allowed, otherwise buffer until tool decision
          if (delta?.content) {
            if (STREAM_PRE_TOOL) writeText(delta.content)
            else pendingText += delta.content
          }
          // accumulate tool calls
          if (Array.isArray(delta?.tool_calls)) {
            sawToolCall = true
            delta.tool_calls.forEach((tc) => {
              const i = tc.index ?? 0
              if (typeof toolIds[i] === 'undefined' && tc.id) toolIds[i] = tc.id
              if (typeof toolNames[i] === 'undefined' && tc.function?.name) toolNames[i] = tc.function.name
              if (!toolArgs[i]) toolArgs[i] = ''
              if (typeof tc.function?.arguments === 'string') toolArgs[i] += tc.function.arguments
            })
          }
        } catch {}
      }
    })

    return await new Promise((resolve, reject) => {
      resp.data.on('end', async () => {
        try { buf += decoder.decode() } catch {}
        // Build tool calls if any
        if (sawToolCall) {
          // If we buffered pre-tool text, drop it to avoid premature answers
          if (!STREAM_PRE_TOOL) pendingText = ''
          for (let i = 0; i < toolArgs.length; i++) {
            const id = toolIds[i] || `tool_${i}`
            const name = toolNames[i] || 'web_search'
            const argsStr = toolArgs[i] || '{}'
            toolCalls.push({ id, type: 'function', function: { name, arguments: argsStr } })
          }
          if (DEBUG) {
            try { console.log('[openai:tools_detected]', JSON.stringify({ tools: toolCalls.map(t => t.function?.name) })) } catch {}
          }

          // Append assistant tool_calls message
          const nextMsgs = msgs.slice()
          nextMsgs.push({ role: 'assistant', tool_calls: toolCalls })

          // Execute tools and append tool outputs
          for (const tc of toolCalls) {
            let parsed
            try { parsed = JSON.parse(tc.function.arguments || '{}') } catch { parsed = {} }
            let result = ''
            try {
              // Announce start for each tool with its query
              try {
                if (tc.function.name === 'realtime_info') {
                  const q = String(parsed?.query || '')
                  writeText(`⟦tool:realtime_info:start:${encodeURIComponent(q)}⟧`)
                } else if (tc.function.name === 'generate_image') {
                  const p = String(parsed?.prompt || '')
                  writeText(`⟦tool:generate_image:start:${encodeURIComponent(p)}⟧`)
                } else if (tc.function.name === 'edit_image') {
                  const p = String(parsed?.prompt || '')
                  writeText(`⟦tool:edit_image:start:${encodeURIComponent(p)}⟧`)
                }
              } catch {}
              if (tc.function.name === 'realtime_info') {
                result = await realtime_info(parsed || {})
              } else if (tc.function.name === 'get_current_datetime') {
                // Build server-side now payload
                const tz = parsed?.timeZone && typeof parsed.timeZone === 'string' ? parsed.timeZone : undefined
                const locale = parsed?.locale && typeof parsed.locale === 'string' ? parsed.locale : undefined
                const now = new Date()
                const iso = now.toISOString()
                const epoch = Date.now()
                let formatted = iso
                try {
                  const fmt = new Intl.DateTimeFormat(locale || 'id-ID', {
                    timeZone: tz,
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                  })
                  formatted = fmt.format(now)
                } catch {}
                result = JSON.stringify({
                  iso, epoch, timeZone: tz || Intl.DateTimeFormat().resolvedOptions().timeZone,
                  formatted, locale: locale || 'id-ID'
                })
              } else if (tc.function.name === 'generate_image') {
                result = await generate_image(parsed || {})
              } else if (tc.function.name === 'edit_image') {
                // Resolve source image URL or construct one from base64, then call Nekolabs
                const prompt = String(parsed?.prompt || '')
                let srcImageUrl = null
                let dataUrlFromMsg = null
                try {
                  let attachUrlFromMsg = null
                  try {
                    const lastUser = [...msgs].reverse().find(m => m && m.role === 'user' && typeof m.content === 'string')
                    if (lastUser && typeof lastUser.content === 'string') {
                      const m1 = lastUser.content.match(/ATTACHMENT_URL:\s*(https?:[^\s]+)/i)
                      if (m1) attachUrlFromMsg = m1[1]
                      const m2 = lastUser.content.match(/ATTACHMENT_DATA_URL:\s*(data:[^\s]+)/)
                      if (m2) dataUrlFromMsg = m2[1]
                    }
                  } catch {}
                  srcImageUrl = (typeof parsed?.image_url === 'string' && /^https?:\/\//i.test(parsed.image_url)) ? parsed.image_url : (attachUrlFromMsg || null)
                } catch {}
                try {
                  if (!srcImageUrl) {
                    // If only base64 provided, write to uploads to get a URL for Nekolabs
                    const base64 = (typeof parsed?.image_base64 === 'string' ? parsed.image_base64 : null) || dataUrlFromMsg || ''
                    const buf = base64 ? (bufferFromDataUrl(base64) || Buffer.from(base64.replace(/^data:[^;]+;base64,/i, ''), 'base64')) : null
                    if (buf) {
                      // reuse local helper to save and get URL
                      srcImageUrl = await saveImageToUploads(buf)
                    }
                  }
                  if (!srcImageUrl) {
                    result = JSON.stringify({ status: 'error', provider: 'nekolabs', error: 'image_required', detail: 'Provide image_url or upload an image first' })
                  } else {
                    const url = await nekoEditUrl(srcImageUrl, prompt)
                    result = JSON.stringify({ status: 'ok', provider: 'nekolabs', url, prompt: sanitizeText(prompt, 100) })
                  }
                } catch (e) {
                  if (DEBUG) console.error('[tool:edit_image:error]', e?.message || e)
                  result = JSON.stringify({ status: 'error', provider: 'nekolabs', error: String(e?.message || 'edit_failed') })
                }
              } else {
                result = JSON.stringify({ error: `Unknown tool ${tc.function.name}` })
              }
            } catch (e) {
              result = JSON.stringify({ error: String(e?.message || e || 'tool error') })
            }
            // Kirim bentuk pesan tool yang sesuai schema Chat Completions
            nextMsgs.push({ role: 'tool', tool_call_id: tc.id, content: result })
            // Announce end for each tool
            try {
              if (tc.function.name === 'realtime_info') {
                const q = String(parsed?.query || '')
                writeText(`⟦tool:realtime_info:end:${encodeURIComponent(q)}⟧`)
              } else if (tc.function.name === 'generate_image') {
                const p = String(parsed?.prompt || '')
                writeText(`⟦tool:generate_image:end:${encodeURIComponent(p)}⟧`)
              } else if (tc.function.name === 'edit_image') {
                const p = String(parsed?.prompt || '')
                writeText(`⟦tool:edit_image:end:${encodeURIComponent(p)}⟧`)
              }
            } catch {}
          }

          // Recurse for final answer; stream into same output
          await sendAndStream(nextMsgs)
          return resolve()
        }
        // No tools used: flush buffered text now
        if (pendingText) {
          writeText(pendingText)
          pendingText = ''
        }
        resolve()
      })
      resp.data.on('error', (err) => reject(err))
    })
  }

  // Kick off chain, but return stream immediately
  Promise.resolve().then(() => sendAndStream(working)).then(() => out.end()).catch(err => out.destroy(err))
  return out
}
