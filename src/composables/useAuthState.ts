import { ref, computed } from 'vue'
import { getToken as _getToken, getUser as _getUser, setToken as _setToken, clearToken as _clearToken, isTokenLive, type SessionUser } from '@/utils/auth'

// 响应式登录态：登录/退出时主动 bump 版本号，触发所有依赖的 computed 重新计算
const authVersion = ref(0)

export function getToken(): string {
  authVersion.value // 建立响应式依赖
  return _getToken()
}

export function getUser(): SessionUser | null {
  authVersion.value
  return _getUser()
}

export function setToken(token: string, remember: boolean, user?: SessionUser) {
  _setToken(token, remember, user)
  authVersion.value++
}

export function clearToken() {
  _clearToken()
  authVersion.value++
}

export const isAuthed = computed(() => {
  const t = getToken()
  return !!t && isTokenLive(t)
})

export const authedUser = computed(() => getUser())
