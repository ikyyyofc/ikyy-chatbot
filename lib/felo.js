import axios from "axios";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/120.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
];

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export async function felosearchRaw(prompt) {
    const payload = {
        query: prompt,
        search_uuid: (() => { try { return randomUUID() } catch { return Math.random().toString(36).slice(2) + Date.now() } })(),
        lang: "",
        agent_lang: "en",
        search_options: { langcode: "en-US" },
        search_video: true,
        contexts_from: "google"
    };

    const headers = {
        accept: "*/*",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9",
        "content-type": "application/json",
        origin: "https://felo.ai",
        referer: "https://felo.ai/",
        "user-agent": getRandomUserAgent()
    };

    try {
        const response = await axios.post(
            "https://api.felo.ai/search/threads",
            payload,
            {
                headers,
                timeout: 30000,
                responseType: "stream"
            }
        );

        // Return readable stream dari response
        return response.data;
    } catch (err) {
        throw new Error(`Felo error: ${err.message}`);
    }
}

// Helper: parse satu blok SSE menjadi event
export function parseSSEBlock(block) {
    if (!block) return null;
    const lines = block.split("\n");
    const dataLines = [];
    let eventName = null;
    let id = null;
    let retry = null;
    for (const line of lines) {
        if (!line) continue;
        if (line.startsWith(":")) continue; // comment line
        const idx = line.indexOf(":");
        const field = idx === -1 ? line : line.slice(0, idx);
        const value = idx === -1 ? "" : line.slice(idx + 1).trimStart();
        switch (field) {
            case "data":
                dataLines.push(value);
                break;
            case "event":
                eventName = value || null;
                break;
            case "id":
                id = value || null;
                break;
            case "retry":
                retry = value || null;
                break;
            default:
                // ignore unknown fields
                break;
        }
    }
    const raw = dataLines.join("\n");
    let parsedData = raw;
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
            parsedData = JSON.parse(trimmed);
        } catch (_) {
            // keep as raw string if JSON parse fails
        }
    }
    return { event: eventName, id, retry, data: parsedData, raw };
}

// Kumpulkan semua event SSE menjadi satu hasil terstruktur
export function collectFeloStream(stream, { includeEvents = true } = {}) {
    return new Promise((resolve, reject) => {
        let buffer = "";
        const events = [];
        const byType = new Map(); // type -> array of payloads
        const summary = { latest: {} };

        function handleEvent(evt) {
            if (!evt) return;
            // Simpan semua event mentah bila diminta
            if (includeEvents) events.push(evt);

            // Jika data berupa objek dan punya field type, kelompokkan
            if (evt && evt.data && typeof evt.data === "object" && !Array.isArray(evt.data)) {
                const t = evt.data.type;
                if (t) {
                    if (!byType.has(t)) byType.set(t, []);
                    byType.get(t).push(evt.data.data !== undefined ? evt.data.data : evt.data);
                    // juga simpan latest untuk akses cepat
                    summary.latest[t] = evt.data.data !== undefined ? evt.data.data : evt.data;
                }
            }
        }

        stream.on("data", (chunk) => {
            buffer += chunk.toString("utf8").replace(/\r\n/g, "\n");
            let idx;
            while ((idx = buffer.indexOf("\n\n")) !== -1) {
                const block = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);
                const evt = parseSSEBlock(block);
                handleEvent(evt);
            }
        });

        stream.on("end", () => {
            // proses sisa buffer jika ada
            const leftover = buffer.trim();
            if (leftover) {
                const evt = parseSSEBlock(leftover);
                handleEvent(evt);
            }

            // Bangun hasil final
            const groupedByType = {};
            for (const [k, v] of byType.entries()) groupedByType[k] = v;

            const result = {
                meta: {
                    total_events: includeEvents ? events.length : undefined,
                    types: Object.keys(groupedByType)
                },
                latest_by_type: summary.latest,
                by_type: groupedByType,
                events: includeEvents ? events : undefined
            };
            resolve(result);
        });

        stream.on("error", (err) => {
            reject(err);
        });
    });
}

// Ekstrak data penting: teks jawaban akhir + sumber
export function extractImportant(aggregated) {
    const byType = aggregated?.by_type || {};

    // Kumpulkan semua kandidat teks dari berbagai tipe
    const candidates = [];
    const pushIf = (v) => {
        if (v === undefined || v === null) return;
        if (typeof v === "string") {
            const t = v.trim();
            if (t) candidates.push(t);
        }
    };

    const harvestFromObj = (obj) => {
        if (!obj || typeof obj !== "object") return;
        // Heuristik umum field teks
        pushIf(obj.text);
        pushIf(obj.delta);
        pushIf(obj.content);
        pushIf(obj.message);
        pushIf(obj.answer);
        // Jika ada html, strip tag
        if (typeof obj.html === "string") {
            const stripped = obj.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            pushIf(stripped);
        }
    };

    // Urutan prioritas tipe yang biasanya berisi jawaban
    const candidateTypes = ["answer", "message", "deduction_info"];
    for (const t of candidateTypes) {
        const arr = byType[t];
        if (Array.isArray(arr)) {
            for (const item of arr) harvestFromObj(item);
        }
    }

    // Pilih kandidat terpanjang sebagai jawaban akhir
    let text = "";
    if (candidates.length) {
        candidates.sort((a, b) => b.length - a.length);
        text = candidates[0];
    }

    // Ekstrak sumber dari final_contexts
    const sourcesSet = new Map(); // link -> source
    const ctxArr = byType["final_contexts"];
    if (Array.isArray(ctxArr)) {
        for (const ctx of ctxArr) {
            const srcs = ctx && Array.isArray(ctx.sources) ? ctx.sources : [];
            for (const s of srcs) {
                const link = s.link || s.url || s.href;
                if (!link) continue;
                if (!sourcesSet.has(link)) {
                    sourcesSet.set(link, {
                        link,
                        title: s.title || null,
                        snippet: s.snippet || null,
                        engine_name: s.engine_name || null
                    });
                }
            }
        }
    }
    const sources = Array.from(sourcesSet.values());

    return { text, sources };
}

// Convenience: one-shot helper untuk langsung mendapatkan ringkasan teks + sumber
export async function felosearch(query, { includeEvents = false } = {}) {
    const stream = await felosearchRaw(query);
    const aggregated = await collectFeloStream(stream, { includeEvents });
    const { text, sources } = extractImportant(aggregated);
    return { text, sources, aggregated };
}

// --- CLI runner (hanya berjalan jika file dieksekusi langsung) ---
const isDirectRun = (() => {
    try { return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href } catch { return false }
})();
if (isDirectRun) {
    (async () => {
        const promptArg = process.argv.slice(2).join(" ");
        const prompt = promptArg || "kamu menggunakan model ai apa";
        try {
            const { text, sources } = await felosearch(prompt, { includeEvents: false });
            // Cetak hanya data penting: teks + sumber
            console.log(JSON.stringify({ query: prompt, text, sources }, null, 2));
        } catch (err) {
            console.error("Terjadi error saat mengumpulkan stream:", err?.message || err);
            process.exit(1);
        }
    })();
}
