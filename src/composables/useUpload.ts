import { ref } from 'vue'

export interface UploadResult {
  url: string
  thumbnailUrl?: string
  name: string
  size: number
  type: string
  compressionRatio?: number
  width?: number
  height?: number
  originalSize?: number
  hasThumbnail?: boolean
  thumbnailWidth?: number
  thumbnailHeight?: number
  thumbnailSize?: number
}

export interface UploadOptions {
  quality?: number
  maxWidth?: number
  maxHeight?: number
  generateThumbnail?: boolean
  thumbnailMaxWidth?: number
  thumbnailMaxHeight?: number
  thumbnailQuality?: number
}

interface CompressResult {
  compressedFile: File
  width: number
  height: number
}

interface ThumbnailResult {
  thumbnailFile: File
  previewUrl: string
  width: number
  height: number
  size: number
}

const API_BASE = '/api'

function extractMediaPath(url: string): string {
  if (url.includes('-/imgs/')) {
    return url.split('-/imgs/')[1]
  } else if (url.includes('-/files/')) {
    return url.split('-/files/')[1]
  }
  return url
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

function isVideo(file: File): boolean {
  const videoExts = ['mp4', 'mov', 'mkv', 'webm', 'm4v', '3gp']
  const ext = file.name.toLowerCase().split('.').pop() || ''
  return videoExts.includes(ext)
}

async function compressImageToWebp(
  file: File,
  quality: number = 0.7,
  maxWidth: number = 0,
  maxHeight: number = 0,
): Promise<CompressResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (e: ProgressEvent<FileReader>) => {
      const img = new Image()
      img.src = e.target?.result as string
      img.onload = async () => {
        let width = img.width
        let height = img.height

        if (maxWidth > 0 || maxHeight > 0) {
          if (maxWidth > 0 && maxHeight > 0) {
            const ratio = Math.min(maxWidth / width, maxHeight / height)
            if (ratio < 1) {
              width = Math.round(width * ratio)
              height = Math.round(height * ratio)
            }
          } else if (maxWidth > 0 && width > maxWidth) {
            const ratio = maxWidth / width
            width = maxWidth
            height = Math.round(height * ratio)
          } else if (maxHeight > 0 && height > maxHeight) {
            const ratio = maxHeight / height
            height = maxHeight
            width = Math.round(width * ratio)
          }
        }

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('无法获取 canvas context'))
          return
        }

        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)

        const pixelCount = width * height
        let effectiveQuality = quality
        if (pixelCount > 4_000_000) {
          effectiveQuality = Math.min(quality, 0.6)
        } else if (pixelCount > 2_000_000) {
          effectiveQuality = Math.min(quality, 0.65)
        }

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('WebP 转换失败'))
              return
            }
            if (blob.size > 3 * 1024 * 1024 && effectiveQuality > 0.3) {
              canvas.toBlob(
                (retryBlob) => {
                  if (!retryBlob) {
                    reject(new Error('WebP 转换失败'))
                    return
                  }
                  const compressedFile = new File(
                    [retryBlob],
                    file.name.replace(/\.\w+$/, '.webp'),
                    { type: 'image/webp' },
                  )
                  resolve({ compressedFile, width, height })
                },
                'image/webp',
                0.3,
              )
              return
            }
            const compressedFile = new File([blob], file.name.replace(/\.\w+$/, '.webp'), {
              type: 'image/webp',
            })
            resolve({ compressedFile, width, height })
          },
          'image/webp',
          effectiveQuality,
        )
      }
      img.onerror = () => reject(new Error('图片加载失败'))
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
  })
}

async function generateThumbnailImage(
  file: File,
  thumbnailMaxWidth: number = 200,
  thumbnailMaxHeight: number = 200,
  thumbnailQuality: number = 0.9,
): Promise<ThumbnailResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (e: ProgressEvent<FileReader>) => {
      const img = new Image()
      img.src = e.target?.result as string
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('无法获取 canvas context'))
          return
        }

        let width = img.width
        let height = img.height

        if (width > thumbnailMaxWidth || height > thumbnailMaxHeight) {
          const ratio = Math.min(thumbnailMaxWidth / width, thumbnailMaxHeight / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const thumbnailFile = new File(
                [blob],
                file.name.replace(/\.\w+$/, '_thumb.webp'),
                { type: 'image/webp' },
              )
              const previewUrl = URL.createObjectURL(blob)
              resolve({
                thumbnailFile,
                previewUrl,
                width,
                height,
                size: blob.size,
              })
            } else {
              reject(new Error('缩略图生成失败'))
            }
          },
          'image/webp',
          thumbnailQuality,
        )
      }
      img.onerror = () => reject(new Error('图片加载失败'))
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
  })
}

async function generateVideoThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true

    const url = URL.createObjectURL(file)
    video.src = url

    video.onloadedmetadata = () => {
      video.currentTime = 0.1

      video.onseeked = () => {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 320
        canvas.height = video.videoHeight || 240

        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.8)
          URL.revokeObjectURL(url)
          resolve(thumbnailDataUrl)
        } else {
          URL.revokeObjectURL(url)
          resolve(null)
        }
      }

      video.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(null)
      }
    }

    video.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
  })
}

export function useUpload() {
  const uploading = ref(false)
  const progress = ref(0)
  const error = ref('')
  const processing = ref(false)

  async function upload(
    file: File,
    options: UploadOptions = {},
  ): Promise<UploadResult | null> {
    const {
      quality = 0.7,
      maxWidth = 0,
      maxHeight = 0,
      generateThumbnail = false,
      thumbnailMaxWidth = 400,
      thumbnailMaxHeight = 800,
      thumbnailQuality = 0.8,
    } = options

    uploading.value = true
    progress.value = 0
    error.value = ''

    try {
      let uploadFile = file
      let compressionRatio = 0
      let imageWidth = 0
      let imageHeight = 0
      let thumbResult: ThumbnailResult | null = null

      if (isImageFile(file)) {
        processing.value = true
        try {
          const { compressedFile, width, height } = await compressImageToWebp(
            file,
            quality,
            maxWidth,
            maxHeight,
          )
          compressionRatio = ((file.size - compressedFile.size) / file.size) * 100
          uploadFile = compressedFile
          imageWidth = width
          imageHeight = height

          if (generateThumbnail) {
            thumbResult = await generateThumbnailImage(
              compressedFile,
              thumbnailMaxWidth,
              thumbnailMaxHeight,
              thumbnailQuality,
            )
          }
        } catch (compressErr) {
          console.warn('图片压缩失败，使用原文件上传:', compressErr)
        } finally {
          processing.value = false
        }
      }

      progress.value = 10

      console.log('[Upload] Step 1: Getting signature...')
      console.log(
        '[Upload] File:',
        uploadFile.name,
        (uploadFile.size / 1024).toFixed(1) + 'KB',
        uploadFile.type,
      )

      const signRes = await fetch(
        `${API_BASE}/upload/sign?name=${encodeURIComponent(uploadFile.name)}&size=${uploadFile.size}&type=${encodeURIComponent(uploadFile.type || 'image/png')}`,
        { method: 'GET' },
      )

      console.log('[Upload] Signature response status:', signRes.status)

      if (!signRes.ok) {
        let errorMsg = `获取签名失败: ${signRes.status}`
        try {
          const data = await signRes.json()
          console.log('[Upload] Signature error data:', data)
          errorMsg = data.msg || errorMsg
        } catch {}
        throw new Error(errorMsg)
      }

      const signData = await signRes.json()
      console.log('[Upload] Signature data:', signData)

      if (signData.code !== 0) {
        throw new Error(signData.msg || '获取签名失败')
      }

      const { upload_url, assets, safeFileName } = signData.data
      console.log('[Upload] Got upload URL:', upload_url, 'safeFileName:', safeFileName)

      progress.value = 30

      console.log('[Upload] Step 2: Uploading to CNB...')
      const putRes = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: uploadFile,
      })

      console.log('[Upload] PUT response status:', putRes.status)

      if (!putRes.ok) {
        const errText = await putRes.text().catch(() => '')
        console.log('[Upload] PUT error:', errText)
        throw new Error(`文件上传失败: ${putRes.status} ${errText}`)
      }

      progress.value = 50

      let thumbnailUrl: string | null = null

      if (thumbResult) {
        console.log('[Upload] Step 3: Uploading image thumbnail...')
        const thumbName = uploadFile.name.replace(/\.\w+$/, '_thumb.webp')
        const thumbSignRes = await fetch(
          `${API_BASE}/upload/sign?name=${encodeURIComponent(thumbName)}&size=${thumbResult.thumbnailFile.size}&type=image/webp`,
          { method: 'GET' },
        )

        if (thumbSignRes.ok) {
          const thumbSignData = await thumbSignRes.json()
          if (thumbSignData.code === 0) {
            const { upload_url: thumbUploadUrl } = thumbSignData.data
            const thumbPutRes = await fetch(thumbUploadUrl, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/octet-stream' },
              body: thumbResult.thumbnailFile,
            })

            if (thumbPutRes.ok) {
              const baseUrl = window.location.origin
              const mediaPath = extractMediaPath(thumbSignData.data.assets.path)
              thumbnailUrl = baseUrl + '/img-api/' + mediaPath
              console.log('[Upload] Image thumbnail uploaded:', thumbnailUrl)
            }
          }
        }
      } else if (isVideo(file)) {
        console.log('[Upload] Step 3: Generating video thumbnail...')
        const thumbnailDataUrl = await generateVideoThumbnail(file)
        if (thumbnailDataUrl) {
          const thumbnailBlob = await fetch(thumbnailDataUrl).then((res) => res.blob())
          const thumbnailName = safeFileName.replace(/\.[^.]+$/, '_thumb.jpg')

          const thumbSignRes = await fetch(
            `${API_BASE}/upload/sign?name=${encodeURIComponent(thumbnailName)}&size=${thumbnailBlob.size}&type=image/jpeg`,
            { method: 'GET' },
          )

          if (thumbSignRes.ok) {
            const thumbSignData = await thumbSignRes.json()
            if (thumbSignData.code === 0) {
              const { upload_url: thumbUploadUrl } = thumbSignData.data
              const thumbPutRes = await fetch(thumbUploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'image/jpeg' },
                body: thumbnailBlob,
              })

              if (thumbPutRes.ok) {
                const baseUrl = window.location.origin
                const mediaPath = extractMediaPath(thumbSignData.data.assets.path)
                thumbnailUrl = baseUrl + '/img-api/' + mediaPath
                console.log('[Upload] Video thumbnail uploaded:', thumbnailUrl)
              }
            }
          }
        }
      }

      progress.value = 80

      console.log('[Upload] Step 4: Saving record...')
      const baseUrl = window.location.origin
      const mediaPath = extractMediaPath(assets.path)
      const mainUrl = baseUrl + '/img-api/' + mediaPath
      console.log('[Upload] Main URL:', mainUrl)

      const saveRes = await fetch(`${API_BASE}/upload/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: mainUrl,
          thumbnailUrl: thumbnailUrl || '',
          name: safeFileName,
          size: uploadFile.size,
          type: uploadFile.type,
        }),
      })

      console.log('[Upload] Save response status:', saveRes.status)

      if (!saveRes.ok) {
        const data = await saveRes.json().catch(() => ({}))
        throw new Error(data.msg || '保存记录失败')
      }

      progress.value = 100
      console.log('[Upload] Complete!')

      return {
        url: mainUrl,
        thumbnailUrl: thumbnailUrl || undefined,
        name: file.name,
        size: uploadFile.size,
        type: uploadFile.type,
        compressionRatio: isImageFile(file) ? compressionRatio : undefined,
        width: imageWidth || undefined,
        height: imageHeight || undefined,
        originalSize: isImageFile(file) ? file.size : undefined,
        hasThumbnail: !!thumbResult,
        thumbnailWidth: thumbResult?.width,
        thumbnailHeight: thumbResult?.height,
        thumbnailSize: thumbResult?.size,
      }
    } catch (e) {
      console.error('[Upload] Error:', e)
      error.value = e instanceof Error ? e.message : '上传失败'
      return null
    } finally {
      uploading.value = false
      processing.value = false
    }
  }

  return {
    uploading,
    progress,
    error,
    processing,
    upload,
  }
}
