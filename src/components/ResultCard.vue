<template>
  <div class="card p-3 fade-in min-w-0">
    <div class="flex items-start gap-3">
      <div class="w-16 h-16 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800 shrink-0 grid place-items-center cursor-pointer" @click="$emit('preview', item)">
        <img v-if="!item.isVideo" :src="item.thumbnailUrl || item.url" class="w-full h-full object-cover" loading="lazy" />
        <div v-else class="relative w-full h-full grid place-items-center">
          <video :src="item.url" class="w-full h-full object-cover" preload="metadata" muted playsinline />
          <span class="absolute inset-0 grid place-items-center bg-black/20">
            <Play :size="20" class="text-white" />
          </span>
        </div>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate" :title="item.name">{{ item.name }}</p>
        <p class="text-xs text-stone-500 dark:text-stone-400">{{ formatSize(item.size) }} · {{ item.isVideo ? '视频' : '图片' }}</p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <button v-for="f in formats" :key="f.key" class="btn !px-2.5 !py-1 !text-xs" @click="copy(f)">
            <Check v-if="copiedKey === f.key" :size="13" class="text-green-600" />
            <Copy v-else :size="13" />
            {{ copiedKey === f.key ? '已复制' : f.label }}
          </button>
          <button class="btn !px-2.5 !py-1 !text-xs" @click="$emit('share', item)">
            <Share2 :size="13" /> 分享
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Copy, Check, Play, Share2 } from 'lucide-vue-next'
import { buildFormats, formatSize, type UploadItem } from '@/utils/formatLinks'
import { copyText } from '@/utils/clipboard'

const props = defineProps<{ item: UploadItem }>()
defineEmits<{ preview: [item: UploadItem]; share: [item: UploadItem] }>()

const formats = buildFormats(props.item)
const copiedKey = ref('')

async function copy(f: { key: string; value: string }) {
  const ok = await copyText(f.value)
  if (ok) {
    copiedKey.value = f.key
    setTimeout(() => { copiedKey.value = '' }, 1500)
  }
}
</script>
