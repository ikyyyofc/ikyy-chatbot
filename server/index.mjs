import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { withSystemPrompt } from '../config.js'
import { chat } from '../lib/provider.js'

const app = express()
const port = process.env.PORT || 3001
// In-memory session store: maps sessionId -> [{role, content}, ...]
const sessions = new Map()

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

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

// Streaming endpoint: streams text chunks directly
app.post('/api/chat/stream', async (req, res) => {
  try {
    const { messages, sessionId, userMessage, resetSession, action } = req.body || {}

    // disable buffering for proxies, enable chunked
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
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

    const finalMessages = withSystemPrompt(buildHistory)

    const response = await chat(finalMessages);
        
        let buffer = '';
        let isProcessing = false;
        let assistantText = '';
        const decoder = new TextDecoder('utf-8');

        response.on("data", (chunk) => {
            // Gunakan TextDecoder streaming agar multi-byte UTF-8 tidak pecah di batas chunk
            buffer += decoder.decode(chunk, { stream: true });
            if (!isProcessing) {
                isProcessing = true;
                processBuffer();
                isProcessing = false;
            }
        });
        
        response.on('error', (err) => {
          try {
            if (!res.headersSent) res.status(500)
            res.end('Streaming error: ' + (err?.message || 'unknown error'))
          } catch {}
        })

        function processBuffer() {
            while (true) {
                const result = extractCompleteJSON(buffer);
                if (!result) break;

                buffer = result.remaining;
                try {
                    const obj = JSON.parse(result.json);
                    if (obj.candidates?.[0]?.content?.parts?.[0]?.text) {
                        const text = obj.candidates[0].content.parts[0].text
                        assistantText += text
                        try { res.write(Buffer.from(text, 'utf8')) } catch { res.write(text) }
                    }
                } catch (e) {
                    // Hanya log error parsing jika dalam mode debug
                    // console.error("Error parsing JSON:", e);
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
                
                // Handle escape sequences
                if (escapeNext) {
                    escapeNext = false;
                    continue;
                }
                
                // Deteksi escape character
                if (char === '\\' && inString) {
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
                    if (char === '{') {
                        if (braceCount === 0) startIndex = i;
                        braceCount++;
                    } 
                    else if (char === '}') {
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
          // Flush decoder untuk menangkap sisa byte parsial terakhir
          try { buffer += decoder.decode() } catch {}
          if (buffer.trim()) {
            processBuffer()
          }
          // Persist to session store if using session mode
          if (sessionId && assistantText) {
            let hist = sessions.get(sessionId) || []
            if (resetSession) hist = []
            if (action === 'retry_last') {
              // Replace last assistant message with new one
              // Ensure last item is assistant; if not, append
              if (hist.length && hist[hist.length - 1].role === 'assistant') {
                hist[hist.length - 1] = { role: 'assistant', content: assistantText }
              } else {
                hist.push({ role: 'assistant', content: assistantText })
              }
              sessions.set(sessionId, hist)
            } else if (action === 'truncate_and_retry') {
              const { keepUserCount } = req.body || {}
              // rebuild truncated hist based on count and append assistant
              let count = 0
              let keepIdx = -1
              for (let i = 0; i < hist.length; i++) {
                if (hist[i]?.role === 'user') {
                  count++
                  if (count === keepUserCount) { keepIdx = i; break }
                }
              }
              const newHist = keepIdx >= 0 ? hist.slice(0, keepIdx + 1) : hist
              newHist.push({ role: 'assistant', content: assistantText })
              sessions.set(sessionId, newHist)
            } else if (typeof userMessage === 'string') {
              if (resetSession) {
                // Greeting: do not record synthetic user prompt; only assistant
                hist.push({ role: 'assistant', content: assistantText })
              } else {
                hist.push({ role: 'user', content: String(userMessage) })
                hist.push({ role: 'assistant', content: assistantText })
              }
              sessions.set(sessionId, hist)
            }
          }
          res.end()
        })
  } catch (err) {
    console.error('stream error', err)
    try {
      if (!res.headersSent) res.status(500)
      res.end('Streaming error: ' + (err?.message || 'unknown error'))
    } catch {}
  }
})


app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`)
})
