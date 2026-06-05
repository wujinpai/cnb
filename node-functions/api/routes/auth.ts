import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { getSecret } from '../_auth'

const router = Router()

router.post('/login', (req, res) => {
  const uploadPassword = process.env.UPLOAD_PASSWORD

  if (!uploadPassword) {
    return res.status(400).json({ code: 400, msg: '服务器未配置上传密码' })
  }

  const { password } = req.body as { password?: string }

  if (!password || password !== uploadPassword) {
    return res.status(401).json({ code: 401, msg: '密码错误' })
  }

  const token = jwt.sign({}, getSecret(), { expiresIn: '7d' })
  res.json({ code: 0, msg: '登录成功', data: { token } })
})

export default router
