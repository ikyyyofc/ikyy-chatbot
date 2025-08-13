// Centralized AI configuration
// You can override most values via environment variables.
// Safe for both Node and browser imports (guards process.env).

const getEnv = (key, fallback) => {
    try {
        if (typeof process !== 'undefined' && process?.env && key in process.env) {
            return process.env[key]
        }
    } catch {}
    return fallback
}

export const DEFAULT_MODEL = getEnv('OPENAI_MODEL', "gpt-5-chat-latest");

export const SYSTEM_PROMPT =
    getEnv('SYSTEM_PROMPT',
        "Kamu adalah asisten AI yang membantu dengan gaya ringkas dan ramah dalam Bahasa Indonesia.");

// Whether to prefer streaming in clients
export const ENABLE_STREAMING =
    String(getEnv('ENABLE_STREAMING', "true")).toLowerCase() !== "false";

// Instruction used to generate the very first greeting
export const GREETING_INSTRUCTION = getEnv(
    'GREETING_INSTRUCTION',
    'Berikan sapaan pembuka yang singkat, ramah, dan membantu untuk menyambut pengguna baru. Gunakan Bahasa Indonesia. HANYA SAPAAN, JANGAN BERBICARA ATAU MENAMBAHKAN TEKS LAIN'
)

// Helper to prepend the system prompt consistently
export function withSystemPrompt(messages = []) {
    return [
        { role: "system", content: SYSTEM_PROMPT },
        ...(Array.isArray(messages) ? messages : [])
    ];
}

// Build OpenAI call options in one place
export function buildOpenAIOptions({
    model = DEFAULT_MODEL
} = {}) {
    const opts = { model };
    return opts;
}
