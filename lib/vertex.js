import axios from "axios";

// Konfigurasi endpoint Vertex (Firebase Vertex API)
const API_URL = "https://firebasevertexai.googleapis.com/v1beta";
const MODEL_URL = "projects/gemmy-ai-bdc03/locations/us-central1/publishers/google/models";
const MODEL_NAME = "gemini-2.5-flash";
const BASE_HEADERS = {
    "content-type": "application/json",
    "x-goog-api-client": "gl-kotlin/2.1.0-ai fire/16.5.0"
};

function getVertexApiKey() {
    // Baca dari env; jangan hard-code kredensial
    return process.env.FIREBASE_VERTEX_API_KEY || process.env.GOOGLE_API_KEY || "AIzaSyD6QwvrvnjU7j-R6fkOghfIVKwtvc7SmLk";
}

// Streaming chat dengan Vertex AI (Firebase Vertex API)
export async function chat(messages) {
    if (!messages || !Array.isArray(messages))
        throw new Error("Messages array is required");
    const API_KEY = getVertexApiKey();
    if (!API_KEY) throw new Error("Missing FIREBASE_VERTEX_API_KEY (or GOOGLE_API_KEY)");

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
        contents.push({ role, parts: [{ text: String(msg.content) }] });
    }

    const body = {
        model: `${MODEL_URL}/${MODEL_NAME}`,
        contents,
        ...(systemParts.length ? { systemInstruction: { role: "system", parts: systemParts } } : {}),
        tools: [ { googleSearch: {} } ]
    };

    const response = await axios.post(
        `${API_URL}/${MODEL_URL}/${MODEL_NAME}:streamGenerateContent`,
        body,
        { headers: { ...BASE_HEADERS, "x-goog-api-key": API_KEY }, responseType: "stream" }
    );

    return response.data;
}
