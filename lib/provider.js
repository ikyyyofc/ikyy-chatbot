import { MODEL_PROVIDER } from '../config.js'
import { chat as vertexChat } from './vertex.js'
import { chat as openaiChat } from './openai.js'

export async function chat(messages) {
  const provider = (MODEL_PROVIDER || 'vertex').toLowerCase()
  if (provider === 'openai') return openaiChat(messages)
  return vertexChat(messages)
}

