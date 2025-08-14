// Konfigurasi AI terpusat (Vertex-only)
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

// Helper to prepend the system prompt consistently
export function withSystemPrompt(messages = []) {
    return [
        { role: "system", content: SYSTEM_PROMPT },
        ...(Array.isArray(messages) ? messages : [])
    ];
}
