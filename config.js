// Konfigurasi AI terpusat (Vertex/OpenAI)
// Dapat dioverride via environment variables.
// Aman untuk import di Node dan browser (guard process.env).

const getEnv = (key, fallback) => {
    try {
        if (typeof process !== 'undefined' && process?.env && key in process.env) {
            return process.env[key]
        }
    } catch {}
    return fallback
}

export const SYSTEM_PROMPT = getEnv(
    'SYSTEM_PROMPT',
    "Kamu adalah asisten AI yang membantu dengan gaya ringkas dan ramah dalam Bahasa Indonesia."
);

// Instruction used to generate the very first greeting
export const GREETING_INSTRUCTION = getEnv(
    'GREETING_INSTRUCTION',
    'Berikan sapaan pembuka yang singkat, ramah, dan membantu untuk menyambut pengguna baru. Gunakan Bahasa Indonesia. HANYA SAPAAN, JANGAN BERBICARA ATAU MENAMBAHKAN TEKS LAIN'
)

// Pemilihan penyedia model: 'vertex' | 'openai'
export const MODEL_PROVIDER = getEnv('MODEL_PROVIDER', 'vertex')

// Nama model untuk masing-masing provider (opsional)
// Gunakan model default yang kompatibel dengan Chat Completions
export const OPENAI_MODEL = getEnv('OPENAI_MODEL', 'gpt-4.1')
// Catatan: kredensial Vertex diatur di lib/vertex.js sesuai repo ini.
// Jika suatu saat dipindah ke env, tambahkan di sini juga.

// Realtime info API (untuk OpenAI tools)
export const REALTIME_API_URL = getEnv('REALTIME_API_URL', 'https://anabot.my.id/api/ai/perplexity')
export const REALTIME_API_KEY = getEnv('REALTIME_API_KEY', 'freeApikey')

// Helper to prepend the system/developer prompt consistently
export function withSystemPrompt(messages = []) {
    const role = (MODEL_PROVIDER || 'openai').toLowerCase() === 'openai' ? 'developer' : 'system'
    return [
        { role, content: SYSTEM_PROMPT },
        ...(Array.isArray(messages) ? messages : [])
    ];
}
