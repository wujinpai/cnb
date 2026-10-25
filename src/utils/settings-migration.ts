// 上传设置的默认值版本迁移。
// 背景：用户浏览器里可能存着旧版默认的参数（例如 0.75 / 2048）。
// 当代码里的默认值发生变化时，未被用户手动改过的值（即仍等于旧默认值）
// 自动跟随新默认值；用户明确改过的值原样保留。

export interface UploadSettings {
  quality: number        // WebP 压缩质量 0.3-0.95
  maxDimension: number   // 长边上限 px，0 = 不限
  keepOriginal: boolean  // 保留原图不压缩
  generateThumbnail: boolean
}

/** 当前设置版本号：每次变更默认值时 +1，并在 HISTORY 里补一条旧默认值 */
export const SETTINGS_VERSION = 3

const HISTORY: Record<number, UploadSettings> = {
  1: { quality: 0.75, maxDimension: 2048, keepOriginal: false, generateThumbnail: true },
  2: { quality: 0.7, maxDimension: 0, keepOriginal: false, generateThumbnail: true },
  3: { quality: 0.7, maxDimension: 0, keepOriginal: false, generateThumbnail: false },
}

export function currentDefaults(): UploadSettings {
  return { ...HISTORY[SETTINGS_VERSION] }
}

/** 解析 localStorage 里存的东西：新格式 {version, settings}，老格式直接是 settings 对象（视为 v1） */
export function detectVersion(parsed: unknown): { settings: unknown; version: number } {
  if (
    parsed && typeof parsed === 'object' &&
    'settings' in parsed && 'version' in parsed &&
    typeof (parsed as any).version === 'number'
  ) {
    return { settings: (parsed as any).settings, version: (parsed as any).version }
  }
  return { settings: parsed, version: 1 }
}

export function migrateSettings(stored: unknown, storedVersion: number): UploadSettings {
  const merged: UploadSettings = { ...HISTORY[SETTINGS_VERSION] }
  if (stored && typeof stored === 'object') Object.assign(merged, stored)
  if (storedVersion < SETTINGS_VERSION) {
    const oldDefaults = HISTORY[storedVersion] ?? HISTORY[1]
    const s = stored as Partial<UploadSettings>
    const cur = HISTORY[SETTINGS_VERSION]
    // 用户没动过的值（仍等于旧默认值）→ 跟随新默认值；用户明确改过的值原样保留
    if (s?.quality === oldDefaults.quality) merged.quality = cur.quality
    if (s?.maxDimension === oldDefaults.maxDimension) merged.maxDimension = cur.maxDimension
    if (s?.keepOriginal === oldDefaults.keepOriginal) merged.keepOriginal = cur.keepOriginal
    if (s?.generateThumbnail === oldDefaults.generateThumbnail) merged.generateThumbnail = cur.generateThumbnail
  }
  return merged
}
