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

- Mode OpenAI menggunakan satu tool real-time `realtime_info(query)` yang kini DIKUNCI ke library Felo (`lib/felo.js`). Tool ini melakukan penelusuran via felo.ai dan mengembalikan ringkasan + daftar sumber (URL).
- Tidak ada lagi panggilan ke HTTP API eksternal untuk real-time; konfigurasi `REALTIME_API_URL`/`REALTIME_API_KEY` diabaikan.
- Model memanggil tool otomatis (`tool_choice: auto`) dan diminta mengutip URL sumber di jawaban akhir.

Helper:
- `withSystemPrompt(messages)`: menambahkan system prompt secara konsisten.

### Image Generation (ai4chat)

- Mode OpenAI punya tool: `generate_image({ prompt, aspect_ratio, size })`.
  - Menggunakan scraping endpoint `ai4chat` untuk bikin gambar beneran.
  - Prioritas parameter: `aspect_ratio` (contoh: `1:1`, `16:9`, `2:3`, dst). Jika kosong, akan ditebak dari `size` (mis. `1024x1024` -> `1:1`).
  - Output berupa URL gambar; model akan render via Markdown, contoh:
    - `![kucing lucu](https://.../image.png)`

Catatan:
- Butuh dependensi `user-agents` (sudah ditambahkan). Jalankan `npm install` setelah pull.
- Fitur aktif bila `MODEL_PROVIDER=openai`.
- Di provider Vertex saat ini belum ada bridging function-calling custom.
- UI menampilkan status "Membuat gambar…" saat tool berjalan, jadi user tahu proses lagi jalan.
- Model otomatis mengonversi permintaan user ke prompt Bahasa Inggris sebelum memanggil tool (akurasi instruksi lebih baik). Caption/jawaban tetap Bahasa Indonesia.

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
