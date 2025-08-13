import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import OpenAI from 'openai'
import path from 'path'
import { fileURLToPath } from 'url'
import { DEFAULT_MODEL, SYSTEM_PROMPT, withSystemPrompt, buildOpenAIOptions } from '../config.js'

const app = express()
const port = process.env.PORT || 3001

app.use(cors())

// Credit header for API responses only
app.use((req, res, next) => {
  if (req.path && req.path.startsWith('/api')) {
    res.setHeader('X-Credit', 'ikyyofc')
  }
  next()
})

// Serve static UI (no bundler)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const staticDir = path.resolve(__dirname, '../static')
app.use(express.static(staticDir))

const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
  console.warn('Warning: OPENAI_API_KEY is not set. Set it in .env')
}
const openai = new OpenAI({ apiKey })

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

// Streaming endpoint: streams text chunks directly
app.post('/api/chat/stream', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      res.status(500)
      return res.end('Server missing OPENAI_API_KEY')
    }
    const { messages } = req.body || {}
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400)
      return res.end('messages array is required')
    }
    const chosenModel = DEFAULT_MODEL

    // disable buffering for proxies, enable chunked
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    if (typeof res.flushHeaders === 'function') res.flushHeaders()

    const finalMessages = withSystemPrompt(messages)

    const stream = await openai.chat.completions.create({
      ...buildOpenAIOptions({ model: chosenModel }),
      messages: finalMessages,
      stream: true
    })

    for await (const part of stream) {
      const delta = part?.choices?.[0]?.delta?.content
      if (delta) {
        res.write(delta)
      }
    }
    res.end()
  } catch (err) {
    console.error('stream error', err)
    try { res.end() } catch {}
  }
})

app.post('/api/chat', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Server missing OPENAI_API_KEY' })
    }
    const { messages } = req.body || {}
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' })
    }
    const chosenModel = DEFAULT_MODEL

    // Always prepend a helpful system prompt
    const finalMessages = withSystemPrompt(messages)

    const completion = await openai.chat.completions.create({
      ...buildOpenAIOptions({ model: chosenModel }),
      messages: finalMessages
      // For simplicity, not streaming here. Can be upgraded later.
    })

    const reply = completion?.choices?.[0]?.message?.content ?? ''
    return res.json({ reply: { role: 'assistant', content: reply } })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'OpenAI request failed' })
  }
})

// Fallback to index.html for the UI root
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next()
  res.sendFile(path.join(staticDir, 'index.html'))
})

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`)
})
