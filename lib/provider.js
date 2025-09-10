import { MODEL_PROVIDER } from '../config.js'
import { chat as vertexChat } from './vertex.js'
import { chat as openaiChat } from './openai.js'

export async function chat(messages) {
  const provider = (MODEL_PROVIDER || 'vertex').toLowerCase()
  const DEBUG = String(process.env.DEBUG || '').toLowerCase() === 'true'
  if (DEBUG) {
    try {
      console.log('[provider:select]', JSON.stringify({ provider, msgCount: Array.isArray(messages) ? messages.length : 0 }))
    } catch {}
  }
  if (provider === 'openai') return openaiChat(messages)
  return vertexChat(messages)
}
