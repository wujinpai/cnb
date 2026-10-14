<template>
  <div v-if="item" class="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 fade-in" @click.self="$emit('close')">
    <button class="absolute top-4 right-4 text-white/80 hover:text-white p-2" @click="$emit('close')" title="关闭 (Esc)">
      <X :size="26" />
    </button>
    <button v-if="hasPrev" class="absolute left-2 sm:left-6 text-white/80 hover:text-white p-2" @click="$emit('prev')" title="上一张 (←)">
      <ChevronLeft :size="32" />
    </button>
    <button v-if="hasNext" class="absolute right-2 sm:right-6 text-white/80 hover:text-white p-2" @click="$emit('next')" title="下一张 (→)">
      <ChevronRight :size="32" />
    </button>
    <div class="max-w-5xl max-h-[88vh] flex flex-col items-center" @click.stop>
      <video v-if="item.isVideo" :src="item.url" controls playsinline class="max-w-full max-h-[70vh] rounded-lg shadow-2xl" />
      <img v-else :src="item.url" :alt="item.name" class="max-w-full max-h-[70vh] rounded-lg shadow-2xl object-contain" />
      <p class="mt-3 text-sm text-white/70 truncate max-w-full">{{ item.name }} · {{ formatSize(item.size) }}</p>
      <div class="mt-3 flex flex-wrap justify-center gap-2">
        <button v-for="f in formats" :key="f.key"
          class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1.5"
          @click="copy(f)">
          <Check v-if="copiedKey === f.key" :size="13" class="text-green-400" />
          <Copy v-else :size="13" />
          {{ copiedKey === f.key ? '已复制' : f.label }}
        </button>
        <button class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1.5" @click="$emit('share', item)">
          <Share2 :size="13" /> 分享
        </button>
        <a class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs flex items-center gap-1.5" :href="item.url" :download="item.name">
          <Download :size="13" /> 下载
        </a>
        <button class="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs flex items-center gap-1.5" @click="$emit('delete', item)">
          <Trash2 :size="13" /> 删除
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { X, ChevronLeft, ChevronRight, Copy, Check, Share2, Download, Trash2 } from 'lucide-vue-next'
import { buildFormats, formatSize, type UploadItem } from '@/utils/formatLinks'
import { copyText } from '@/utils/clipboard'

const props = defineProps<{ item: UploadItem | null; hasPrev: boolean; hasNext: boolean }>()
defineEmits<{ close: []; prev: []; next: []; share: [item: UploadItem]; delete: [item: UploadItem] }>()

const formats = computed(() => props.item ? buildFormats(props.item) : [])
const copiedKey = ref('')

async function copy(f: { key: string; value: string }) {
  const ok = await copyText(f.value)
  if (ok) {
    copiedKey.value = f.key
    setTimeout(() => { copiedKey.value = '' }, 1500)
  }
}
</script>
