import { ref } from 'vue'
import { kvApi } from '@/utils/api'

export interface UploadSettings {
  quality: number        // WebP 压缩质量 0.3-0.95
  maxDimension: number   // 长边上限 px，0 = 不限
  keepOriginal: boolean  // 保留原图不压缩
  generateThumbnail: boolean
}

const KEY = 'imgbed-upload-settings'

const defaults: UploadSettings = {
  quality: 0.7,
  maxDimension: 0,
  keepOriginal: false,
  generateThumbnail: true,
}

function load(): UploadSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...defaults, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...defaults }
}

const settings = ref<UploadSettings>(load())

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(settings.value)) } catch { /* ignore */ }
  // 同步到云端（登录态，失败静默）
  kvApi.post('?site-settings=1', { uploadSettings: settings.value }).catch(() => {})
}

export function useUploadSettings() {
  const update = (patch: Partial<UploadSettings>) => {
    Object.assign(settings.value, patch)
    persist()
  }
  /** 登录后从云端拉取覆盖本地 */
  const pull = async () => {
    try {
      const doc: any = await kvApi.get('?site-settings=1')
      if (doc?.uploadSettings) {
        Object.assign(settings.value, doc.uploadSettings)
        try { localStorage.setItem(KEY, JSON.stringify(settings.value)) } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }
  return { settings, update, pull }
}
