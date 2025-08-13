import OpenAI from 'openai'

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
    const body = await readJson(req)
    const { messages, model } = body || {}
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400)
      return res.end('messages array is required')
    }
    const chosenModel = typeof model === 'string' && model.length ? model : 'gpt-5-chat-latest'

    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    const system = {
      role: 'system',
      content: 'Kamu adalah asisten AI yang membantu dengan gaya ringkas dan ramah dalam Bahasa Indonesia.'
    }
    const finalMessages = [system, ...messages]

    const stream = await openai.chat.completions.create({
      model: chosenModel,
      messages: finalMessages,
      temperature: 0.3,
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

export const config = { runtime: 'nodejs20.x' }
