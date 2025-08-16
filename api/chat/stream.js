import { withSystemPrompt } from "../../config.js";
import { chat } from "../../lib/provider.js"
// In-memory session store in serverless scope (best-effort, warm invocations only)
const sessions = new Map();

async function readJson(req) {
    if (req.body && typeof req.body === "object") return req.body;
    return new Promise((resolve, reject) => {
        let data = "";
        // Gunakan decoding UTF-8 yang aman lintas chunk
        try { req.setEncoding('utf8') } catch {}
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
        const { messages, sessionId, userMessage, resetSession, action } = body || {};

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");

        // Optional: reset session
        if (sessionId && resetSession) {
            sessions.set(sessionId, []);
        }

        let buildHistory = null;
        if (sessionId && action === 'retry_last') {
            const hist = sessions.get(sessionId) || [];
            const lastAssistantIdx = [...hist].map(m => m.role).lastIndexOf('assistant');
            const base = lastAssistantIdx > 0 ? hist.slice(0, lastAssistantIdx) : hist;
            const lastUserIdx = [...base].map(m => m.role).lastIndexOf('user');
            if (lastUserIdx === -1) {
                res.status(400);
                return res.end('No user message to retry from');
            }
            buildHistory = base.slice(0, lastUserIdx + 1);
        } else if (sessionId && action === 'truncate_and_retry') {
            const { keepUserCount } = body || {};
            const hist = sessions.get(sessionId) || [];
            let count = 0;
            let keepIdx = -1;
            for (let i = 0; i < hist.length; i++) {
                if (hist[i]?.role === 'user') {
                    count++;
                    if (count === keepUserCount) { keepIdx = i; break; }
                }
            }
            if (keepIdx === -1) {
                res.status(400);
                return res.end('Invalid keepUserCount');
            }
            buildHistory = hist.slice(0, keepIdx + 1);
        } else if (sessionId && typeof userMessage === 'string') {
            const hist = sessions.get(sessionId) || [];
            buildHistory = [...hist, { role: 'user', content: String(userMessage) }];
        } else if (Array.isArray(messages) && messages.length > 0) {
            buildHistory = messages;
        } else {
            res.status(400);
            return res.end("messages array or sessionId+userMessage is required");
        }

        const finalMessages = withSystemPrompt(buildHistory);

        const response = await chat(finalMessages);

        let buffer = "";
        let isProcessing = false;
        let assistantText = '';
        const decoder = new TextDecoder('utf-8');
        let clientClosed = false;
        let finished = false;

        function processBuffer(shouldWrite = true) {
            while (true) {
                const result = extractCompleteJSON(buffer);
                if (!result) break;
                buffer = result.remaining;
                try {
                    const obj = JSON.parse(result.json);
                    if (obj.candidates?.[0]?.content?.parts?.[0]?.text) {
                        const text = obj.candidates[0].content.parts[0].text;
                        assistantText += text;
                        if (shouldWrite && !clientClosed) {
                          try { res.write(Buffer.from(text, 'utf8')) } catch { try { res.write(text) } catch {} }
                        }
                    }
                } catch (e) { /* ignore */ }
            }
        }

        function extractCompleteJSON(buffer) {
            let inString = false;
            let escapeNext = false;
            let braceCount = 0;
            let startIndex = -1;
            for (let i = 0; i < buffer.length; i++) {
                const char = buffer[i];
                if (escapeNext) { escapeNext = false; continue; }
                if (char === "\\" && inString) { escapeNext = true; continue; }
                if (char === '"' && !escapeNext) { inString = !inString; continue; }
                if (!inString) {
                    if (char === "{") { if (braceCount === 0) startIndex = i; braceCount++; }
                    else if (char === "}") { braceCount--; if (braceCount === 0 && startIndex !== -1) { return { json: buffer.substring(startIndex, i + 1), remaining: buffer.substring(i + 1) }; } }
                }
            }
            return null;
        }

        function persistAssistant() {
            if (!(sessionId && assistantText)) return;
            let hist = sessions.get(sessionId) || [];
            if (resetSession) hist = [];
            if (action === 'retry_last') {
                if (hist.length && hist[hist.length - 1].role === 'assistant') {
                    hist[hist.length - 1] = { role: 'assistant', content: assistantText };
                } else {
                    hist.push({ role: 'assistant', content: assistantText });
                }
                sessions.set(sessionId, hist);
            } else if (action === 'truncate_and_retry') {
                const { keepUserCount } = body || {};
                let count = 0, keepIdx = -1;
                for (let i = 0; i < hist.length; i++) {
                    if (hist[i]?.role === 'user') { count++; if (count === keepUserCount) { keepIdx = i; break; } }
                }
                const newHist = keepIdx >= 0 ? hist.slice(0, keepIdx + 1) : hist;
                newHist.push({ role: 'assistant', content: assistantText });
                sessions.set(sessionId, newHist);
            } else if (typeof userMessage === 'string') {
                if (resetSession) {
                    hist.push({ role: 'assistant', content: assistantText });
                } else {
                    hist.push({ role: 'user', content: String(userMessage) });
                    hist.push({ role: 'assistant', content: assistantText });
                }
                sessions.set(sessionId, hist);
            }
        }

        function finish(reason) {
            if (finished) return; finished = true;
            try { buffer += decoder.decode() } catch {}
            if (buffer.trim()) processBuffer(!clientClosed);
            persistAssistant();
            if (!clientClosed) {
              try { res.end() } catch {}
            }
        }

        function handleClientClose() {
            clientClosed = true;
            try { response?.destroy?.() } catch {}
            finish('client_closed');
        }
        req.on('aborted', handleClientClose);
        res.on('close', () => { if (!finished) handleClientClose(); });

        response.on("data", chunk => {
            buffer += (() => { try { return decoder.decode(chunk, { stream: true }) } catch { return chunk.toString?.() || String(chunk) } })();
            if (!isProcessing) { isProcessing = true; processBuffer(true); isProcessing = false; }
        });

        response.on("error", (err) => {
            try {
                if (!res.headersSent && !clientClosed) res.status(500);
                if (!clientClosed) res.end('Streaming error: ' + (err?.message || 'unknown error'));
            } catch {}
        });

        response.on("end", () => finish('upstream_end'));
    } catch (err) {
        console.error("handler error", err);
        try {
            if (!res.headersSent) res.status(500);
            res.end('Streaming error: ' + (err?.message || 'unknown error'));
        } catch {}
    }
}

// Vercel will use the default Node.js runtime for Serverless Functions
