import { Router } from 'express'

const router = Router()

// 简化版登录/验证路由 - 直接验证密码
router.post('/login', (req, res) => {
  const uploadPassword = process.env.UPLOAD_PASSWORD

  console.log('[Auth] Login attempt - UPLOAD_PASSWORD configured:', !!uploadPassword)

  if (!uploadPassword) {
    console.error('[Auth] UPLOAD_PASSWORD not configured')
    return res.status(400).json({ code: 400, msg: '服务器未配置上传密码' })
  }

  const { password } = req.body as { password?: string }

  console.log('[Auth] Password provided:', !!password)

  if (!password || password !== uploadPassword) {
    console.error('[Auth] Password mismatch')
    return res.status(401).json({ code: 401, msg: '密码错误' })
  }

  console.log('[Auth] Login successful')
  res.json({ code: 0, msg: '登录成功', data: { success: true } })
})

// 验证路由
router.post('/verify', (req, res) => {
  const uploadPassword = process.env.UPLOAD_PASSWORD

  console.log('[Auth] Verify attempt - UPLOAD_PASSWORD configured:', !!uploadPassword)

  if (!uploadPassword) {
    console.error('[Auth] UPLOAD_PASSWORD not configured')
    return res.status(400).json({ code: 400, msg: '服务器未配置上传密码' })
  }

  const { password } = req.body as { password?: string }

  console.log('[Auth] Verify password provided:', !!password)

  if (!password || password !== uploadPassword) {
    console.error('[Auth] Verify password mismatch')
    return res.status(401).json({ code: 401, msg: '密码错误' })
  }

  console.log('[Auth] Verify successful')
  res.json({ code: 0, msg: '登录成功', data: { success: true } })
})

export default router
