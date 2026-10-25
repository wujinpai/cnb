// 上传结果的链接格式（一处构建，供结果卡与管理页复用）
export interface UploadItem {
  url: string
  thumbnailUrl?: string
  name: string
  size: number
  type: string
  isVideo: boolean
  recordId?: string
}

export type LinkFormatKey = 'url' | 'markdown' | 'html' | 'thumbnail'

export interface LinkFormat {
  key: LinkFormatKey
  label: string
  value: string
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeLink(s: string): string {
  return s.replace(/\)/g, '%29')
}

/** 为单个文件构建复制格式；有缩略图时多一项「缩略图」直链；视频用 <video> 标签 */
export function buildFormats(item: UploadItem): LinkFormat[] {
  const alt = (item.name || (item.isVideo ? 'video' : 'img')).replace(/\.\w+$/, '')
  const url = item.url
  const html = item.isVideo
    ? `<video src="${escapeAttr(url)}" controls playsinline></video>`
    : `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" />`
  const markdown = item.isVideo
    ? `[${alt}](${escapeLink(url)})`
    : `![${alt}](${escapeLink(url)})`
  const formats: LinkFormat[] = [
    { key: 'url', label: '直链', value: url },
    { key: 'markdown', label: 'Markdown', value: markdown },
    { key: 'html', label: 'HTML', value: html },
  ]
  if (item.thumbnailUrl) {
    formats.push({ key: 'thumbnail', label: '缩略图', value: item.thumbnailUrl })
  }
  return formats
}

export function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  const p = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
