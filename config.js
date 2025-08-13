// Centralized AI configuration
// You can override most values via environment variables.

export const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5-chat-latest'

export const SYSTEM_PROMPT = (
  process.env.SYSTEM_PROMPT ||
  'Kamu adalah asisten AI yang membantu dengan gaya ringkas dan ramah dalam Bahasa Indonesia.'
)

// Sampling parameters
export const TEMPERATURE = process.env.OPENAI_TEMPERATURE !== undefined
  ? Number(process.env.OPENAI_TEMPERATURE)
  : 2

export const TOP_P = process.env.OPENAI_TOP_P !== undefined
  ? Number(process.env.OPENAI_TOP_P)
  : undefined

export const MAX_TOKENS = process.env.OPENAI_MAX_TOKENS !== undefined
  ? Number(process.env.OPENAI_MAX_TOKENS)
  : undefined

// Whether to prefer streaming in clients
export const ENABLE_STREAMING = (process.env.ENABLE_STREAMING || 'true').toLowerCase() !== 'false'

// Helper to prepend the system prompt consistently
export function withSystemPrompt(messages = []) {
  return [{ role: 'developer', content: SYSTEM_PROMPT }, ...(Array.isArray(messages) ? messages : [])]
}

// Build OpenAI call options in one place
export function buildOpenAIOptions({ model = DEFAULT_MODEL, temperature = TEMPERATURE } = {}) {
  const opts = { model, temperature, frequency_penalty: 2 }
  if (TOP_P !== undefined) opts.top_p = TOP_P
  if (MAX_TOKENS !== undefined) opts.max_tokens = MAX_TOKENS
  return opts
}

