import express from 'express'
import multer from 'multer'
import { reply } from './_reply'
import {
  uploadToCnb,
  downloadFromCnb,
  deleteFromCnb,
  detectImageMime,
  detectVideoMime,
  signAuthToken,
  signSsoState,
  verifySsoState,
  verifySsoCode,
  fixMulterFilename,
  sanitizeFilename,
  buildPublicUrl,
  extractFileKey,
  isValidFileKey,
  isSsoConfigured,
  normalizeNoteProUrl,
  MAX_UPLOAD_MB,
  MAX_VIDEO_MB,
  UPLOAD_RATE_LIMIT,
  ALLOWED_MIMES,
  ALLOWED_IMAGE_MIMES,
} from './_utils'
import { authMiddleware, rateLimiter, securityHeaders } from './_middleware'

const app = express()
app.use(express.json({ limit: '1mb' }))
app.use(securityHeaders)
// 防御性剥离 /api 前缀：生产 EdgeOne 以 dest /api/$1 挂载（应用内路径不含前缀），
// 但某些环境可能原样透传；统一剥离后路由在两种情况下都工作
app.use((req, _res, next) => {
  if (req.url === '/api') req.url = '/'
  else if (req.url.startsWith('/api/')) req.url = req.url.slice(4)
  next()
})

// ---------- 环境变量启动校验 ----------
for (const key of ['CNB_REPO', 'CNB_TOKEN', 'AUTH_SECRET']) {
  if (!process.env[key]) console.error(`[Config] 缺少环境变量 ${key}：相关功能不可用，请在 EdgeOne 控制台补齐后重新部署`)
}
if (!process.env.BASE_IMG_URL) console.error('[Config] 缺少环境变量 BASE_IMG_URL：上传返回的链接域名将为空')
if (!isSsoConfigured()) console.error('[Config] 未配置 NOTE_PRO_URL / SSO_SECRET：登录不可用')

const baseUrl = () => {
  let b = process.env.BASE_IMG_URL || ''
  if (b && !b.endsWith('/')) b += '/'
  return b
}
const noteproUrl = () => normalizeNoteProUrl(process.env.NOTE_PRO_URL || '')

// ============================================================
// 认证：NotePro SSO
// ============================================================

app.get('/auth/config', (_req, res) => {
  res.json(reply(0, 'ok', { ssoConfigured: isSsoConfigured() }))
})

// 必应每日一图（720p）：登录页背景
app.get('/bing-wallpaper', async (_req, res) => {
  try {
    const r = await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN', {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    const d = (await r.json()) as { images?: { urlbase?: string; title?: string; copyright?: string }[] }
    const img = d?.images?.[0]
    if (!img?.urlbase) throw new Error('必应返回为空')
    // urlbase 如 /th?id=OHR.xxx，拼 720p 参数
    const url = `https://www.bing.com${img.urlbase}_1366x768.jpg`
    res.json(reply(0, 'ok', { url, title: img.title || '', copyright: img.copyright || '' }))
  } catch (e: any) {
    res.status(500).json(reply(1, `获取壁纸失败：${e?.message || ''}`, null))
  }
})

// 前端点击"用己素账号登录"时调用，返回 NotePro 授权页地址
app.get('/auth/login-url', (req, res) => {
  try {
    if (!isSsoConfigured()) return res.status(500).json(reply(1, '未配置 NotePro 登录', null))
    const remember = req.query.remember === '1'
    const state = signSsoState(remember)
    const redirectUri = `${baseUrl()}api/auth/callback`
    const url = `${noteproUrl()}/?sso=1&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`
    res.json(reply(0, 'ok', { url }))
  } catch (e) {
    res.status(500).json(reply(1, (e as Error).message, null))
  }
})

// NotePro 回调：code + state → 验码换身份 → 签发本站 token → 跳回前端
app.get('/auth/callback', async (req, res) => {
  const failPage = (msg: string) =>
    res.status(400).send(`<meta charset="utf-8"><title>登录失败</title><p>登录失败：${msg}</p><p><a href="/login">返回重试</a></p>`)
  const code = String(req.query.code || '')
  const state = String(req.query.state || '')
  if (!code || !state) return failPage('缺少授权参数')
  const st = verifySsoState(state)
  if (!st.ok) return failPage('state 校验失败，请重新登录')
  try {
    const u = await verifySsoCode(code)
    // 图床仅限 NotePro 管理员登录，普通会员不签发 token，跳回登录页提示
    if (u.role !== 'admin') {
      const sep = baseUrl().includes('?') ? '&' : '?'
      return res.redirect(`${baseUrl()}login${sep}error=${encodeURIComponent('非管理员无法登录图床')}`)
    }
    const token = signAuthToken(u.id, u.nickname || u.username, '', st.remember, u.role)
    const sep = baseUrl().includes('?') ? '&' : '?'
    // token 经 URL 交给前端写入 localStorage（一次性，阅后即焚）
    res.redirect(`${baseUrl()}login${sep}token=${encodeURIComponent(token)}&name=${encodeURIComponent(u.nickname || u.username)}`)
  } catch (e) {
    failPage((e as Error).message)
  }
})

app.get('/auth/me', authMiddleware, (req, res) => {
  const u = req.user!
  res.json(reply(0, 'ok', { user: { uid: u.uid, name: u.name, avatar: u.avatar || '' } }))
})

app.post('/auth/logout', (_req, res) => {
  // 无状态 token，服务端无需操作，前端自行清除
  res.json(reply(0, 'ok', null))
})

// ============================================================
// 上传
// ============================================================

const upload = multer({
  limits: {
    fileSize: Math.max(MAX_UPLOAD_MB, MAX_VIDEO_MB) * 1024 * 1024,
    files: 2, // 主文件 + 缩略图
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true)
    else cb(new Error('只允许上传图片（JPG/PNG/GIF/WebP）或视频（MP4/WebM）'))
  },
})

app.post(
  '/upload',
  rateLimiter(UPLOAD_RATE_LIMIT, 60000),
  authMiddleware,
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  async (req: any, res: any) => {
    try {
      const files = req.files as { [k: string]: Express.Multer.File[] } | undefined
      const mainFile = files?.file?.[0]
      const thumbFile = files?.thumbnail?.[0]
      if (!mainFile) return res.status(400).json(reply(1, '未上传文件', null))

      const isVideo = mainFile.mimetype.startsWith('video/')
      const limitMb = isVideo ? MAX_VIDEO_MB : MAX_UPLOAD_MB
      if (mainFile.size > limitMb * 1024 * 1024) {
        return res.status(400).json(reply(1, `文件超过 ${limitMb}MB 上限`, null))
      }

      // magic bytes 校验（Content-Type 可伪造）
      const realMime = isVideo ? detectVideoMime(mainFile.buffer) : detectImageMime(mainFile.buffer)
      if (!realMime) return res.status(400).json(reply(1, isVideo ? '文件内容不是有效的视频' : '文件内容不是有效的图片', null))
      if (thumbFile && !detectImageMime(thumbFile.buffer)) {
        return res.status(400).json(reply(1, '缩略图内容不是有效的图片', null))
      }

      // 时间戳前缀防同名覆盖
      const stamp = Date.now().toString(36)
      const mainName = `${stamp}-${sanitizeFilename(fixMulterFilename(mainFile.originalname))}`
      const main = await uploadToCnb(mainFile.buffer, mainName)

      let thumbnailUrl: string | null = null
      let thumbnailPath: string | null = null
      if (thumbFile) {
        const thumbName = `${stamp}-thumb-${sanitizeFilename(fixMulterFilename(thumbFile.originalname))}`
        const th = await uploadToCnb(thumbFile.buffer, thumbName)
        thumbnailPath = th.path
        thumbnailUrl = buildPublicUrl(th.path)
      }

      res.json(reply(0, '上传成功', {
        url: buildPublicUrl(main.path),
        path: main.path,
        thumbnailUrl,
        thumbnailPath,
        size: mainFile.size,
        type: realMime,
        isVideo,
      }))
    } catch (err: any) {
      console.error('上传失败:', err?.message)
      res.status(500).json(reply(1, `上传失败：${err?.message || '请稍后重试'}`, null))
    }
  },
)

// ============================================================
// 文件代理（公开直链）：/api/f/{fileKey}
// 附件下载需带 CNB token，故全部经服务端代理；支持 Range（视频拖进度）
// ============================================================

const ALLOWED_PROXY_EXT = /\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i

async function proxyFile(req: any, res: any) {
  try {
    let key = ''
    const m = (req.path || req.url || '').match(/\/f\/(.+)/)
    if (m) key = m[1].split(/[?#]/)[0]
    try { key = decodeURIComponent(key) } catch { /* 保留原样 */ }
    if (!isValidFileKey(key)) return res.status(400).json(reply(1, '非法的文件路径', null))
    if (!ALLOWED_PROXY_EXT.test(key)) return res.status(403).json(reply(1, '不支持的文件类型', null))

    const range = typeof req.headers.range === 'string' ? req.headers.range : undefined
    const upstream = await downloadFromCnb(key, range)

    const ct = upstream.headers.get('content-type') || 'application/octet-stream'
    if (!ct.startsWith('image/') && !ct.startsWith('video/')) {
      await upstream.arrayBuffer().catch(() => {})
      return res.status(502).json(reply(1, '上游返回了非图片/视频内容', null))
    }

    res.status(upstream.status)
    res.setHeader('Content-Type', ct)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    const len = upstream.headers.get('content-length')
    if (len) res.setHeader('Content-Length', len)
    const cr = upstream.headers.get('content-range')
    if (cr) res.setHeader('Content-Range', cr)
    const etag = upstream.headers.get('etag')
    if (etag) res.setHeader('ETag', etag)

    if (req.method === 'HEAD') {
      await upstream.arrayBuffer().catch(() => {})
      return res.end()
    }
    if (upstream.body) {
      const reader = upstream.body.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (!res.write(value)) await new Promise<void>((r) => res.once('drain', r))
        }
        res.end()
      } catch {
        try { await reader.cancel() } catch { /* ignore */ }
        if (!res.headersSent) return res.status(502).json(reply(1, '代理传输失败', null))
        res.end()
      } finally {
        reader.releaseLock()
      }
    } else {
      const ab = await upstream.arrayBuffer()
      res.send(Buffer.from(ab))
    }
  } catch (e: any) {
    console.error('[Proxy]', e?.message)
    if (!res.headersSent) res.status(502).json(reply(1, `文件获取失败：${e?.message || ''}`, null))
    else res.end()
  }
}

app.use((req, res, next) => {
  if (req.path.startsWith('/f/') || req.url.startsWith('/f/')) {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Range')
      return res.status(204).end()
    }
    return rateLimiter(300, 60000)(req, res, () => proxyFile(req, res))
  }
  next()
})

// ============================================================
// 删除源文件
// ============================================================

app.post('/file/delete', authMiddleware, rateLimiter(30, 60000), async (req: any, res: any) => {
  const paths = Array.isArray(req.body?.paths) ? req.body.paths.filter((p: unknown) => typeof p === 'string') : []
  const urls = Array.isArray(req.body?.urls) ? req.body.urls.filter((u: unknown) => typeof u === 'string') : []
  const keys = new Set<string>()
  for (const p of paths) { const k = extractFileKey(p) || (isValidFileKey(p) ? p : null); if (k) keys.add(k) }
  for (const u of urls) { const k = extractFileKey(u); if (k) keys.add(k) }
  if (keys.size === 0) return res.status(400).json(reply(1, '缺少 paths 或 urls 参数', null))
  if (keys.size > 50) return res.status(400).json(reply(1, '单次最多删除 50 个文件', null))
  const ok: string[] = []
  const failed: string[] = []
  await Promise.all([...keys].map(async (k) => {
    if (await deleteFromCnb(k)) ok.push(k)
    else failed.push(k)
  }))
  res.json(reply(0, '处理完成', { ok, failed }))
})

// ============================================================
// 站点配置（前端用）
// ============================================================

app.get('/config', authMiddleware, (_req, res) => {
  res.json(reply(0, 'ok', {
    maxUploadMb: MAX_UPLOAD_MB,
    maxVideoMb: MAX_VIDEO_MB,
    baseUrl: baseUrl(),
  }))
})

app.get('/', (_req, res) => {
  res.json(reply(0, 'imgbed api', null))
})

// 未知 /api 路由兜底
app.use((_req: any, res: any) => {
  res.status(404).json(reply(1, '接口不存在', null))
})

// 错误处理（multer 限流等走 JSON）
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('API 错误:', err?.message || err)
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json(reply(1, `文件超过 ${Math.max(MAX_UPLOAD_MB, MAX_VIDEO_MB)}MB 上限`, null))
    }
    return res.status(400).json(reply(1, '文件上传失败', null))
  }
  if (err?.message === '只允许上传图片（JPG/PNG/GIF/WebP）或视频（MP4/WebM）') {
    return res.status(400).json(reply(1, err.message, null))
  }
  res.status(500).json(reply(1, '请求失败，请稍后重试', null))
})

export default app
