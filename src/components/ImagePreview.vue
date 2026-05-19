<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { copyToClipboard, formatFileSize, formatDate } from '@/lib/utils'
import type { ImageRecord } from '@/composables/useImages'
import { isVideo } from '@/composables/useImages'

interface Props {
  image: ImageRecord
  hasPrev?: boolean
  hasNext?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'prev'): void
  (e: 'next'): void
  (e: 'delete', id: string): void
}>()

const copiedType = ref<string | null>(null)
const videoRef = ref<HTMLVideoElement>()

function handleCopy(type: string) {
  const url = props.image.url
  let content = url
  if (type === 'markdown') {
    if (isVideo(props.image)) {
      content = `![${props.image.name}](${url})`
    } else {
      content = `![${props.image.name}](${url})`
    }
  } else if (type === 'html') {
    if (isVideo(props.image)) {
      content = `<img src="${url}" alt="${props.image.name}" />`
    } else {
      content = `<img src="${url}" alt="${props.image.name}" />`
    }
  }
  
  copyToClipboard(content)
  copiedType.value = type
  setTimeout(() => (copiedType.value = null), 2000)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  if (e.key === 'ArrowLeft' && props.hasPrev) emit('prev')
  if (e.key === 'ArrowRight' && props.hasNext) emit('next')
}

onMounted(() => {
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', handleKeydown)
  
  if (videoRef.value && !props.image.thumbnailUrl) {
    videoRef.value.currentTime = 0.5
  }
})

onUnmounted(() => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <button
        @click="emit('close')"
        class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition z-10"
      >
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <button
        v-if="hasPrev"
        @click="emit('prev')"
        class="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition z-10"
      >
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <button
        v-if="hasNext"
        @click="emit('next')"
        class="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition z-10"
      >
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <div class="max-w-5xl max-h-[85vh] mx-4">
        <video
          v-if="isVideo(image)"
          ref="videoRef"
          :src="image.url"
          :poster="image.thumbnailUrl"
          controls
          preload="metadata"
          playsinline
          class="max-w-full max-h-[75vh] rounded-lg bg-black"
        />
        <img
          v-else
          :src="image.url"
          :alt="image.name"
          class="max-w-full max-h-[75vh] object-contain rounded-lg"
        />
      </div>

      <div class="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
        <div class="max-w-3xl mx-auto">
          <h3 class="text-white font-medium truncate">{{ image.name }}</h3>
          <p class="text-white/60 text-sm mt-1">
            {{ formatFileSize(image.size) }} · {{ formatDate(image.createdAt) }}
          </p>

          <div class="flex items-center gap-3 mt-4 flex-wrap">
            <button
              @click="handleCopy('link')"
              :class="[
                'px-4 py-2 rounded-lg text-sm font-medium transition',
                copiedType === 'link'
                  ? 'bg-green-500 text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              ]"
            >
              {{ copiedType === 'link' ? '已复制' : '链接' }}
            </button>
            <button
              @click="handleCopy('markdown')"
              :class="[
                'px-4 py-2 rounded-lg text-sm font-medium transition',
                copiedType === 'markdown'
                  ? 'bg-green-500 text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              ]"
            >
              {{ copiedType === 'markdown' ? '已复制' : 'Markdown' }}
            </button>
            <button
              @click="handleCopy('html')"
              :class="[
                'px-4 py-2 rounded-lg text-sm font-medium transition',
                copiedType === 'html'
                  ? 'bg-green-500 text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              ]"
            >
              {{ copiedType === 'html' ? '已复制' : 'HTML' }}
            </button>

            <button
              @click="emit('delete', image.id)"
              class="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
            >
              删除
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
