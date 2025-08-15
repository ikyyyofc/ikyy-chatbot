# Chat UI (Vertex/OpenAI)

UI chat minimal (React + Vite) dengan backend Express/Serverless yang terhubung ke Vertex AI (Firebase Vertex API) atau OpenAI dan mendukung streaming respons.

## Setup

1. Install dependencies: `npm install`
2. Start dev: `npm run dev`
   - Web UI: http://localhost:5173
   - API: http://localhost:3001 (hanya endpoint streaming)

## Notes

- Server menambahkan system prompt singkat dalam Bahasa Indonesia.
- Default provider: OpenAI. Anda bisa ganti ke Vertex via `config.js` atau env.
- Streaming respons tersedia di endpoint: `/api/chat/stream`.

## Konfigurasi AI

- Pilih penyedia model di `config.js`:
- `MODEL_PROVIDER`: `vertex` (default) atau `openai`.
  - `OPENAI_MODEL`: nama model OpenAI (default: `gpt-4.1`).
- Autentikasi Vertex kini menggunakan environment variable: set `FIREBASE_VERTEX_API_KEY` (atau `GOOGLE_API_KEY`). Kredensial tidak lagi ditanam di kode.
- Untuk OpenAI, set environment variable: `OPENAI_API_KEY`.
  - Model default untuk Chat Completions disetel ke `gpt-4.1`.
- Pengaturan yang masih bisa diubah via env (opsional) ada di `config.js`:
  - `SYSTEM_PROMPT`: pesan sistem yang ditambahkan ke awal percakapan.
  - `GREETING_INSTRUCTION`: instruksi untuk sapaan awal.
  - `PORT`: port server lokal.

### Internet Tools (OpenAI)

- Mode OpenAI menggunakan satu custom tool untuk info real-time via API eksternal:
  - `realtime_info(query)`: memanggil `https://anabot.my.id/api/ai/perplexity` dengan param `prompt` dan `apikey`, lalu mengembalikan ringkasan dan daftar sumber.
- Konfigurasi di `.env` atau `config.js`:
  - `REALTIME_API_URL` (default: `https://anabot.my.id/api/ai/perplexity`)
  - `REALTIME_API_KEY` (default: `freeApikey`)
- Model akan memanggil tool otomatis (tool_choice `auto`) dan mengutip URL sumber pada jawaban akhir.

Helper:
- `withSystemPrompt(messages)`: menambahkan system prompt secara konsisten.

## Deploy ke Vercel

Repo ini siap dideploy ke Vercel dengan Serverless Functions untuk API streaming.

Termasuk:
- `api/chat/stream.js`: Node Serverless Function pengganti endpoint streaming.
- `vercel.json`: konfigurasi build dasar.

Langkah:
1. Push repo ke GitHub (atau GitLab/Bitbucket).
2. Buat Project Vercel dan import repo.
   - Framework Preset: “Vite”.
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Deploy (Vercel akan mendeteksi folder `api/` dan membuat endpoint `/api/*`).

Catatan:
- Di production, React app memanggil `/api/chat/stream` pada origin yang sama, jadi tidak perlu CORS.
- Server Express lokal (`server/index.mjs`) fokus untuk dev/self-hosting; Vercel menggunakan fungsi di `api/`.

## Credits

- ikyyofc
