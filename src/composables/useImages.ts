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

const API_BASE = '/api'

export function useImages() {
  const images = ref<ImageRecord[]>([])
  const loading = ref(false)
  const error = ref('')

  async function fetchImages() {
    loading.value = true
    error.value = ''

    try {
      const res = await fetch(`${API_BASE}/records`)
      const data = await res.json()

      if (data.code === 0) {
        images.value = data.data || []
      } else {
        throw new Error(data.msg || '获取图片列表失败')
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : '获取图片列表失败'
    } finally {
      loading.value = false
    }
  }

  async function deleteImage(id: string) {
    try {
      const res = await fetch(`${API_BASE}/records/${id}`, { method: 'DELETE' })
      const data = await res.json()

      if (data.code === 0) {
        images.value = images.value.filter(img => img.id !== id)
        return true
      }
      throw new Error(data.msg || '删除失败')
    } catch (e) {
      error.value = e instanceof Error ? e.message : '删除失败'
      return false
    }
  }

  return {
    images,
    loading,
    error,
    fetchImages,
    deleteImage
  }
}
