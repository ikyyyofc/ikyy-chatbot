import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { withSystemPrompt } from '../config.js'
import { chat } from '../lib/vertex.js'

const app = express()
const port = process.env.PORT || 3001

app.use(cors())
// Parse JSON request bodies for API routes
app.use(express.json())

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
    const { messages } = req.body || {}
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400)
      return res.end('messages array is required')
    }

    // disable buffering for proxies, enable chunked
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    if (typeof res.flushHeaders === 'function') res.flushHeaders()

    const finalMessages = withSystemPrompt(messages)

    const response = await chat(finalMessages);
        
        let buffer = '';
        let isProcessing = false;

        response.on("data", (chunk) => {
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
          if (buffer.trim()) {
            processBuffer()
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
