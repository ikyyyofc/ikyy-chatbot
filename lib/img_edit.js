import axios from 'axios'
import { createHash } from 'node:crypto'

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
