import OpenAI from 'openai'
import { DEFAULT_MODEL, withSystemPrompt, buildOpenAIOptions } from '../../config.js'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }
  if (!process.env.OPENAI_API_KEY) {
    res.status(500)
    return res.end('Server missing OPENAI_API_KEY')
  }
  try {
    // Credit header
    try { res.setHeader('X-Credit', 'ikyyofc') } catch {}
    const body = await readJson(req)
    const { messages } = body || {}
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400)
      return res.end('messages array is required')
    }
    const chosenModel = DEFAULT_MODEL

    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    const finalMessages = withSystemPrompt(messages)

    const stream = await openai.chat.completions.create({
      ...buildOpenAIOptions({ model: chosenModel }),
      messages: finalMessages,
      stream: true
    })

    try {
      for await (const part of stream) {
        const delta = part?.choices?.[0]?.delta?.content
        if (delta) res.write(delta)
      }
    } catch (err) {
      console.error('stream iteration error', err)
    } finally {
      try { res.end() } catch {}
    }
  } catch (err) {
    console.error('handler error', err)
    try { res.end() } catch {}
  }
}

// Vercel will use the default Node.js runtime for Serverless Functions
