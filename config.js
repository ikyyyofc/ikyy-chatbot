// Centralized AI configuration
// You can override most values via environment variables.

export const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5-chat-latest";

export const SYSTEM_PROMPT =
    process.env.SYSTEM_PROMPT ||
    "Kamu adalah asisten AI yang membantu dengan gaya ringkas dan ramah dalam Bahasa Indonesia.";

// Whether to prefer streaming in clients
export const ENABLE_STREAMING =
    (process.env.ENABLE_STREAMING || "true").toLowerCase() !== "false";

// Helper to prepend the system prompt consistently
export function withSystemPrompt(messages = []) {
    return [
        { role: "developer", content: SYSTEM_PROMPT },
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
