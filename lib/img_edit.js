import axios from 'axios'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

class EasemateClient {
  constructor(deviceUUId = Date.now()) {
    this.deviceUUId = deviceUUId
    this.appKey = 'TB'
    this.productCode = '888'
    this.baseURL = 'https://api.easemate.ai'
  }

  sortParams(e) {
    return Object.keys(e)
      .sort()
      .reduce((r, o) => {
        const a = e[o]
        if (Array.isArray(a)) {
          r[o] = a.map((i) => (typeof i === 'object' && i !== null ? this.sortParams(i) : i))
        } else if (typeof a === 'object' && a !== null) {
          r[o] = this.sortParams(a)
        } else {
          r[o] = a
        }
        return r
      }, {})
  }

  serializeQuery(obj, prefix = '') {
    const pairs = []
    const buildParams = (key, value) => {
      if (value === null || value === undefined) return
      if (typeof value === 'object' && !Array.isArray(value)) {
        for (const subKey in value) buildParams(`${key}[${subKey}]`, value[subKey])
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => buildParams(`${key}[${index}]`, item))
      } else {
        pairs.push(`${key}=${value}`)
      }
    }
    for (const k in obj) buildParams(prefix ? `${prefix}[${k}]` : k, obj[k])
    return pairs.join('&')
  }

  getSigns(paramsObj, prefix) {
    const ts = Math.round(Date.now() / 1e3)
    let baseStr
    if (paramsObj && Object.keys(paramsObj).length) {
      const sorted = this.sortParams(paramsObj)
      sorted.appKey = this.appKey
      sorted.timestamp = ts
      const serialized = this.serializeQuery(sorted)
      baseStr = `${prefix}${serialized}${prefix}`
    } else {
      baseStr = `${prefix}&appKey=${this.appKey}&timestamp=${ts}${prefix}`
    }
    return {
      sign: createHash('md5').update(baseStr).digest('hex'),
      timestamp: `${ts}`
    }
  }

  getHeaders(signObj) {
    return {
      'Accept-Language': 'ms-MY,ms;q=0.9,en-US;q=0.8,en;q=0.7,id;q=0.6',
      Connection: 'keep-alive',
      Origin: 'https://www.easemate.ai',
      Referer: 'https://www.easemate.ai/',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36',
      accept: 'application/json',
      'client-name': 'chatpdf',
      'client-type': 'web',
      'content-type': 'application/json;charset=UTF-8',
      'device-identifier': this.deviceUUId,
      'device-platform': 'Android,Chrome',
      'device-type': 'web',
      'device-uuid': this.deviceUUId,
      lang: 'en',
      language: 'en-US',
      'product-code': this.productCode,
      'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      site: 'www.easemate.ai',
      sign: signObj.sign,
      timestamp: signObj.timestamp
    }
  }

  async uploadImage(buffer) {
    const deviceUUId = this.deviceUUId
    const data = {
      key: `pro/${deviceUUId}/${deviceUUId}.png`,
      value: deviceUUId.toString()
    }
    const Sign = this.getSigns(data, deviceUUId)

    const res = await axios.post(`${this.baseURL}/api2/task/query_upload_url`, data, { headers: this.getHeaders(Sign), timeout: 60000 })

    // Upload raw bytes to pre-signed URL
    await axios.put(res.data.data.upload_url, buffer, { headers: { 'content-type': 'application/octet-stream' }, timeout: 60000 })
    return { ...res.data.data, key: data.key }
  }

  async queryPermission() {
    const Sign = this.getSigns({}, this.deviceUUId)
    const res = await axios.post(`${this.baseURL}/api2/task/query_permission`, {}, { headers: this.getHeaders(Sign), timeout: 30000 })
    return res.data
  }

  async createImageTask(uploadInfo, prompt, buffer) {
    const data2 = {
      model_id: 10041,
      operation_info: { id: 419, operation: 'IMAGE_GENERATION' },
      object_info: [
        {
          img_info: {
            s3_name: uploadInfo.key,
            s3_url: uploadInfo.download_url,
            size: buffer.length,
            origin_name: 'input.png'
          }
        }
      ],
      parameters: JSON.stringify({ prompt, file_type: 'jpeg', aspectRatio: '3:2' })
    }

    const Sign = this.getSigns(data2, this.deviceUUId)
    const res = await axios.post(`${this.baseURL}/api2/async/create_generate_image`, data2, { headers: this.getHeaders(Sign), timeout: 60000 })
    return res.data.data
  }

  async pollTask(taskId, task_type, interval = 5000, maxMs = 180000) {
    const start = Date.now()
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const data3 = { taskId, task_type }
      const Sign = this.getSigns(data3, this.deviceUUId)
      const res = await axios.post(`${this.baseURL}/api2/async/query_generate_image`, data3, { headers: this.getHeaders(Sign), timeout: 30000 })
      const status = res.data?.data?.status
      if (status && status !== 'RUNNING') return res.data.data
      if (status === 'FAILED') throw new Error(res.data?.data?.msg || 'FAILED')
      if (Date.now() - start > maxMs) throw new Error('timeout')
      await new Promise(r => setTimeout(r, interval))
    }
  }
}

function extractFirstUrl(obj) {
  const seen = new Set()
  const stack = [obj]
  while (stack.length) {
    const v = stack.shift()
    if (!v || typeof v !== 'object') continue
    if (seen.has(v)) continue
    seen.add(v)
    for (const k of Object.keys(v)) {
      const val = v[k]
      if (typeof val === 'string') {
        if (/^https?:\/\//i.test(val)) return val
      } else if (val && typeof val === 'object') {
        stack.push(val)
      }
    }
  }
  return null
}

/**
 * Edit an image using Easemate API and return the result URL.
 */
export async function imgEditUrl(imageBuffer, prompt) {
  const DEBUG = String(process.env.DEBUG || '').toLowerCase() === 'true'
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) throw new Error('imageBuffer required')
  const client = new EasemateClient()

  try { await client.queryPermission().catch(() => null) } catch {}

  const uploadInfo = await client.uploadImage(imageBuffer)
  if (DEBUG) {
    try { console.log('[edit:easemate:upload_ok]', JSON.stringify({ key: uploadInfo?.key })) } catch {}
  }
  const task = await client.createImageTask(uploadInfo, String(prompt || ''), imageBuffer)
  const taskId = task?.taskId || task?.task_id || task?.id
  const taskType = task?.task_type || task?.taskType || 'IMAGE_GENERATION'
  if (!taskId) throw new Error('no_task_id')
  const finalData = await client.pollTask(taskId, taskType)
  const url = extractFirstUrl(finalData)
  if (!url) throw new Error('no_result_url')
  if (DEBUG) {
    try { console.log('[edit:easemate:done]', JSON.stringify({ url })) } catch {}
  }
  return url
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

// --- Nekolabs integration (Gemini Nano Banana) ---

function uploadsDirPath() {
  const dir = path.join(process.cwd(), 'uploads')
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  return dir
}

function publicBaseUrl() {
  const base = (process.env.PUBLIC_BASE_URL || '').trim()
  if (base) return base.replace(/\/$/, '')
  const port = process.env.PORT || 7860
  return `http://localhost:${port}`
}

async function saveImageToUploads(buf, contentType) {
  const dir = uploadsDirPath()
  // Detect ext
  let ext = '.png'
  try {
    if (typeof contentType === 'string') {
      if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg'
      else if (contentType.includes('webp')) ext = '.webp'
      else if (contentType.includes('gif')) ext = '.gif'
    } else if (buf && buf.length > 1 && buf[0] === 0xff && buf[1] === 0xd8) {
      ext = '.jpg'
    } else if (buf && buf.length > 3 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      ext = '.png'
    }
  } catch {}
  const name = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`
  const filePath = path.join(dir, name)
  await fsp.writeFile(filePath, buf)
  return `${publicBaseUrl()}/uploads/${name}`
}

function extractFirstHttpUrlDeep(obj) {
  try {
    const seen = new Set()
    const stack = [obj]
    while (stack.length) {
      const v = stack.pop()
      if (!v || typeof v !== 'object') continue
      if (seen.has(v)) continue
      seen.add(v)
      for (const k of Object.keys(v)) {
        const val = v[k]
        if (typeof val === 'string' && /^https?:\/\//i.test(val)) return val
        if (val && typeof val === 'object') stack.push(val)
      }
    }
  } catch {}
  return ''
}

/**
 * Call Nekolabs Gemini image edit API with prompt + imageUrl and return a usable URL.
 * Falls back to saving binary responses into /uploads.
 */
export async function nekoEditUrl(imageUrl, prompt) {
  const DEBUG = String(process.env.DEBUG || '').toLowerCase() === 'true'
  if (!imageUrl) throw new Error('image_url_required')
  const api = 'https://api.nekolabs.my.id/ai/gemini/nano-banana'
  const url = `${api}?prompt=${encodeURIComponent(String(prompt || ''))}&imageUrl=${encodeURIComponent(String(imageUrl))}`
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 300000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    validateStatus: () => true
  })
  const status = resp.status || 0
  const ct = String(resp.headers?.['content-type'] || '')
  const buf = Buffer.from(resp.data || [])
  if (status >= 400) {
    let detail = ''
    try { detail = buf.toString('utf8').slice(0, 200) } catch {}
    const msg = `nekolabs_http_${status}${detail ? ':' : ''} ${detail}`
    if (DEBUG) console.error('[nekolabs:error]', msg)
    throw new Error(msg)
  }
  // If JSON/text, try extract a link
  if (/application\/(json|ld\+json)|text\//i.test(ct)) {
    let txt = ''
    try { txt = buf.toString('utf8') } catch {}
    let data
    try { data = JSON.parse(txt) } catch { data = { text: txt } }
    // Common fields or deep search
    let outUrl = (
      data?.data?.result?.imageUrl ||
      data?.data?.result?.url ||
      data?.result ||
      data?.image ||
      data?.url ||
      ''
    )
    if (!/^https?:\/\//i.test(outUrl)) {
      outUrl = extractFirstHttpUrlDeep(data)
    }
    if (!outUrl) throw new Error('nekolabs_no_image_link')
    return outUrl
  }
  // If binary image, save locally and return our URL
  if (/^image\//i.test(ct) || buf?.length > 0) {
    return await saveImageToUploads(buf, ct)
  }
  throw new Error('nekolabs_unknown_response')
}

/**
 * Generate an image via Nekolabs Flux Dev endpoint.
 * Returns a public URL string. If response is binary, saves to /uploads and returns server URL.
 */
export async function nekoGenUrl(prompt, ratio = '1:1') {
  const DEBUG = String(process.env.DEBUG || '').toLowerCase() === 'true'
  const api = 'https://api.nekolabs.my.id/ai/flux/dev'
  const ar = String(ratio || '1:1').trim()
  const url = `${api}?prompt=${encodeURIComponent(String(prompt || ''))}&ratio=${encodeURIComponent(ar)}`
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 300000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    validateStatus: () => true
  })
  const status = resp.status || 0
  const ct = String(resp.headers?.['content-type'] || '')
  const buf = Buffer.from(resp.data || [])
  if (status >= 400) {
    let detail = ''
    try { detail = buf.toString('utf8').slice(0, 200) } catch {}
    const msg = `nekolabs_http_${status}${detail ? ':' : ''} ${detail}`
    if (DEBUG) console.error('[nekolabs:gen:error]', msg)
    throw new Error(msg)
  }
  if (/application\/(json|ld\+json)|text\//i.test(ct)) {
    let txt = ''
    try { txt = buf.toString('utf8') } catch {}
    let data
    try { data = JSON.parse(txt) } catch { data = { text: txt } }
    let outUrl = (
      data?.data?.result?.imageUrl ||
      data?.data?.result?.url ||
      data?.result ||
      data?.image ||
      data?.url ||
      ''
    )
    if (!/^https?:\/\//i.test(outUrl)) outUrl = extractFirstHttpUrlDeep(data)
    if (!outUrl) throw new Error('nekolabs_no_image_link')
    return outUrl
  }
  // Binary image
  if (/^image\//i.test(ct) || buf?.length > 0) return await saveImageToUploads(buf, ct)
  throw new Error('nekolabs_unknown_response')
}
