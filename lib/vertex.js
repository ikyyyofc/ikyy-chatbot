import axios from "axios";

export async function chat(messages) {
    if (!messages || !Array.isArray(messages))
        throw new Error("Messages array is required");

    const API_URL = "https://firebasevertexai.googleapis.com/v1beta";
    const MODEL_URL =
        "projects/gemmy-ai-bdc03/locations/us-central1/publishers/google/models";
    const HEADERS = {
        "content-type": "application/json",
        "x-goog-api-client": "gl-kotlin/2.1.0-ai fire/16.5.0",
        "x-goog-api-key": "AIzaSyD6QwvrvnjU7j-R6fkOghfIVKwtvc7SmLk"
    };

    const model = "gemini-2.5-flash";
    const contents = messages.map(msg => {
        let role = msg.role;
        if (role === "system") role = "model";
        if (role === "assistant") role = "model";

        return {
            role: role,
            parts: [{ text: msg.content }]
        };
    });

    const response = await axios.post(
        `${API_URL}/${MODEL_URL}/${model}:streamGenerateContent`,
        {
            model: `${MODEL_URL}/${model}`,
            contents: contents,
            tools: [
                {
                    googleSearch: {}
                }
            ]
        },
        {
            headers: HEADERS,
            responseType: "stream"
        }
    );

    return response.data;
}