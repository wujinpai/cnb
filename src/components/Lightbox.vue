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
      <video v-if="item.isVideo" :src="item.url" controls playsinline class="max-w-full max-h-[78vh] rounded-lg shadow-2xl" />
      <img v-else :src="item.url" :alt="item.name" class="max-w-full max-h-[78vh] rounded-lg shadow-2xl object-contain" />
      <p class="mt-3 text-sm text-white/70 truncate max-w-full">{{ item.name }} · {{ formatSize(item.size) }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { X, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { formatSize, type UploadItem } from '@/utils/formatLinks'

defineProps<{ item: UploadItem | null; hasPrev: boolean; hasNext: boolean }>()
defineEmits<{ close: []; prev: []; next: [] }>()
</script>
