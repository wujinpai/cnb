import type { NextFunction, Request, Response } from 'express'
import { verifyAuthToken, type AuthPayload } from './_utils'
import { reply } from './_reply'

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthPayload
  }
}

const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

/** 获取可信客户端 IP：优先 EdgeOne 注入的 EO-Client-IP */
export function getClientIp(req: Request): string {
  const eoIpRaw = req.headers['eo-client-ip']
  const eoIp = Array.isArray(eoIpRaw) ? eoIpRaw[0] : eoIpRaw
  if (typeof eoIp === 'string' && eoIp.trim()) return eoIp.trim()
  const xffRaw = req.headers['x-forwarded-for']
  const xff = Array.isArray(xffRaw) ? xffRaw.join(',') : xffRaw
  if (typeof xff === 'string' && xff.trim()) {
    const ips = xff.split(',').map((s) => s.trim()).filter(Boolean)
    if (ips.length > 0) return ips[ips.length - 1]
  }
  return req.socket?.remoteAddress || 'unknown'
}

/** 内存速率限制（serverless 下为尽力而为） */
export function rateLimiter(maxRequests = 60, windowMs = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req)
    const now = Date.now()
    const record = rateLimitMap.get(ip)
    if (!record || now > record.resetTime) {
      rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs })
      if (rateLimitMap.size > 1000) {
        for (const [key, rec] of rateLimitMap) {
          if (now > rec.resetTime) rateLimitMap.delete(key)
        }
      }
      return next()
    }
    if (record.count >= maxRequests) {
      return res.status(429).json(reply(429, '请求过于频繁，请稍后再试', null))
    }
    record.count++
    next()
  }
}

/** 身份验证：SSO-only，始终要求有效 Bearer token */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json(reply(401, '未登录', null))
  }
  const payload = verifyAuthToken(authHeader.substring(7))
  if (!payload) {
    return res.status(401).json(reply(401, '登录已过期，请重新登录', null))
  }
  req.user = payload
  next()
}

/** 安全头（仅 /api 响应） */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
}
