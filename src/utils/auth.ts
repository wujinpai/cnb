const KEY = 'imgbed_token'
const USER_KEY = 'imgbed_user'

export interface SessionUser {
  uid: number
  name: string
  avatar: string
}

export function getToken(): string {
  try {
    return sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

export function setToken(token: string, remember: boolean, user?: SessionUser) {
  try {
    if (remember) localStorage.setItem(KEY, token)
    else localStorage.removeItem(KEY)
    sessionStorage.setItem(KEY, token)
    if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch { /* ignore */ }
}

export function getUser(): SessionUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as SessionUser) : null
  } catch {
    return null
  }
}

export function clearToken() {
  try {
    sessionStorage.removeItem(KEY)
    sessionStorage.removeItem(USER_KEY)
    localStorage.removeItem(KEY)
  } catch { /* ignore */ }
}

/** 本地预判 token 是否过期（过期视为未登录） */
export function isTokenLive(token?: string): boolean {
  const t = token || getToken()
  if (!t) return false
  try {
    let payload = t.split('.')[0]
    // base64url → base64：补填充
    payload = payload.replace(/-/g, '+').replace(/_/g, '/')
    while (payload.length % 4) payload += '='
    const data = JSON.parse(atob(payload))
    return typeof data.exp === 'number' && data.exp > Date.now()
  } catch {
    return false
  }
}
