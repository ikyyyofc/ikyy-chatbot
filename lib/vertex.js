import axios from "axios";
import { bufferFromDataUrl, fetchUrlToBuffer } from "./img_edit.js";

// Konfigurasi endpoint Vertex (Firebase Vertex API)
const API_URL = "https://firebasevertexai.googleapis.com/v1beta";
const MODEL_URL =
    "projects/gemmy-ai-bdc03/locations/us-central1/publishers/google/models";
const MODEL_NAME = "gemini-flash-latest";
const BASE_HEADERS = {
    "content-type": "application/json",
    "x-goog-api-client": "gl-kotlin/2.1.0-ai fire/16.5.0"
};

function getVertexApiKey() {
    // Baca dari env; jangan hard-code kredensial
    return (
        process.env.FIREBASE_VERTEX_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        "AIzaSyD6QwvrvnjU7j-R6fkOghfIVKwtvc7SmLk"
    );
}

// Streaming chat dengan Vertex AI (Firebase Vertex API)
export async function chat(messages) {
    const DEBUG = String(process.env.DEBUG || "").toLowerCase() === "true";
    if (!messages || !Array.isArray(messages))
        throw new Error("Messages array is required");
    const API_KEY = getVertexApiKey();
    if (!API_KEY)
        throw new Error("Missing FIREBASE_VERTEX_API_KEY (or GOOGLE_API_KEY)");

    // Pisahkan system prompt menjadi systemInstruction,
    // dan sisakan riwayat user/model di contents.
    const systemParts = [];
    const contents = [];
    for (const msg of messages) {
        if (!msg || !msg.role || !msg.content) continue;
        if (msg.role === "system") {
            systemParts.push({ text: String(msg.content) });
            continue;
        }
        let role = msg.role;
        if (role === "assistant") role = "model"; // riwayat jawaban model

        const raw = String(msg.content || "");
        // Detect server-injected attachment hints
        let attachUrl = "";
        let dataUrl = "";
        try {
            const mu = raw.match(/ATTACHMENT_URL:\s*(https?:[^\s]+)/i);
            if (mu) attachUrl = mu[1];
            const md = raw.match(/ATTACHMENT_DATA_URL:\s*(data:[^\s]+)/);
            if (md) dataUrl = md[1];
        } catch {}
        const textOnly = raw
            .replace(/ATTACHMENT_URL:\s*https?:[^\s]+/gi, "")
            .replace(/ATTACHMENT_DATA_URL:\s*data:[^\s]+/gi, "")
            .trim();

        const parts = [];
        if (textOnly) parts.push({ text: textOnly });
        if (role === "user" && (attachUrl || dataUrl)) {
            try {
                let buf = null;
                let mimeType = "image/png";
                if (dataUrl) {
                    // Extract base64 and mime from data URL
                    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (m) {
                        mimeType = m[1];
                        buf = Buffer.from(m[2], "base64");
                    } else buf = bufferFromDataUrl(dataUrl);
                } else if (attachUrl) {
                    const resp = await axios.get(attachUrl, {
                        responseType: "arraybuffer",
                        timeout: 45000
                    });
                    buf = Buffer.from(resp.data || []);
                    const ct = String(resp.headers?.["content-type"] || "");
                    if (ct) mimeType = ct;
                }
                if (buf && buf.length) {
                    parts.push({
                        inlineData: { mimeType, data: buf.toString("base64") }
                    });
                }
            } catch {}
        }
        contents.push({ role, parts: parts.length ? parts : [{ text: raw }] });
    }

    // Add a concise policy instructing tool-use for time-sensitive facts (model decides when)
    const policy = {
        role: "system",
        parts: [
            {
                text: [
                    "REAL-TIME POLICY:",
                    "Gunakan tools pencarian (googleSearch) untuk fakta yang dapat berubah dari waktu ke waktu (tren, berita, rilis, harga, jadwal, cuaca, statistik).",
                    "Lewati tools untuk sapaan atau chit-chat non-faktual.",
                    "Jika menggunakan hasil pencarian, sebutkan URL sumber yang relevan secara ringkas.",
                    "Jika pengguna menyinggung hal yang bergantung pada waktu, anggap time-sensitive dan lakukan pencarian ringkas sebelum menjawab."
                ].join(" ")
            }
        ]
    };

    const body = {
        model: `${MODEL_URL}/${MODEL_NAME}`,
        contents,
        ...(systemParts.length
            ? {
                  systemInstruction: {
                      role: "system",
                      parts: [...systemParts, policy.parts[0]]
                  }
              }
            : { systemInstruction: policy }),
        generationConfig: {
            thinkingConfig: {
                thinkingBudget: -1
            },
            mediaResolution: "MEDIA_RESOLUTION_MEDIUM",
            imageConfig: {
                image_size: "1K"
            }
        },
        safetySettings: [
            {
                category: "HARM_CATEGORY_HARASSMENT",
                threshold: "BLOCK_NONE"
            },
            {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_NONE"
            },
            {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_NONE"
            },
            {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_NONE"
            }
        ],
        tools: [
            { googleSearch: {} },
            {
                urlContext: {}
            },
           /* {
                codeExecution: {}
            }*/
        ]
    };

    if (DEBUG) {
        try {
            console.log(
                "[vertex:req]",
                JSON.stringify({
                    count: contents?.length || 0,
                    hasSystem: !!systemParts.length
                })
            );
        } catch {}
    }
    const response = await axios.post(
        `${API_URL}/${MODEL_URL}/${MODEL_NAME}:streamGenerateContent`,
        body,
        {
            headers: { ...BASE_HEADERS, "x-goog-api-key": API_KEY },
            responseType: "stream"
        }
    );
    if (DEBUG) {
        try {
            console.log("[vertex:open]");
        } catch {}
    }

    return response.data;
}
