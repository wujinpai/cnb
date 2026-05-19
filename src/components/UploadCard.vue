<script setup lang="ts">
import { ref } from 'vue'
import { formatFileSize, copyToClipboard } from '@/lib/utils'

interface Props {
  url: string
  name: string
  size: number
  type: string
  compressionRatio?: number
  originalSize?: number
  width?: number
  height?: number
  hasThumbnail?: boolean
  thumbnailUrl?: string
  thumbnailWidth?: number
  thumbnailHeight?: number
  thumbnailSize?: number
}

const props = defineProps<Props>()
const copiedType = ref<string | null>(null)

async function handleCopy(type: string) {
  const url = props.url
  let content = url
  if (type === 'markdown') {
    content = `![${props.name}](${url})`
  } else if (type === 'html') {
    content = `<img src="${url}" alt="${props.name}" />`
  }
  
  await copyToClipboard(content)
  copiedType.value = type
  setTimeout(() => (copiedType.value = null), 2000)
}
</script>

<template>
  <div class="bg-surface border border-border rounded-xl overflow-hidden">
    <div class="aspect-video bg-surface-elevated flex items-center justify-center">
      <img
        :src="url"
        :alt="name"
        class="max-w-full max-h-full object-contain"
      />
    </div>

    <div class="p-4">
      <p class="font-medium text-text-primary truncate">{{ name }}</p>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary mt-1">
        <p>{{ formatFileSize(size) }} · {{ type }}</p>
        <p v-if="width && height">{{ width }}x{{ height }}</p>
        <p v-if="compressionRatio !== undefined && compressionRatio > 0" class="text-green-500">
          压缩率 {{ compressionRatio.toFixed(1) }}%
        </p>
      </div>

      <div v-if="originalSize && originalSize !== size" class="mt-1 text-xs text-text-secondary/60">
        原始 {{ formatFileSize(originalSize) }} → 压缩后 {{ formatFileSize(size) }}
      </div>

      <div v-if="hasThumbnail && thumbnailUrl" class="mt-3 rounded-lg border border-border/50 px-3 py-2">
        <p class="text-xs text-text-secondary mb-1.5">缩略图</p>
        <div class="flex items-center gap-3">
          <img
            :src="thumbnailUrl"
            alt="缩略图"
            class="h-10 w-10 rounded border border-border/30 object-cover"
          />
          <div class="flex gap-4 text-xs text-text-secondary">
            <p v-if="thumbnailWidth && thumbnailHeight">
              尺寸 <span class="text-text-primary/70">{{ thumbnailWidth }}x{{ thumbnailHeight }}</span>
            </p>
            <p v-if="thumbnailSize">
              大小 <span class="text-text-primary/70">{{ formatFileSize(thumbnailSize) }}</span>
            </p>
          </div>
        </div>
      </div>

      <div class="mt-3 flex items-center gap-2 flex-wrap">
        <div class="flex-1 px-3 py-2 bg-surface-elevated rounded-lg text-sm text-text-secondary truncate">
          {{ url }}
        </div>
        <button
          @click="handleCopy('link')"
          :class="[
            'px-3 py-2 rounded-lg text-sm font-medium transition',
            copiedType === 'link'
              ? 'bg-green-500/10 text-green-500'
              : 'bg-accent text-white hover:bg-accent/90'
          ]"
        >
          {{ copiedType === 'link' ? '✓' : '链接' }}
        </button>
        <button
          @click="handleCopy('markdown')"
          :class="[
            'px-3 py-2 rounded-lg text-sm font-medium transition',
            copiedType === 'markdown'
              ? 'bg-green-500/10 text-green-500'
              : 'bg-accent text-white hover:bg-accent/90'
          ]"
        >
          {{ copiedType === 'markdown' ? '✓' : 'Markdown' }}
        </button>
        <button
          @click="handleCopy('html')"
          :class="[
            'px-3 py-2 rounded-lg text-sm font-medium transition',
            copiedType === 'html'
              ? 'bg-green-500/10 text-green-500'
              : 'bg-accent text-white hover:bg-accent/90'
          ]"
        >
          {{ copiedType === 'html' ? '✓' : 'HTML' }}
        </button>
      </div>
    </div>
  </div>
</template>
