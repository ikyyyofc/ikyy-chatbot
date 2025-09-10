import axios from 'axios'
import FormData from 'form-data'
import { randomBytes } from 'node:crypto'

const BASE_URL = 'https://ai-apps.codergautam.dev'

function acakName(len = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz'
  let out = ''
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

async function autoregist() {
  const uid = randomBytes(12).toString('hex')
  const email = `gienetic${Date.now()}@nyahoo.com`

  const payload = {
    uid,
    email,
    displayName: acakName(),
    photoURL: 'https://i.pravatar.cc/150',
    appId: 'photogpt'
  }

  const res = await axios.post(`${BASE_URL}/photogpt/create-user`, payload, {
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json',
      'user-agent': 'okhttp/4.9.2'
    },
    timeout: 30000
  })

  if (res?.data?.success) return uid
  throw new Error('Register gagal: ' + JSON.stringify(res?.data || {}))
}

/**
 * Upload an image buffer and prompt to PhotoGPT and poll until ready.
 * Returns the hosted result URL (do not download bytes here to avoid huge payloads).
 */
export async function imgEditUrl(imageBuffer, prompt) {
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) throw new Error('imageBuffer required')
  const uid = await autoregist()

  function detectMime(buf) {
    try {
      if (buf[0] === 0xff && buf[1] === 0xd8) return { mime: 'image/jpeg', ext: '.jpg' }
      if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { mime: 'image/png', ext: '.png' }
      if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return { mime: 'image/gif', ext: '.gif' }
      if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: '.webp' }
    } catch {}
    return { mime: 'application/octet-stream', ext: '' }
  }
  const { mime, ext } = detectMime(imageBuffer)

  const form = new FormData()
  form.append('image', imageBuffer, { filename: 'input' + ext, contentType: mime })
  form.append('prompt', String(prompt || ''))
  form.append('userId', uid)

  const uploadRes = await axios.post(`${BASE_URL}/photogpt/generate-image`, form, {
    headers: {
      ...form.getHeaders(),
      'accept': 'application/json',
      'user-agent': 'okhttp/4.9.2',
      'accept-encoding': 'gzip'
    },
    timeout: 60000
  })

  if (!uploadRes?.data?.success) throw new Error('Upload gagal: ' + JSON.stringify(uploadRes?.data || {}))

  const { pollingUrl } = uploadRes.data
  if (!pollingUrl) throw new Error('No pollingUrl returned')

  let status = 'pending'
  let resultUrl = null

  // Poll up to ~2 minutes
  const start = Date.now()
  while (Date.now() - start < 120000) {
    const pollRes = await axios.get(pollingUrl, {
      headers: { 'accept': 'application/json', 'user-agent': 'okhttp/4.9.2' },
      timeout: 20000
    })
    status = pollRes?.data?.status
    if (status === 'Ready') {
      resultUrl = pollRes?.data?.result?.url || null
      break
    }
    await new Promise(r => setTimeout(r, 2500))
  }

  if (!resultUrl) throw new Error('Gagal mendapatkan hasil gambar.')
  return resultUrl
}

export async function fetchUrlToBuffer(url) {
  const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 45000 })
  return Buffer.from(data)
}

export function bufferFromDataUrl(dataUrl) {
  try {
    const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/)
    if (!m) return null
    return Buffer.from(m[2], 'base64')
  } catch { return null }
}
