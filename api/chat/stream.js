import OpenAI from "openai";
import {
    DEFAULT_MODEL,
    withSystemPrompt,
    buildOpenAIOptions
} from "../../config.js";
import { chat } from "../../lib/vertex.js"

/*const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });*/

async function readJson(req) {
    if (req.body && typeof req.body === "object") return req.body;
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", chunk => {
            data += chunk;
        });
        req.on("end", () => {
            try {
                resolve(data ? JSON.parse(data) : {});
            } catch (e) {
                reject(e);
            }
        });
        req.on("error", reject);
    });
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).end("Method Not Allowed");
    }
    try {
        // Credit header
        try {
            res.setHeader("X-Credit", "ikyyofc");
        } catch {}
        const body = await readJson(req);
        const { messages } = body || {};
        if (!Array.isArray(messages) || messages.length === 0) {
            res.status(400);
            return res.end("messages array is required");
        }

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");

        const finalMessages = withSystemPrompt(messages);

        const response = await chat(finalMessages);

        let buffer = "";
        let isProcessing = false;

        response.on("data", chunk => {
            buffer += chunk.toString();
            if (!isProcessing) {
                isProcessing = true;
                processBuffer();
                isProcessing = false;
            }
        });

        function processBuffer() {
            const result = extractCompleteJSON(buffer);
            if (!result) return;

            buffer = result.remaining;
            try {
                const obj = JSON.parse(result.json);
                if (obj.candidates?.[0]?.content?.parts?.[0]?.text) {
                    res.write(obj.candidates[0].content.parts[0].text);
                }
            } catch (e) {
                // Hanya log error parsing jika dalam mode debug
                // console.error("Error parsing JSON:", e);
            }

            // Proses sisa buffer secara rekursif
            processBuffer();
        }

        function extractCompleteJSON(buffer) {
            let inString = false;
            let escapeNext = false;
            let braceCount = 0;
            let startIndex = -1;

            for (let i = 0; i < buffer.length; i++) {
                const char = buffer[i];

                // Handle escape sequences
                if (escapeNext) {
                    escapeNext = false;
                    continue;
                }

                // Deteksi escape character
                if (char === "\\" && inString) {
                    escapeNext = true;
                    continue;
                }

                // Toggle string mode
                if (char === '"' && !escapeNext) {
                    inString = !inString;
                    continue;
                }

                // Hanya proses brace di luar string
                if (!inString) {
                    if (char === "{") {
                        if (braceCount === 0) startIndex = i;
                        braceCount++;
                    } else if (char === "}") {
                        braceCount--;
                        if (braceCount === 0 && startIndex !== -1) {
                            return {
                                json: buffer.substring(startIndex, i + 1),
                                remaining: buffer.substring(i + 1)
                            };
                        }
                    }
                }
            }
            return null; // Tidak ada JSON lengkap ditemukan
        }

        response.on("end", () => {
            if (buffer.trim()) {
                processBuffer();
            }
            res.end();
        });
    } catch (err) {
        console.error("handler error", err);
        try {
            res.end();
        } catch {}
    }
}

// Vercel will use the default Node.js runtime for Serverless Functions
