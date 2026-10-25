import { ref } from 'vue'
import { kvApi } from '@/utils/api'
import {
  UploadSettings,
  SETTINGS_VERSION,
  currentDefaults,
  detectVersion,
  migrateSettings,
} from '@/utils/settings-migration'

export type { UploadSettings }

const KEY = 'imgbed-upload-settings'

function saveEnvelope(s: UploadSettings) {
  try { localStorage.setItem(KEY, JSON.stringify({ version: SETTINGS_VERSION, settings: s })) } catch { /* ignore */ }
}

function load(): UploadSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const { settings: stored, version } = detectVersion(JSON.parse(raw))
      const migrated = migrateSettings(stored, version)
      // 版本迁移后回写，保持存储格式统一
      saveEnvelope(migrated)
      return migrated
    }
  } catch { /* ignore */ }
  return currentDefaults()
}

const settings = ref<UploadSettings>(load())

function persist() {
  saveEnvelope(settings.value)
  // 同步到云端（登录态，失败静默），带版本号供拉取时迁移老文档
  kvApi.post('?site-settings=1', { uploadSettings: settings.value, settingsVersion: SETTINGS_VERSION }).catch(() => {})
}

export function useUploadSettings() {
  const update = (patch: Partial<UploadSettings>) => {
    Object.assign(settings.value, patch)
    persist()
  }
  /** 登录后从云端拉取覆盖本地；老文档（无版本号或旧版）按迁移规则处理一次并回写 */
  const pull = async () => {
    try {
      const doc: any = await kvApi.get('?site-settings=1')
      if (doc?.uploadSettings) {
        const v = Math.floor(Number(doc.settingsVersion))
        const needsMigration = !(Number.isFinite(v) && v >= SETTINGS_VERSION)
        const migrated = needsMigration
          ? migrateSettings(doc.uploadSettings, Number.isFinite(v) && v >= 1 ? v : 1)
          : doc.uploadSettings
        Object.assign(settings.value, migrated)
        saveEnvelope(settings.value)
        if (needsMigration) {
          kvApi.post('?site-settings=1', { uploadSettings: settings.value, settingsVersion: SETTINGS_VERSION }).catch(() => {})
        }
      }
    } catch { /* ignore */ }
  }
  return { settings, update, pull }
}
