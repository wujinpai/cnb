import express from 'express'
import { uploadToCnb, signUpload } from './_utils'
import { reply } from './_reply'
import multer from 'multer'

const UPLOAD_PASSWORD = process.env.UPLOAD_PASSWORD || 'cnbpro123'

const _log = (msg: string, ...args: any[]) => {
  process.stdout.write('[' + new Date().toISOString() + '] ' + msg + ' ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n')
}

const upload = multer({
  limits: {
    fileSize: 50 * 1024 * 1024,
    fieldSize: 50 * 1024 * 1024,
  },
})
const app = express()
app.use(express.json({ limit: '10mb' }))

let RECORDS_KEY = 'upload_records'
const MAX_RECORDS = 500

function getKV(): any {
  const g = globalThis as any
  return g.KV || g.env?.KV || null
}

function getBaseUrl(): string {
  const g = globalThis as any
  const env = g.env || {}
  const baseUrl = env.BASE_IMG_URL || process.env.BASE_IMG_URL || ''
  return baseUrl
}

async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  
  try {
    const result = await fn()
    return result
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(errorMsg)
    }
    throw e
  } finally {
    clearTimeout(timeoutId)
  }
}

async function getRecords(): Promise<any[]> {
  const _kv = getKV()
  if (!_kv) return []
  try {
    const data = await withTimeout(
      () => _kv.get(RECORDS_KEY),
      5000,
      'KV读取超时'
    )
    if (!data) return []
    if (typeof data === 'string') {
      try {
        return JSON.parse(data)
      } catch {
        _log('getRecords: invalid JSON, returning empty')
        return []
      }
    }
    return Array.isArray(data) ? data : []
  } catch (e: any) {
    _log('KV getRecords error: ' + (e.message || String(e)))
    return []
  }
}

async function addRecord(record: any): Promise<void> {
  const _kv = getKV()
  if (!_kv) {
    _log('addRecord: KV not available')
    throw new Error('KV 存储未绑定，请在 EdgeOne 控制台中绑定 KV 存储')
  }
  try {
    const records = await getRecords()
    const newRecords = Array.isArray(records) ? records : []
    
    newRecords.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      ...record,
      createdAt: new Date().toISOString(),
    })
    
    if (newRecords.length > MAX_RECORDS) {
      newRecords.length = MAX_RECORDS
    }
    
    const jsonStr = JSON.stringify(newRecords)
    
    await withTimeout(
      () => _kv.put(RECORDS_KEY, jsonStr),
      5000,
      'KV写入超时'
    )
    
    _log('Record saved, total: ' + newRecords.length + ', url: ' + record.url)
  } catch (e: any) {
    _log('KV addRecord error: ' + (e.message || String(e)))
    throw e
  }
}

async function removeRecord(id: string): Promise<void> {
  const _kv = getKV()
  if (!_kv) return
  try {
    const records = await getRecords()
    const filtered = records.filter((r: any) => r.id !== id)
    await _kv.put(RECORDS_KEY, JSON.stringify(filtered))
    _log('Record removed: ' + id)
  } catch (e: any) {
    _log('KV removeRecord error: ' + (e.message || String(e)))
  }
}

app.use((req, _res, next) => {
  _log(req.method + ' ' + req.url)
  next()
})

app.post('/auth/verify', async (req, res) => {
  try {
    const { password } = req.body
    if (!password) {
      return res.status(400).json(reply(1, '请输入密码'))
    }
    if (password !== UPLOAD_PASSWORD) {
      return res.status(403).json(reply(1, '密码错误'))
    }
    res.json(reply(0, '验证成功'))
  } catch (e: any) {
    _log('auth/verify error: ' + e.message)
    res.status(500).json(reply(1, '验证失败'))
  }
})

app.get('/upload/sign', async (req, res) => {
  try {
    const fileName = req.query.name as string
    const fileSize = parseInt(req.query.size as string, 10)
    if (!fileName || isNaN(fileSize)) {
      return res.status(400).json(reply(1, '缺少 name 或 size 参数'))
    }
    const result = await signUpload({ fileName, fileSize })
    res.json(reply(0, 'ok', result))
  } catch (e: any) {
    _log('signUpload error: ' + e.message)
    res.status(500).json(reply(1, '获取上传签名失败', { message: e.message }))
  }
})

app.post('/upload/save', async (req, res) => {
  try {
    const { url, thumbnailUrl, name, size, type } = req.body
    _log('upload/save received:', { url, name, type })
    if (!url || !name) {
      return res.status(400).json(reply(1, '缺少 url 或 name'))
    }
    try {
      await addRecord({ url, thumbnailUrl: thumbnailUrl || '', name, size: size || 0, type: type || 'image/png' })
    } catch (saveErr: any) {
      _log('upload/save record failed (non-blocking): ' + saveErr.message)
      return res.json(reply(0, '记录保存失败，但文件已上传', { saved: false, warning: saveErr.message }))
    }
    res.json(reply(0, '保存成功', { saved: true }))
  } catch (e: any) {
    _log('upload/save error: ' + e.message)
    res.status(500).json(reply(1, '保存记录失败', { message: e.message }))
  }
})

app.post('/upload/img', (req, res, next) => {
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FIELD_SIZE' ? 413 : 400
      return res.status(status).json(reply(1, '文件超出限制: ' + err.message, ''))
    }
    next()
  })
}, async (req, res) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] }
    if (!files || !files.file) {
      return res.status(400).json(reply(1, '未上传文件', ''))
    }

    const mainFile = files.file?.[0]
    const thumbnailFile = files.thumbnail?.[0]

    const mainResult = await uploadToCnb({
      fileBuffer: mainFile.buffer,
      fileName: mainFile.originalname,
    })

    const baseUrl = getBaseUrl()
    const mainImgPath = extractImagePath(mainResult.url)
    const mainUrl = baseUrl + 'img-api/' + mainImgPath

    let thumbnailUrl = null
    let thumbnailAssets = null
    let thumbnailSafeName = null

    if (thumbnailFile) {
      const thumbnailResult = await uploadToCnb({
        fileBuffer: thumbnailFile.buffer,
        fileName: thumbnailFile.originalname,
      })
      const thumbnailImgPath = extractImagePath(thumbnailResult.url)
      thumbnailUrl = baseUrl + 'img-api/' + thumbnailImgPath
      thumbnailAssets = thumbnailResult.assets
      thumbnailSafeName = thumbnailResult.safeFileName
    }

    const responseData = {
      url: mainUrl,
      thumbnailUrl: thumbnailUrl,
      assets: mainResult.assets,
      thumbnailAssets: thumbnailAssets,
      hasThumbnail: !!thumbnailFile,
      safeFileName: mainResult.safeFileName,
      thumbnailSafeFileName: thumbnailSafeName,
    }

    await addRecord({
      url: mainUrl,
      thumbnailUrl: thumbnailUrl || '',
      name: mainResult.safeFileName,
      size: mainFile.size,
      type: mainFile.mimetype,
    })
    _log('记录保存成功: ' + mainUrl)

    res.json(reply(0, '上传成功', responseData))
  } catch (err: unknown) {
    const msg = (err as Error).message || '未知错误'
    let detail = ''
    const responseData = (err as { response?: { data?: unknown } }).response?.data
    if (responseData && typeof responseData === 'string') {
      detail = responseData
    } else if (responseData && Buffer.isBuffer(responseData)) {
      detail = responseData.toString('utf8')
    } else if (responseData instanceof ArrayBuffer) {
      detail = Buffer.from(responseData).toString('utf8')
    }
    _log('上传失败: ' + msg + ' ' + detail)
    res.status(500).json(
      reply(1, '上传失败', {
        message: msg,
        detail: detail || undefined,
      }),
    )
  }
})

app.get('/records', async (_req, res) => {
  try {
    const records = await getRecords()
    res.json(reply(0, 'ok', records))
  } catch (e: any) {
    _log('get records error: ' + e.message)
    res.status(500).json(reply(1, '获取记录失败', { message: e.message }))
  }
})

app.delete('/records/:id', async (req, res) => {
  try {
    await removeRecord(req.params.id)
    res.json(reply(0, '删除成功'))
  } catch (e: any) {
    res.status(500).json(reply(1, '删除失败'))
  }
})

function extractImagePath(url: string): string {
  if (url.includes('-/imgs/')) {
    return url.split('-/imgs/')[1]
  } else if (url.includes('-/files/')) {
    return url.split('-/files/')[1]
  }
  return url
}

export async function onRequest(context: any) {
  const g = globalThis as any
  if (context.env) {
    g.env = context.env
  }
  if (context.env?.KV) {
    g.KV = context.env.KV
  }
  return app.handle(context.request)
}

export default app
