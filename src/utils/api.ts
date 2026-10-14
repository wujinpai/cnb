import axios from 'axios'
import { getToken, clearToken } from '@/composables/useAuthState'

const api = axios.create({ timeout: 60000 })

// node 函数
export const nodeApi = axios.create({ baseURL: '/api', timeout: 120000 })
// KV 边缘函数
export const kvApi = axios.create({ baseURL: '/image-records', timeout: 30000 })

for (const inst of [nodeApi, kvApi]) {
  inst.interceptors.request.use((config) => {
    const t = getToken()
    if (t) config.headers.Authorization = `Bearer ${t}`
    return config
  })
  inst.interceptors.response.use(
    (res) => {
      // 统一解包 { code, msg, data }
      const d = res.data
      if (d && typeof d === 'object' && 'code' in d) {
        if (d.code !== 0) {
          const err: any = new Error(d.msg || '请求失败')
          err.code = d.code
          err.data = d.data
          throw err
        }
        return d.data
      }
      return d
    },
    (err) => {
      if (err?.response?.status === 401) {
        clearToken()
        if (!location.pathname.startsWith('/login') && !location.pathname.startsWith('/s/')) {
          location.href = '/login'
        }
      }
      const msg = err?.response?.data?.msg || err?.message || '网络错误'
      const e: any = new Error(msg)
      e.status = err?.response?.status
      throw e
    },
  )
}

// 公开读取（分享页用，不带 token；只解包 {code,msg,data}，不处理 401）
export const publicKv = axios.create({ baseURL: '/image-records', timeout: 30000 })
publicKv.interceptors.response.use(
  (res) => {
    const d = res.data
    if (d && typeof d === 'object' && 'code' in d) {
      if (d.code !== 0) {
        const err: any = new Error(d.msg || '请求失败')
        err.code = d.code
        throw err
      }
      return d.data
    }
    return d
  },
  (err) => {
    const e: any = new Error(err?.response?.data?.msg || err?.message || '网络错误')
    e.status = err?.response?.status
    throw e
  },
)

export { api }
