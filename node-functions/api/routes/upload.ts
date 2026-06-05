import { Router } from 'express'
import multer from 'multer'
import { uploadToCnb, signUpload, getUploadType } from '../_utils'
import { authMiddleware } from '../_auth'

const router = Router()

const upload = multer({
  limits: {
    fileSize: 50 * 1024 * 1024,
    fieldSize: 50 * 1024 * 1024,
  },
})

router.get('/sign', authMiddleware, async (req, res) => {
  try {
    const fileName = req.query.name as string
    const fileSize = parseInt(req.query.size as string, 10)
    if (!fileName || !fileSize) {
      return res.status(400).json({ code: 400, msg: '缺少 name 或 size 参数' })
    }

    const result = await signUpload({ fileName, fileSize })
    res.json({ code: 0, msg: 'ok', data: result })
  } catch (e: unknown) {
    res.status(500).json({ code: 500, msg: '获取上传签名失败', data: { message: (e as Error).message } })
  }
})

router.post(
  '/img',
  authMiddleware,
  (req, res, next) => {
    upload.fields([
      { name: 'file', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        const status = err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FIELD_SIZE' ? 413 : 400
        return res.status(status).json({ code: status, msg: `文件超出限制: ${err.message}`, data: {} })
      }
      next()
    })
  },
  async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] }
      if (!files?.file) {
        return res.status(400).json({ code: 400, msg: '未上传文件', data: {} })
      }

      const mainFile = files.file[0]
      const baseUrl = process.env.BASE_IMG_URL || ''

      const mainResult = await uploadToCnb({
        fileBuffer: mainFile.buffer,
        fileName: mainFile.originalname,
      })

      const isVideo = getUploadType(mainFile.originalname) === 'files'

      res.json({
        code: 0,
        msg: '上传成功',
        data: {
          url: buildImageUrl(baseUrl, mainResult.url),
          urlOriginal: mainResult.url,
          name: mainResult.safeFileName,
          size: mainFile.size,
          type: mainFile.mimetype,
          isVideo,
        },
      })
    } catch (err: unknown) {
      const msg = (err as Error).message || '未知错误'
      console.error('上传失败:', msg)
      res.status(500).json({ code: 500, msg: '上传失败', data: { message: msg } })
    }
  },
)

function buildImageUrl(baseUrl: string, rawPath: string): string {
  const path = String(rawPath).split(/[?#]/)[0]
  const match = path.match(/-\/(?:imgs|files)\/(.+)/)
  const resourcePath = match ? match[1] : path
  return baseUrl + 'img-api/' + resourcePath
}

export default router
