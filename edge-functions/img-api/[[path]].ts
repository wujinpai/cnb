function getMediaType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() || ''
  const videoExts = ['mp4', 'mov', 'mkv', 'webm', 'm4v', '3gp']
  return videoExts.includes(ext) ? 'files' : 'imgs'
}

export async function onRequest(context: any) {
  const urlPath = context.params.path
  if (!urlPath) {
    return new Response(JSON.stringify({ error: 'No path provided' }), {
      status: 400,
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  const pathStr = Array.isArray(urlPath) ? urlPath.join('/') : urlPath
  const mediaType = getMediaType(pathStr)
  const targetUrl = 'https://cnb.cool/' + context.env.SLUG_IMG + '/-/' + mediaType + '/' + pathStr

  try {
    // 转发所有请求头，特别是 Range
    const requestHeaders = new Headers()
    for (const [key, value] of context.request.headers.entries()) {
      if (['host'].indexOf(key.toLowerCase()) === -1) {
        requestHeaders.set(key, value)
      }
    }
    requestHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/')
    requestHeaders.set('Origin', 'https://cnb.gii.cn')

    const resp = await fetch(targetUrl, {
      method: context.request.method,
      headers: requestHeaders,
      body: context.request.method !== 'GET' && context.request.method !== 'HEAD' ? context.request.body : undefined,
    })

    // 转发所有响应头，特别是视频相关的
    const headers = new Headers()
    for (const [key, value] of resp.headers.entries()) {
      headers.set(key, value)
    }
    // 确保 CORS 头部正确设置
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Range, Origin, X-Requested-With, Content-Type, Accept')
    headers.set('Cache-Control', 'public, max-age=31536000')
    
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers,
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 502,
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
