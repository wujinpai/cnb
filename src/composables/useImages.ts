import { ref } from 'vue'

export interface ImageRecord {
  id: string
  url: string
  thumbnailUrl?: string
  name: string
  size: number
  type: string
  createdAt: string
}

export function isVideo(file: ImageRecord): boolean {
  if (file.type.startsWith('video/')) return true
  const ext = file.name.toLowerCase().split('.').pop() || ''
  return ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', '3gp'].includes(ext)
}

const STORAGE_KEY = 'uploaded_images'

export function useImages() {
  const images = ref<ImageRecord[]>([])
  const loading = ref(false)
  const error = ref('')

  function fetchImages() {
    loading.value = true
    error.value = ''

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      images.value = stored ? JSON.parse(stored) : []
    } catch (e) {
      error.value = e instanceof Error ? e.message : '获取图片列表失败'
    } finally {
      loading.value = false
    }
  }

  function saveImage(record: Omit<ImageRecord, 'id' | 'createdAt'>) {
    const newRecord: ImageRecord = {
      ...record,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      createdAt: new Date().toISOString(),
    }
    images.value.unshift(newRecord)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images.value))
  }

  function deleteImage(id: string) {
    images.value = images.value.filter(img => img.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images.value))
    return true
  }

  return {
    images,
    loading,
    error,
    fetchImages,
    saveImage,
    deleteImage
  }
}
