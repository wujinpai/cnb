import express from 'express'
import uploadRouter from './routes/upload'
import authRouter from './routes/auth'

const app = express()
app.use(express.json())

// 添加 CORS
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  next()
})

app.use('/auth', authRouter)
app.use('/upload', uploadRouter)

export async function onRequest(context: { request: Request; env: any; params: any }) {
  return app(context.request as any, {
    send: (data: any) => new Response(data, { status: 200 }),
    json: (data: any) => Response.json(data),
    status: (code: number) => ({
      json: (data: any) => Response.json(data, { status: code }),
      send: (data: any) => new Response(data, { status: code }),
    }),
    header: (name: string, value: string) => {
      return {
        json: (data: any) => Response.json(data, { headers: { [name]: value } }),
        send: (data: any) => new Response(data, { headers: { [name]: value } }),
      }
    },
  } as any)
}
