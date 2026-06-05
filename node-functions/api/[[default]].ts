import express from 'express'
import uploadRouter from './routes/upload'
import authRouter from './routes/auth'

const app = express()
app.use(express.json())

app.use('/auth', authRouter)
app.use('/upload', uploadRouter)

export default app
