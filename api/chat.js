import OpenAI from 'openai'
import { DEFAULT_MODEL, withSystemPrompt, buildOpenAIOptions } from '../config.js'

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
  // Credit header
  try { res.setHeader('X-Credit', 'ikyyofc') } catch {}
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Server missing OPENAI_API_KEY' })
  }
  try {
    const body = await readJson(req)
    const { messages } = body || {}
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' })
    }
    const chosenModel = DEFAULT_MODEL
    const finalMessages = withSystemPrompt(messages)

    const completion = await openai.chat.completions.create({
      ...buildOpenAIOptions({ model: chosenModel }),
      messages: finalMessages
    })

    const reply = completion?.choices?.[0]?.message?.content ?? ''
    return res.status(200).json({ reply: { role: 'assistant', content: reply } })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'OpenAI request failed' })
  }
}

// Vercel will use the default Node.js runtime for Serverless Functions
