<template>
  <div class="max-w-3xl mx-auto">
    <div v-if="loading" class="text-center py-20 text-stone-400">加载中…</div>
    <div v-else-if="error" class="text-center py-20">
      <p class="text-lg font-medium">分享不存在或已删除</p>
      <RouterLink to="/" class="btn mt-4">回首页</RouterLink>
    </div>
    <div v-else-if="record" class="fade-in">
      <div class="card overflow-hidden">
        <video v-if="record.isVideo" :src="record.url" controls playsinline class="w-full max-h-[70vh] bg-black" />
        <img v-else :src="record.url" :alt="record.name" class="w-full max-h-[70vh] object-contain bg-stone-100 dark:bg-stone-900" />
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <div class="flex-1 min-w-0">
          <p class="font-medium truncate">{{ record.name }}</p>
          <p class="text-xs text-stone-500 dark:text-stone-400">{{ formatSize(record.size) }} · {{ formatTime(record.createdAt) }}</p>
        </div>
        <a class="btn" :href="record.url" :download="record.name">
          <Download :size="15" /> 下载
        </a>
        <button class="btn" @click="copyLink">
          <Check v-if="copied" :size="15" class="text-green-600" /> <Copy v-else :size="15" />
          {{ copied ? '已复制' : '复制链接' }}
        </button>
      </div>
      <p class="mt-8 text-center text-xs text-stone-400">由己素图床分享 · {{ host }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Download, Copy, Check } from 'lucide-vue-next'
import { publicKv } from '@/utils/api'
import { copyText } from '@/utils/clipboard'
import { formatSize, formatTime } from '@/utils/formatLinks'

const route = useRoute()
const loading = ref(true)
const error = ref(false)
const record = ref<any>(null)
const copied = ref(false)
const host = location.host

async function copyLink() {
  if (!record.value) return
  const ok = await copyText(location.href)
  if (ok) {
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  }
}

onMounted(async () => {
  try {
    const data: any = await publicKv.get('', { params: { share: route.params.token } })
    record.value = data
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})
</script>
