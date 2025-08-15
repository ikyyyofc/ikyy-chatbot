import axios from 'axios'
import { PassThrough } from 'stream'
import { OPENAI_MODEL, REALTIME_API_URL, REALTIME_API_KEY } from '../config.js'

// Streaming chat dengan OpenAI (Chat Completions SSE)
// Mengubah stream SSE OpenAI menjadi potongan JSON mirip Vertex agar kompatibel
// dengan parser yang sudah ada di server/api.
// --- Tooling: realtime via anabot.my.id ---
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
  }
]

async function realtime_info({ query }) {
  const url = REALTIME_API_URL
  const apikey = REALTIME_API_KEY
  const { data } = await axios.get(url, {
    params: { prompt: String(query || ''), apikey },
    timeout: 15000,
    responseType: 'json',
    validateStatus: s => s >= 200 && s < 500
  })
  // Normalize to a consistent JSON payload for the tool result
  // Expecting shape: { status, data: { result: { gpt: string, source: [...] } } }
  const answer = data?.data?.result?.gpt || ''
  const sources = data?.data?.result?.source || []
  return JSON.stringify({ query, answer, sources, status: data?.status ?? null })
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
    return { role, content: String(m.content ?? '') }
  }).filter(Boolean)
}

export async function chat(messages) {
  if (!Array.isArray(messages)) throw new Error('Messages array is required')
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY')

  // Add concise tool instruction to help model decide
  const toolInstruction = {
    role: 'developer',
    content: 'You can access real-time web information using the tool realtime_info(query). Use it whenever the answer may require up-to-date facts, and cite URLs from the sources in your final answer.'
  }

  const working = [toolInstruction, ...messages]
  const out = new PassThrough()

  const authHeaders = {
    'content-type': 'application/json',
    'authorization': `Bearer ${apiKey}`
  }

  async function sendAndStream(msgs, depth = 0) {
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

    function writeText(text) {
      if (!text) return
      const vertexLike = { candidates: [ { content: { parts: [ { text } ] } } ] }
      out.write(JSON.stringify(vertexLike))
    }

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
          // stream content
          if (delta?.content) writeText(delta.content)
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
                }
              } catch {}
              if (tc.function.name === 'realtime_info') {
                result = await realtime_info(parsed || {})
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
              }
            } catch {}
          }

          // Limit tool iterations to 2 to avoid loops
          if (depth >= 1) {
            return resolve()
          }
          // Recurse for final answer; stream into same output
          await sendAndStream(nextMsgs, depth + 1)
          return resolve()
        }
        resolve()
      })
      resp.data.on('error', (err) => reject(err))
    })
  }

  // Kick off chain, but return stream immediately
  Promise.resolve().then(() => sendAndStream(working, 0)).then(() => out.end()).catch(err => out.destroy(err))
  return out
}
