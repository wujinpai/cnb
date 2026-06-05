<script setup lang="ts">
import { ref } from 'vue'
import { formatFileSize, copyToClipboard } from '@/lib/utils'

interface Props {
  url: string
  name: string
  size: number
  type: string
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
  <div class="glass-card rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
    <div class="aspect-video bg-surface-elevated flex items-center justify-center">
      <img
        :src="url"
        :alt="name"
        class="max-w-full max-h-full object-contain"
      />
    </div>

    <div class="p-5">
      <p class="font-semibold text-text-primary truncate text-lg">{{ name }}</p>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary mt-2">
        <p>📦 {{ formatFileSize(size) }} · {{ type }}</p>
      </div>

      <div v-if="hasThumbnail && thumbnailUrl" class="mt-4 glass-card-elevated rounded-xl px-4 py-3">
        <p class="text-xs text-text-secondary mb-2 font-medium">缩略图</p>
        <div class="flex items-center gap-4">
          <img
            :src="thumbnailUrl"
            alt="缩略图"
            class="h-12 w-12 rounded-xl border border-border/30 object-cover shadow"
          />
          <div class="flex gap-6 text-xs text-text-secondary">
            <p v-if="thumbnailWidth && thumbnailHeight">
              尺寸 <span class="gradient-text font-bold">{{ thumbnailWidth }}x{{ thumbnailHeight }}</span>
            </p>
            <p v-if="thumbnailSize">
              大小 <span class="gradient-text font-bold">{{ formatFileSize(thumbnailSize) }}</span>
            </p>
          </div>
        </div>
      </div>

      <div class="mt-4 flex items-center gap-2 flex-wrap">
        <div class="flex-1 px-4 py-3 bg-surface-elevated rounded-xl text-sm text-text-secondary truncate font-mono">
          {{ url }}
        </div>
        <button
          @click="handleCopy('link')"
          :class="[
            'px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300',
            copiedType === 'link'
              ? 'bg-green-500/20 text-green-500 border border-green-500/30'
              : 'gradient-btn text-white'
          ]"
        >
          {{ copiedType === 'link' ? '✓ 已复制' : '🔗 链接' }}
        </button>
        <button
          @click="handleCopy('markdown')"
          :class="[
            'px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300',
            copiedType === 'markdown'
              ? 'bg-green-500/20 text-green-500 border border-green-500/30'
              : 'gradient-btn text-white'
          ]"
        >
          {{ copiedType === 'markdown' ? '✓ 已复制' : '📝 Markdown' }}
        </button>
        <button
          @click="handleCopy('html')"
          :class="[
            'px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300',
            copiedType === 'html'
              ? 'bg-green-500/20 text-green-500 border border-green-500/30'
              : 'gradient-btn text-white'
          ]"
        >
          {{ copiedType === 'html' ? '✓ 已复制' : '🌐 HTML' }}
        </button>
      </div>
    </div>
  </div>
</template>
