import crypto from 'node:crypto'

// ============================================================
// 认证 token（HMAC-SHA256，NotePro SSO 换发）
// payload: { uid, name, avatar, role, exp, nonce }
// ============================================================

const AUTH_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const REMEMBER_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function getAuthSecret(): string {
  const s = process.env.AUTH_SECRET || ''
  if (!s) throw new Error('缺少环境变量 AUTH_SECRET')
  return s
}

export interface AuthPayload {
  uid: number
  name: string
  avatar?: string
  role: string
  exp: number
  nonce: string
}

/** 签发访问 token（SSO 登录成功后调用，仅管理员） */
export function signAuthToken(uid: number, name: string, avatar = '', remember = false, role = ''): string {
  const ttl = remember ? REMEMBER_TOKEN_TTL_MS : AUTH_TOKEN_TTL_MS
  const payload = Buffer.from(
    JSON.stringify({ uid, name, avatar, role, exp: Date.now() + ttl, nonce: crypto.randomUUID() }),
  ).toString('base64url')
  const sig = crypto.createHmac('sha256', getAuthSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/** 校验 token，成功返回 payload，失败返回 null */
export function verifyAuthToken(token: string): AuthPayload | null {
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  try {
    const expected = crypto.createHmac('sha256', getAuthSecret()).update(payload).digest()
    const sigBuf = Buffer.from(sig, 'base64url')
    if (sigBuf.length !== expected.length || !crypto.timingSafeEqual(sigBuf, expected)) return null
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as AuthPayload
    if (typeof data.exp !== 'number' || data.exp <= Date.now()) return null
    if (typeof data.uid !== 'number') return null
    // 图床仅限 NotePro 管理员：非管理员（含旧版无 role 的 token）一律拒绝
    if (data.role !== 'admin') return null
    return data
  } catch {
    return null
  }
}

// ============================================================
// SSO state（防 CSRF）：签名时间戳，无需服务端存储
// ============================================================

const SSO_STATE_TTL_MS = 10 * 60 * 1000

export function signSsoState(remember = false): string {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SSO_STATE_TTL_MS, nonce: crypto.randomUUID(), remember })).toString('base64url')
  const sig = crypto.createHmac('sha256', getAuthSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifySsoState(state: string): { ok: boolean; remember: boolean } {
  const [payload, sig] = (state || '').split('.')
  if (!payload || !sig) return { ok: false, remember: false }
  try {
    const expected = crypto.createHmac('sha256', getAuthSecret()).update(payload).digest()
    const sigBuf = Buffer.from(sig, 'base64url')
    if (sigBuf.length !== expected.length || !crypto.timingSafeEqual(sigBuf, expected)) return { ok: false, remember: false }
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp: number; remember?: boolean }
    if (typeof data.exp !== 'number' || data.exp <= Date.now()) return { ok: false, remember: false }
    return { ok: true, remember: data.remember === true }
  } catch {
    return { ok: false, remember: false }
  }
}

/** 规范化 NotePro 地址：修常见手误（https// 缺冒号），必须 http(s) 开头 */
export function normalizeNoteProUrl(raw: string): string {
  let u = (raw || '').trim().replace(/\/+$/, '')
  // 修手误：https//host 或 http//host → https://host
  u = u.replace(/^https\/\//i, 'https://').replace(/^http\/\//i, 'http://')
  if (!/^https?:\/\//i.test(u)) throw new Error('NOTE_PRO_URL 格式不正确，应为 https:// 开头的完整地址')
  return u
}

/** 用一次性授权码向 NotePro 换身份 */
export async function verifySsoCode(code: string): Promise<{ id: number; username: string; nickname: string; role: string }> {
  const noteproUrl = normalizeNoteProUrl(process.env.NOTE_PRO_URL || '')
  const secret = process.env.SSO_SECRET || ''
  if (!noteproUrl || !secret) throw new Error('未配置 NOTE_PRO_URL 或 SSO_SECRET')
  const r = await fetch(`${noteproUrl}/api/sso/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, secret }),
    signal: AbortSignal.timeout(15000),
  })
  const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; user?: { id: number; username: string; nickname: string; role: string } }
  if (!d.ok || !d.user) throw new Error(d.error || 'NotePro 验证失败')
  return { id: d.user.id, username: d.user.username, nickname: d.user.nickname || d.user.username, role: d.user.role || '' }
}

// ============================================================
// 文件类型校验（magic bytes，防伪造 Content-Type）
// ============================================================

export function detectImageMime(buf: Buffer): string | null {
  if (!buf || buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'image/png'
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif'
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp'
  return null
}

/** 视频 magic bytes：MP4/MOV 的 ftyp box（偏移 4），WebM 的 EBML 头 */
export function detectVideoMime(buf: Buffer): string | null {
  if (!buf || buf.length < 12) return null
  // ftyp at offset 4 → mp4 (also mov; we only allow mp4 extension so treat as mp4)
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'video/mp4'
  // WebM/Matroska: 1A 45 DF A3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm'
  return null
}

export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
export const ALLOWED_VIDEO_MIMES = ['video/mp4', 'video/webm']
export const ALLOWED_MIMES = [...ALLOWED_IMAGE_MIMES, ...ALLOWED_VIDEO_MIMES]

// ============================================================
// CNB 原生附件 API（单存储桶）
// Token 权限：repo-notes:rw（上传）+ repo-code:r（下载）+ repo-manage:rw（删除/列表）
// ============================================================

const CNB_API = 'https://api.cnb.cool'
const CNB_TIMEOUT_MS = 30_000

function cnbCfg(): { repo: string; token: string } {
  const repo = (process.env.CNB_REPO || '').trim().replace(/\/+$/, '')
  const token = process.env.CNB_TOKEN || ''
  if (!repo || !token) throw new Error('缺少环境变量 CNB_REPO / CNB_TOKEN')
  return { repo, token }
}

const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

/** cnbPath 形如 /org/repo/-/files/xxx/yyy，取 -/files/ 之后的部分作为 fileKey */
export function fileKeyOf(cnbPath: string): string {
  const i = cnbPath.indexOf('-/files/')
  const k = i >= 0 ? cnbPath.slice(i + '-/files/'.length) : cnbPath
  return k.replace(/^\/+/, '')
}

async function cnbFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const { repo, token } = cnbCfg()
  const url = `${CNB_API}/${repo}${path.startsWith('/') ? path : '/' + path}`
  let r: Response
  try {
    r = await fetch(url, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', ...(opts.headers || {}) },
      signal: AbortSignal.timeout(CNB_TIMEOUT_MS),
    })
  } catch (e) {
    throw new Error(`连接 api.cnb.cool 失败：${(e as Error).message}`)
  }
  const text = await r.text()
  let data: any = {}
  try { data = JSON.parse(text) } catch { /* 非 JSON */ }
  if (!r.ok) {
    const msg = data?.errmsg || data?.message || data?.msg || data?.error || text.slice(0, 200) || `HTTP ${r.status}`
    throw new Error(`CNB ${r.status}：${msg}`)
  }
  return data
}

/** 上传文件到 CNB：取上传地址 → PUT 直传（无需确认）。返回 fileKey（-/files/ 之后的部分） */
export async function uploadToCnb(fileBuffer: Buffer, fileName: string): Promise<{ path: string; size: number }> {
  const meta: any = await cnbFetch('/-/upload/files', {
    method: 'POST',
    body: JSON.stringify({ name: fileName, size: fileBuffer.length }),
  })
  const uploadUrl: string = meta.upload_url ?? meta.uploadUrl
  const cnbPath: string = meta.assets?.path ?? meta.path ?? meta.data?.path ?? ''
  if (!uploadUrl || !cnbPath) throw new Error('CNB 获取上传地址失败')
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(fileBuffer),
    signal: AbortSignal.timeout(CNB_TIMEOUT_MS),
  })
  if (!put.ok) throw new Error(`CNB 上传失败：HTTP ${put.status}`)
  return { path: fileKeyOf(cnbPath), size: fileBuffer.length }
}

/** 从 CNB 下载（代理）：支持 Range。返回 fetch Response */
export async function downloadFromCnb(fileKey: string, range?: string): Promise<Response> {
  const { repo, token } = cnbCfg()
  let r: Response
  try {
    r = await fetch(`${CNB_API}/${repo}/-/files/${encPath(fileKey)}`, {
      headers: { Authorization: `Bearer ${token}`, ...(range ? { Range: range } : {}) },
      signal: AbortSignal.timeout(CNB_TIMEOUT_MS),
    })
  } catch (e) {
    throw new Error(`连接 api.cnb.cool 失败：${(e as Error).message}`)
  }
  if (!r.ok && r.status !== 206) {
    const t = await r.text().catch(() => '')
    throw new Error(`CNB 下载失败 ${r.status} ${t.slice(0, 120)}`)
  }
  return r
}

/** 删除 CNB 文件（404 视为成功） */
export async function deleteFromCnb(fileKey: string): Promise<boolean> {
  const { repo, token } = cnbCfg()
  try {
    const r = await fetch(`${CNB_API}/${repo}/-/files/${encPath(fileKey)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(CNB_TIMEOUT_MS),
    })
    return r.ok || r.status === 404
  } catch {
    return false
  }
}

// ============================================================
// 文件名与 URL 工具
// ============================================================

/** 修复 multer 把 UTF-8 文件名按 latin1 解码导致的中文乱码 */
export function fixMulterFilename(name: string): string {
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8')
    if (decoded && !decoded.includes('�')) return decoded
  } catch { /* ignore */ }
  return name
}

/** 文件名安全过滤：防路径遍历；保留 Unicode 字母数字（含中文） */
export function sanitizeFilename(filename: string): string {
  const cleaned = filename.replace(/[^\p{L}\p{N}._-]/gu, '_').replace(/\.{2,}/g, '.')
  return (cleaned || 'file').slice(0, 100)
}

/** 拼接对外直链：BASE_IMG_URL + /api/f/ + fileKey */
export function buildPublicUrl(fileKey: string): string {
  let base = process.env.BASE_IMG_URL || ''
  if (base.endsWith('/')) base = base.slice(0, -1)
  return `${base}/api/f/${fileKey}`
}

/** fileKey 白名单：防 .. 遍历 */
export function isValidFileKey(p: string): boolean {
  if (!p || p.length > 512) return false
  if (p.startsWith('/') || p.includes('\\') || p.includes('..')) return false
  return /^[\p{L}\p{N}._\-/]+$/u.test(p)
}

/** 从记录 URL 提取 fileKey：兼容 /api/f/ 代理链接与原生 -/files/ 链接 */
export function extractFileKey(recordUrl: string): string | null {
  for (const marker of ['/api/f/', '-/files/']) {
    const idx = recordUrl.indexOf(marker)
    if (idx >= 0) {
      const p = recordUrl.slice(idx + marker.length).split(/[?#]/)[0]
      if (p && isValidFileKey(p)) return p
    }
  }
  return null
}

// ============================================================
// 配置
// ============================================================

/** 图片单文件上限（MB），默认 10，最大 100 */
export const MAX_UPLOAD_MB = (() => {
  const n = Number(process.env.MAX_UPLOAD_MB)
  return Number.isFinite(n) && n > 0 ? Math.min(100, Math.round(n)) : 10
})()

/** 视频单文件上限（MB），默认 50，最大 500 */
export const MAX_VIDEO_MB = (() => {
  const n = Number(process.env.MAX_VIDEO_MB)
  return Number.isFinite(n) && n > 0 ? Math.min(500, Math.round(n)) : 50
})()

/** 上传限流（次/分钟/IP），默认 60 */
export const UPLOAD_RATE_LIMIT = (() => {
  const n = Number(process.env.UPLOAD_RATE_LIMIT)
  return Number.isFinite(n) && n > 0 ? Math.min(600, Math.round(n)) : 60
})()

export function isSsoConfigured(): boolean {
  try {
    normalizeNoteProUrl(process.env.NOTE_PRO_URL || '')
  } catch {
    return false
  }
  return !!process.env.SSO_SECRET
}
