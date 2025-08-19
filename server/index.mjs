import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { randomBytes } from 'crypto'
import { withSystemPrompt } from '../config.js'
import { felosearch } from '../lib/felo.js'
import { chat } from '../lib/provider.js'

const app = express()
const port = process.env.PORT || 7860
// In-memory session store: maps sessionId -> [{role, content}, ...]
const sessions = new Map()
// Track active upstream streams to allow external stop (useful behind proxies)
// Key: `${sessionId}:${clientStreamId}` -> { response, res }
const activeStreams = new Map()
// External stop flags: `${sessionId}:${clientStreamId}` -> true
const externalStops = new Map()

app.use(cors())
// Parse JSON request bodies for API routes with a generous limit
app.use(express.json({ limit: process.env.BODY_LIMIT || '50mb' }))

// Credit header for API responses only
app.use((req, res, next) => {
  if (req.path && req.path.startsWith('/api')) {
    res.setHeader('X-Credit', 'ikyyofc')
  }
  next()
})

// Server ini hanya untuk API (frontend dilayani oleh Vite saat dev)

// Root endpoint untuk health check sederhana
function randomAlphaNum(len = 20) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', health: randomAlphaNum(20) })
})

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

// Streaming endpoint: streams text chunks directly
app.post('/api/chat/stream', async (req, res) => {
  try {
    const { messages, sessionId, userMessage, resetSession, action, clientStreamId } = req.body || {}
    const streamKey = (sessionId && clientStreamId) ? `${sessionId}:${clientStreamId}` : null
    // Prepare tracking record early; will fill finish/persist later
    const record = streamKey ? { response: null, res, finish: null, persist: null } : null

    // disable buffering for proxies, enable chunked
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    if (typeof res.flushHeaders === 'function') res.flushHeaders()

    // Optional: reset session
    if (sessionId && resetSession) {
      sessions.set(sessionId, [])
    }

    let buildHistory = null

    if (sessionId && action === 'retry_last') {
      // Regenerate last assistant message using stored session
      const hist = sessions.get(sessionId) || []
      // find last user index before last assistant
      const lastAssistantIdx = [...hist].map(m => m.role).lastIndexOf('assistant')
      const base = lastAssistantIdx > 0 ? hist.slice(0, lastAssistantIdx) : hist
      const lastUserIdx = [...base].map(m => m.role).lastIndexOf('user')
      if (lastUserIdx === -1) {
        res.status(400)
        return res.end('No user message to retry from')
      }
      buildHistory = base.slice(0, lastUserIdx + 1)
    } else if (sessionId && action === 'truncate_and_retry') {
      const { keepUserCount } = req.body || {}
      const hist = sessions.get(sessionId) || []
      let count = 0
      let keepIdx = -1
      for (let i = 0; i < hist.length; i++) {
        if (hist[i]?.role === 'user') {
          count++
          if (count === keepUserCount) {
            keepIdx = i
            break
          }
        }
      }
      if (keepIdx === -1) {
        res.status(400)
        return res.end('Invalid keepUserCount')
      }
      buildHistory = hist.slice(0, keepIdx + 1)
    } else if (sessionId && typeof userMessage === 'string') {
      const hist = sessions.get(sessionId) || []
      buildHistory = [...hist, { role: 'user', content: String(userMessage) }]
    } else if (Array.isArray(messages) && messages.length > 0) {
      buildHistory = messages
    } else {
      res.status(400)
      return res.end('messages array or sessionId+userMessage is required')
    }

    // Augment: inject current datetime and realtime context for time-sensitive queries
    function nowContext({ tz = 'Asia/Jakarta', locale = 'id-ID' } = {}) {
      try {
        const now = new Date()
        const iso = now.toISOString()
        const fmt = new Intl.DateTimeFormat(locale, {
          timeZone: tz,
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        })
        const formatted = fmt.format(now)
        return { formatted, iso, tz, locale }
      } catch {
        const now = new Date()
        return { formatted: now.toString(), iso: now.toISOString(), tz: 'UTC', locale: 'id-ID' }
      }
    }

    function isTimeSensitive(qRaw) {
      if (!qRaw) return false
      const q = String(qRaw).toLowerCase()
      const triggers = [
        'kapan', 'rilis', 'dirilis', 'tanggal rilis', 'peluncuran', 'launch', 'release',
        'hari ini', 'sekarang', 'today', 'now', 'kemarin', 'besok', 'tahun ini', 'bulan ini', 'minggu ini',
        'jam berapa', 'tanggal berapa', 'hari apa', 'waktu saat ini',
        'status', 'terkini', 'update', 'latest', 'baru',
        'harga', 'kurs', 'nilai tukar', 'cuaca', 'weather', 'skor', 'hasil pertandingan', 'gempa', 'bencana',
        'ipo', 'dividen', 'earnings', 'inflasi', 'suku bunga', 'pemilu', 'election'
      ]
      return triggers.some(t => q.includes(t))
    }

    async function buildRealtimeSystemMessage(q) {
      const now = nowContext()
      let summary = ''
      let links = []
      try {
        const { text, sources } = await felosearch(q)
        summary = (text || '').trim()
        links = Array.isArray(sources) ? sources.map(s => s?.link).filter(Boolean) : []
      } catch (e) {
        summary = ''
        links = []
      }
      const topLinks = links.slice(0, 5)
      const parts = []
      parts.push(`[REAL-TIME CONTEXT]`)
      parts.push(`Tanggal/waktu server saat ini: ${now.formatted} (ISO: ${now.iso}, TZ: ${now.tz})`)
      parts.push(`Pertanyaan pengguna: "${String(q || '').slice(0, 500)}"`)
      if (summary) parts.push(`Ringkasan realtime: ${summary.slice(0, 1500)}`)
      if (topLinks.length) parts.push(`Sumber: ${topLinks.join(', ')}`)
      parts.push(`Instruksi: Jawab berdasarkan konteks di atas. Jangan menebak untuk fakta time-sensitive. Jika ragu atau sumber tidak memadai, jelaskan keterbatasan. Sertakan catatan "Diperbarui per: ${now.formatted}" dan cantumkan URL relevan di akhir.`)
      return { role: 'system', content: parts.join('\n') }
    }

    // Determine last user query text
    let lastUserText = null
    if (typeof userMessage === 'string' && userMessage.trim()) {
      lastUserText = String(userMessage)
    } else if (Array.isArray(buildHistory)) {
      for (let i = buildHistory.length - 1; i >= 0; i--) {
        if (buildHistory[i]?.role === 'user' && typeof buildHistory[i]?.content === 'string') {
          lastUserText = buildHistory[i].content
          break
        }
      }
    }

    // Always inject current datetime context to reduce temporal hallucination
    const now = nowContext()
    const datetimeMsg = { role: 'system', content: `Waktu saat ini: ${now.formatted} (ISO: ${now.iso}, TZ: ${now.tz}). Gunakan waktu ini untuk semua perhitungan terkait tanggal/waktu.` }

    // Optionally add realtime summary for time-sensitive queries
    const augmented = [...buildHistory]
    augmented.unshift(datetimeMsg)
    if (isTimeSensitive(lastUserText)) {
      try {
        const rt = await buildRealtimeSystemMessage(lastUserText)
        augmented.unshift(rt)
      } catch {}
    }

    const finalMessages = withSystemPrompt(augmented)

    const response = await chat(finalMessages);
    if (record) { record.response = response }

    let buffer = '';
    let isProcessing = false;
    let assistantText = '';
    // Track only what has been delivered (written) to client
    let deliveredText = '';
    const decoder = new TextDecoder('utf-8');
    let clientClosed = false;
    let finished = false;
    let persisted = false;

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
              try { res.write(Buffer.from(text, 'utf8')) } catch { try { res.write(text) } catch {}
              }
              // Count only text that was actually written to client
              deliveredText += text;
            }
          }
        } catch (e) {
          // ignore parse errors for partials
        }
      }
    }

    function extractCompleteJSON(buffer) {
      let inString = false;
      let escapeNext = false;
      let braceCount = 0;
      let startIndex = -1;
      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];
        if (escapeNext) { escapeNext = false; continue }
        if (char === '\\' && inString) { escapeNext = true; continue }
        if (char === '"' && !escapeNext) { inString = !inString; continue }
        if (!inString) {
          if (char === '{') { if (braceCount === 0) startIndex = i; braceCount++ }
          else if (char === '}') { braceCount--; if (braceCount === 0 && startIndex !== -1) { return { json: buffer.substring(startIndex, i + 1), remaining: buffer.substring(i + 1) } } }
        }
      }
      return null
    }

    function persistAssistant() {
      if (persisted) return; // guard against double persist
      // Decide which text to persist: delivered-only for client/external stop; full for normal end
      const shouldUseDelivered = (!!streamKey && (clientClosed || externalStops.get(streamKey)))
      const textToPersist = shouldUseDelivered ? deliveredText : assistantText
      if (!(sessionId && textToPersist)) return;
      let hist = sessions.get(sessionId) || [];
      if (resetSession) hist = [];
      if (action === 'retry_last') {
        if (hist.length && hist[hist.length - 1].role === 'assistant') {
          hist[hist.length - 1] = { role: 'assistant', content: textToPersist };
        } else {
          hist.push({ role: 'assistant', content: textToPersist });
        }
        sessions.set(sessionId, hist);
      } else if (action === 'truncate_and_retry') {
        const { keepUserCount } = req.body || {};
        let count = 0, keepIdx = -1;
        for (let i = 0; i < hist.length; i++) {
          if (hist[i]?.role === 'user') { count++; if (count === keepUserCount) { keepIdx = i; break } }
        }
        const newHist = keepIdx >= 0 ? hist.slice(0, keepIdx + 1) : hist;
        newHist.push({ role: 'assistant', content: textToPersist });
        sessions.set(sessionId, newHist);
      } else if (typeof userMessage === 'string') {
        if (resetSession) {
          hist.push({ role: 'assistant', content: textToPersist });
        } else {
          hist.push({ role: 'user', content: String(userMessage) });
          hist.push({ role: 'assistant', content: textToPersist });
        }
        sessions.set(sessionId, hist);
      }
      persisted = true;
    }

    function finish(reason) {
      if (finished) return; finished = true;
      try { buffer += decoder.decode() } catch {}
      // If externally stopped (e.g., via /api/chat/stop), treat as client closed
      if (streamKey && externalStops.get(streamKey)) {
        clientClosed = true
      }
      if (buffer.trim()) {
        // do not write to res when finishing due to client close
        processBuffer(!clientClosed);
      }
      persistAssistant();
      if (!clientClosed) {
        try { res.end() } catch {}
      }
      // cleanup tracking maps
      if (streamKey) {
        activeStreams.delete(streamKey)
        externalStops.delete(streamKey)
      }
    }

    // Fill tracking record once finish/persist exist
    if (record && streamKey) {
      record.finish = finish
      record.persist = persistAssistant
      activeStreams.set(streamKey, record)
      // If a stop signal arrived before we registered this stream,
      // immediately finalize to avoid persisting a full answer later.
      if (externalStops.get(streamKey)) {
        try { record.persist?.() } catch {}
        try { response?.destroy?.() } catch {}
        try { finish('preexisting_external_stop') } catch {}
        return
      }
    }

    // Wire client disconnect to abort upstream and finalize with partial text
    function handleClientClose() {
      clientClosed = true;
      try { response?.destroy?.() } catch {}
      finish('client_closed');
    }
    req.on('aborted', handleClientClose);
    res.on('close', () => {
      // close also fires after 'end'; guard with flags
      if (!finished) handleClientClose();
    });

    response.on("data", (chunk) => {
      buffer += (() => { try { return decoder.decode(chunk, { stream: true }) } catch { return chunk.toString?.() || String(chunk) } })();
      if (!isProcessing) { isProcessing = true; processBuffer(true); isProcessing = false; }
    });

    response.on('error', (err) => {
      try {
        if (!res.headersSent && !clientClosed) res.status(500)
        if (!clientClosed) res.end('Streaming error: ' + (err?.message || 'unknown error'))
      } catch {}
    })

    response.on("end", () => finish('upstream_end'))
  } catch (err) {
    console.error('stream error', err)
    try {
      if (!res.headersSent) res.status(500)
      res.end('Streaming error: ' + (err?.message || 'unknown error'))
    } catch {}
  }
})

// External stop endpoint: allows frontend to signal server to stop a running stream
// Useful when client connection abort does not propagate through proxies (e.g., Vercel rewrite)
app.post('/api/chat/stop', (req, res) => {
  try {
    const { sessionId, clientStreamId } = req.body || {}
    if (!sessionId || !clientStreamId) {
      res.status(400)
      return res.json({ ok: false, error: 'sessionId and clientStreamId are required' })
    }
    const key = `${sessionId}:${clientStreamId}`
    externalStops.set(key, true)
    const active = activeStreams.get(key)
    // Persist whatever we have immediately and finalize
    try { active?.persist?.() } catch {}
    try { active?.response?.destroy?.() } catch {}
    try { active?.finish?.('external_stop') } catch {}
    // do not touch active.res; original handler will clean up
    return res.json({ ok: true })
  } catch (e) {
    try {
      res.status(500).json({ ok: false, error: String(e?.message || 'stop failed') })
    } catch {}
  }
})


app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`)
})
