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
    return res.status(500).json({ error: 'Server missing OPENAI_API_KEY' })
  }
  try {
    const body = await readJson(req)
    const { messages, model } = body || {}
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' })
    }
    const chosenModel = typeof model === 'string' && model.length ? model : 'gpt-5-chat-latest'

    const system = {
      role: 'system',
      content: 'Kamu adalah asisten AI yang membantu dengan gaya ringkas dan ramah dalam Bahasa Indonesia.'
    }
    const finalMessages = [system, ...messages]

    const completion = await openai.chat.completions.create({
      model: chosenModel,
      messages: finalMessages,
      temperature: 0.3
    })

    const reply = completion?.choices?.[0]?.message?.content ?? ''
    return res.status(200).json({ reply: { role: 'assistant', content: reply } })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'OpenAI request failed' })
  }
}

export const config = { runtime: 'nodejs18.x' }

