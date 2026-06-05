function getUploadType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() || ''
  const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', '3gp']
  return videoExts.includes(ext) ? 'files' : 'imgs'
}

function sanitizeFileName(fileName: string): string {
  const ext = fileName.split('.').pop() || ''
  const randomName = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  return ext ? `${randomName}.${ext}` : randomName
}

async function uploadToCnb({
  fileBuffer,
  fileName,
}: {
  fileBuffer: Buffer
  fileName: string
}) {
  const type = getUploadType(fileName)
  const safeFileName = sanitizeFileName(fileName)
  const slugImg = process.env.SLUG_IMG || 'wujinpai/cnbimg'
  const metaUrl = `https://api.cnb.cool/${slugImg}/-/upload/${type}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60000)

  try {
    const metaResp = await fetch(metaUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.TOKEN_IMG}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: safeFileName, size: fileBuffer.length }),
    })

    if (!metaResp.ok) {
      const errText = await metaResp.text().catch(() => '')
      throw new Error(`获取上传元数据失败: ${metaResp.status} ${metaResp.statusText} ${errText}`)
    }

    const { assets, upload_url } = await metaResp.json()

    const uploadResp = await fetch(upload_url, {
      method: 'PUT',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/octet-stream' },
      body: fileBuffer,
    })

    if (!uploadResp.ok) {
      const errText = await uploadResp.text().catch(() => '')
      throw new Error(`上传到存储失败: ${uploadResp.status} ${uploadResp.statusText} ${errText}`)
    }

    return { assets, url: assets['path'], safeFileName }
  } finally {
    clearTimeout(timeoutId)
  }
}

async function signUpload({
  fileName,
  fileSize,
}: {
  fileName: string
  fileSize: number
}) {
  const type = getUploadType(fileName)
  const safeFileName = sanitizeFileName(fileName)
  const slugImg = process.env.SLUG_IMG || 'wujinpai/cnbimg'
  const metaUrl = `https://api.cnb.cool/${slugImg}/-/upload/${type}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60000)

  try {
    const resp = await fetch(metaUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.TOKEN_IMG}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: safeFileName, size: fileSize }),
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`获取上传签名失败: ${resp.status} ${resp.statusText} ${errText}`)
    }

    const result = await resp.json()
    return { ...result, safeFileName }
  } finally {
    clearTimeout(timeoutId)
  }
}

export { uploadToCnb, signUpload, getUploadType }
