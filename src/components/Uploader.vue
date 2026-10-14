<template>
  <div>
    <div
      class="dropzone p-8 sm:p-12 text-center select-none"
      :class="{ dragging }"
      @click="pick"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
      @paste="onPaste"
    >
      <div class="mx-auto w-14 h-14 rounded-2xl bg-stone-900 dark:bg-stone-100 text-stone-100 dark:text-stone-900 grid place-items-center mb-4">
        <CloudUpload :size="26" />
      </div>
      <p class="text-lg font-medium">拖拽文件到这里，或 <span class="underline underline-offset-4">点击选择</span></p>
      <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">支持 JPG / PNG / GIF / WebP / MP4 / WebM，可粘贴截图</p>
      <input ref="fileInput" type="file" class="hidden" multiple
        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
        @change="onPick" />
    </div>

    <!-- 上传队列 -->
    <div v-if="queue.length" class="mt-4 space-y-2">
      <div v-for="item in queue" :key="item.key" class="card p-3 flex items-center gap-3 fade-in">
        <div class="w-11 h-11 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800 grid place-items-center shrink-0">
          <img v-if="item.preview && !item.isVideo" :src="item.preview" class="w-full h-full object-cover" />
          <Film v-else-if="item.isVideo" :size="20" class="text-stone-400" />
          <ImageIcon v-else :size="20" class="text-stone-400" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">{{ item.name }}</p>
          <p class="text-xs text-stone-500 dark:text-stone-400">
            <span v-if="item.status === 'compressing'">压缩中…</span>
            <span v-else-if="item.status === 'uploading'">上传中 {{ item.progress }}%</span>
            <span v-else-if="item.status === 'done'" class="text-green-600 dark:text-green-400">上传成功</span>
            <span v-else-if="item.status === 'error'" class="text-red-600 dark:text-red-400">{{ item.error }}</span>
            <span v-else>等待上传</span>
          </p>
          <div v-if="item.status === 'uploading'" class="mt-1 h-1 rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden">
            <div class="h-full bg-stone-900 dark:bg-stone-100 transition-all" :style="{ width: item.progress + '%' }" />
          </div>
        </div>
        <button v-if="item.status === 'error'" class="btn !px-3 !py-1.5 text-xs" @click="retry(item)">重试</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { CloudUpload, Film, Image as ImageIcon } from 'lucide-vue-next'
import { nodeApi, kvApi } from '@/utils/api'
import { useUploadSettings } from '@/composables/useUploadSettings'
import type { UploadItem } from '@/utils/formatLinks'

const emit = defineEmits<{ uploaded: [items: UploadItem[]] }>()

const { settings } = useUploadSettings()
const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)

interface QueueItem {
  key: string
  file: File
  name: string
  isVideo: boolean
  preview: string
  status: 'pending' | 'compressing' | 'uploading' | 'done' | 'error'
  progress: number
  error: string
}

const queue = ref<QueueItem[]>([])
const IMAGE_RE = /^image\/(jpeg|png|gif|webp)$/
const VIDEO_RE = /^video\/(mp4|webm)$/

function pick() { fileInput.value?.click() }

function onPick(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files) addFiles([...files])
  ;(e.target as HTMLInputElement).value = ''
}

function onDrop(e: DragEvent) {
  dragging.value = false
  const files = e.dataTransfer?.files
  if (files?.length) addFiles([...files])
}

function onPaste(e: ClipboardEvent) {
  const files = e.clipboardData?.files
  if (files?.length) {
    e.preventDefault()
    addFiles([...files])
  }
}

function addFiles(files: File[]) {
  for (const f of files) {
    if (!IMAGE_RE.test(f.type) && !VIDEO_RE.test(f.type)) continue
    const isVideo = VIDEO_RE.test(f.type)
    queue.value.unshift({
      key: Math.random().toString(36).slice(2),
      file: f,
      name: f.name,
      isVideo,
      preview: isVideo ? '' : URL.createObjectURL(f),
      status: 'pending',
      progress: 0,
      error: '',
    })
  }
  void processQueue()
}

let processing = false
async function processQueue() {
  if (processing) return
  processing = true
  try {
    for (const item of queue.value) {
      if (item.status === 'pending') await uploadOne(item)
    }
  } finally {
    processing = false
    // 还有新加入的 pending
    if (queue.value.some((i) => i.status === 'pending')) void processQueue()
  }
}

function retry(item: QueueItem) {
  item.status = 'pending'
  item.error = ''
  item.progress = 0
  void processQueue()
}

// ---------- 浏览器端压缩 ----------

function canvasToWebp(source: ImageBitmap, w: number, h: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return reject(new Error('Canvas 不可用'))
    ctx.drawImage(source, 0, 0, w, h)
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('WebP 转换失败'))),
      'image/webp',
      quality,
    )
  })
}

function fitSize(w: number, h: number, max: number): [number, number] {
  if (max > 0 && Math.max(w, h) > max) {
    const r = max / Math.max(w, h)
    return [Math.round(w * r), Math.round(h * r)]
  }
  return [w, h]
}

async function compressImage(file: File): Promise<{ file: File; width: number; height: number }> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error('图片解码失败')
  try {
    const [w, h] = fitSize(bitmap.width, bitmap.height, settings.value.maxDimension)
    const blob = await canvasToWebp(bitmap, w, h, settings.value.quality)
    // 压缩后反而更大则保留原图
    if (blob.size >= file.size) return { file, width: bitmap.width, height: bitmap.height }
    const nf = new File([blob], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' })
    return { file: nf, width: w, height: h }
  } finally {
    bitmap.close()
  }
}

async function makeThumbnail(file: File): Promise<File | null> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return null
  try {
    const [w, h] = fitSize(bitmap.width, bitmap.height, 400)
    const blob = await canvasToWebp(bitmap, w, h, 0.8)
    return new File([blob], file.name.replace(/\.\w+$/, '_thumb.webp'), { type: 'image/webp' })
  } catch {
    return null
  } finally {
    bitmap.close()
  }
}

// ---------- 上传 ----------

async function uploadOne(item: QueueItem) {
  const results: UploadItem[] = []
  try {
    let file = item.file
    let width = 0
    let height = 0
    let thumb: File | null = null

    if (!item.isVideo) {
      const isGif = file.type === 'image/gif'
      if (!isGif && !settings.value.keepOriginal) {
        item.status = 'compressing'
        const r = await compressImage(file)
        file = r.file
        width = r.width
        height = r.height
      } else {
        const bitmap = await createImageBitmap(file).catch(() => null)
        if (bitmap) { width = bitmap.width; height = bitmap.height; bitmap.close() }
      }
      if (settings.value.generateThumbnail) {
        thumb = await makeThumbnail(file)
      }
    }

    item.status = 'uploading'
    const form = new FormData()
    form.append('file', file, file.name)
    if (thumb) form.append('thumbnail', thumb, thumb.name)

    const data: any = await nodeApi.post('/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (e.total) item.progress = Math.round((e.loaded / e.total) * 100)
      },
    })

    const recordId = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    const record = {
      id: recordId,
      name: file.name || item.name,
      url: data.url,
      thumbnailUrl: data.thumbnailUrl || undefined,
      size: data.size ?? file.size,
      type: data.type || file.type,
      isVideo: !!data.isVideo,
      createdAt: Date.now(),
      width: width || undefined,
      height: height || undefined,
    }
    await kvApi.post('', record)

    item.status = 'done'
    item.progress = 100
    results.push({ ...record, recordId })
    emit('uploaded', results)
  } catch (e: any) {
    item.status = 'error'
    item.error = e?.message || '上传失败'
  }
}
</script>
