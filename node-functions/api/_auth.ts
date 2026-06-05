import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

function getSecret(): string {
  const secret = process.env.UPLOAD_PASSWORD
  if (!secret) {
    throw new Error('UPLOAD_PASSWORD 未配置')
  }
  return secret
}

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, msg: '未授权' })
  }
  const token = authHeader.slice(7)
  try {
    jwt.verify(token, getSecret())
    next()
  } catch {
    return res.status(401).json({ code: 401, msg: 'token 无效或已过期' })
  }
}

export { getSecret, authMiddleware }
