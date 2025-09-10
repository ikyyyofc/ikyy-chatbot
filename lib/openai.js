import axios from 'axios'
import { PassThrough } from 'stream'
import { OPENAI_MODEL, STREAM_PRE_TOOL } from '../config.js'
import { felosearch } from './felo.js'
import { key } from './get_key.js'
import UserAgent from 'user-agents'
import { imgEditUrl, fetchUrlToBuffer, bufferFromDataUrl } from './img_edit.js'

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
      description: 'Generate a new image from text and return a URL. Use ONLY when the user asks to create/draw/render something from scratch. Do NOT use this for modifying a user-provided image; in that case, call edit_image instead. IMPORTANT: Convert the user request to clear English in the prompt. Prefer aspect_ratio (e.g., 1:1, 16:9).',
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
      description: 'Edit/modify an existing image the user provided. Call this when the user uploads/sends an image and asks to change/add/remove elements, adjust background, or otherwise transform the image. Provide the image via image_url if possible; if you omit it, the tool will use the most recent image sent by the user. The prompt MUST be a clear English description of the requested edits. Only use this tool for edits; if the user only asks what is in the image, DO NOT call this tool and just describe the image.',
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


async function generate_image({ prompt, size = '1024x1024', style, aspect_ratio }) {
  const safePrompt = sanitizeText(prompt || '')
  if (!safePrompt) return JSON.stringify({ status: 'error', error: 'prompt_required' })

  const allowedRatios = ['1:1','16:9','2:3','3:2','4:5','5:4','9:16','21:9','9:21']
  let ratio = (aspect_ratio && typeof aspect_ratio === 'string') ? aspect_ratio.trim() : ''
  if (!allowedRatios.includes(ratio)) {
    // Infer from size if provided
    const m = typeof size === 'string' ? size.match(/^(\d+)x(\d+)$/) : null
    if (m) {
      const w = parseInt(m[1], 10) || 1
      const h = parseInt(m[2], 10) || 1
      const g = (n) => Math.max(1, n)
      const rw = g(w), rh = g(h)
      const gcd = (a,b)=> b?gcd(b,a%b):a
      const d = gcd(rw, rh)
      ratio = `${Math.round(rw/d)}:${Math.round(rh/d)}`
    }
    if (!allowedRatios.includes(ratio)) ratio = '1:1'
  }

  try {
    const ua = new UserAgent().toString()
    const { data } = await axios.get('https://www.ai4chat.co/api/image/generate', {
      params: { prompt: safePrompt, aspect_ratio: ratio },
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
        referer: 'https://www.ai4chat.co/image-pages/realistic-ai-image-generator',
        'user-agent': ua
      },
      timeout: 60000
    })
    const url = data?.image_link || ''
    if (!url) throw new Error('no_image_link')
    return JSON.stringify({ status: 'ok', provider: 'ai4chat', url, aspect_ratio: ratio, prompt: safePrompt, style: style ? String(style) : undefined })
  } catch (e) {
    return JSON.stringify({ status: 'error', provider: 'ai4chat', error: String(e?.message || 'request_failed') })
  }
}

function convertMessages(msgs) {
  // Map developer/system to system for OpenAI and preserve tool messages
  return msgs.map(m => {
    if (!m || !m.role) return null
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      const out = { role: 'assistant', tool_calls: m.tool_calls }
      if (typeof m.content !== 'undefined') out.content = m.content
      return out
    }
    if (m.role === 'tool') {
      // Chat Completions mengharapkan hanya { role, content, tool_call_id }
      const out = { role: 'tool', content: String(m.content ?? '') }
      if (m.tool_call_id) out.tool_call_id = m.tool_call_id
      return out
    }
    let role = m.role
    if (role === 'developer' || role === 'system') role = 'system'

    // Detect image attachments from markers in text and build multimodal content
    const raw = String(m.content ?? '')
    const images = []
    let text = raw
    try {
      // Extract ATTACHMENT_URL markers
      const reUrl = /ATTACHMENT_URL:\s*(https?:[^\s]+)/ig
      let mu
      while ((mu = reUrl.exec(raw))) {
        const url = mu[1]
        if (url) images.push({ type: 'image_url', image_url: { url } })
      }
      // Extract ATTACHMENT_DATA_URL markers (fallback)
      const reData = /ATTACHMENT_DATA_URL:\s*(data:[^\s]+)/ig
      let md
      while ((md = reData.exec(raw))) {
        const url = md[1]
        if (url) images.push({ type: 'image_url', image_url: { url } })
      }
      // Remove markers and markdown images from the text content
      text = text.replace(reUrl, '').replace(reData, '')
      text = text.replace(/!\[[^\]]*\]\([^\)]*\)/g, '').trim()
    } catch {}

    if (images.length && role === 'user') {
      const content = []
      if (text) content.push({ type: 'text', text })
      content.push(...images)
      return { role: 'user', content }
    }

    return { role, content: text }
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
                // Resolve source image from tool args or from last user message ATTACHMENT_DATA_URL
                const prompt = String(parsed?.prompt || '')
                let buf = null
                try {
                  let dataUrlFromMsg = null
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
                  if (parsed?.image_base64 && typeof parsed.image_base64 === 'string') {
                    buf = bufferFromDataUrl(parsed.image_base64) || Buffer.from(parsed.image_base64, 'base64')
                  } else if (parsed?.image_url && typeof parsed.image_url === 'string') {
                    buf = await fetchUrlToBuffer(parsed.image_url)
                  } else if (attachUrlFromMsg) {
                    buf = await fetchUrlToBuffer(attachUrlFromMsg)
                  } else if (dataUrlFromMsg) {
                    buf = bufferFromDataUrl(dataUrlFromMsg)
                  }
                } catch {}
                if (!buf) {
                  result = JSON.stringify({ status: 'error', error: 'image_required', detail: 'Provide image_url or image_base64' })
                } else {
                  try {
                    const url = await imgEditUrl(buf, prompt)
                    result = JSON.stringify({ status: 'ok', provider: 'photogpt', url, prompt: sanitizeText(prompt, 100) })
                  } catch (e) {
                    result = JSON.stringify({ status: 'error', provider: 'photogpt', error: String(e?.message || 'edit_failed') })
                  }
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
