<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-xl font-semibold">回收站</h1>
      <p class="text-xs text-stone-500 dark:text-stone-400">删除后保留 30 天，到期自动彻底删除</p>
    </div>

    <div v-if="items.length" class="masonry">
      <div v-for="r in items" :key="r.id" class="card overflow-hidden">
        <div class="relative">
          <img v-if="!r.isVideo" :src="r.thumbnailUrl || r.url" :alt="r.name" loading="lazy" class="w-full opacity-70" />
          <video v-else :src="r.url" class="w-full opacity-70" preload="metadata" muted playsinline />
        </div>
        <div class="p-3">
          <p class="text-sm truncate" :title="r.name">{{ r.name }}</p>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">删除于 {{ formatTime(r.deletedAt) }}</p>
          <div class="mt-2 flex gap-2">
            <button class="btn !py-1.5 !text-xs flex-1" @click="restore(r)">
              <Undo2 :size="14" /> 恢复
            </button>
            <button class="btn btn-danger !py-1.5 !text-xs flex-1" @click="askPurge(r)">
              <Trash2 :size="14" /> 彻底删除
            </button>
          </div>
        </div>
      </div>
    </div>
    <p v-else-if="!loading" class="text-center text-stone-400 py-16">回收站是空的</p>
    <p v-if="loading" class="text-center text-stone-400 py-8">加载中…</p>

    <ConfirmDialog :show="!!toPurge" title="彻底删除" message="将同时删除 CNB 上的源文件，且不可恢复，确定吗？"
      confirm-text="彻底删除" @cancel="toPurge = null" @confirm="doPurge" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Undo2, Trash2 } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { kvApi } from '@/utils/api'
import { formatTime } from '@/utils/formatLinks'

interface TrashItem {
  id: string; name: string; url: string; thumbnailUrl?: string
  size: number; type: string; isVideo: boolean; deletedAt: number
}

const items = ref<TrashItem[]>([])
const loading = ref(false)
const toPurge = ref<TrashItem | null>(null)

async function load() {
  loading.value = true
  try {
    const data: any = await kvApi.get('', { params: { trash: '1', limit: 200 } })
    items.value = (data.records || []).map((r: any) => ({
      id: r.id, name: r.name, url: r.url, thumbnailUrl: r.thumbnailUrl,
      size: r.size, type: r.type, isVideo: !!r.isVideo, deletedAt: r.deletedAt,
    }))
  } catch (e: any) {
    alert(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function restore(r: TrashItem) {
  try {
    await kvApi.put('', null, { params: { id: r.id } })
    items.value = items.value.filter((x) => x.id !== r.id)
  } catch (e: any) { alert(e?.message || '恢复失败') }
}

function askPurge(r: TrashItem) { toPurge.value = r }
async function doPurge() {
  const r = toPurge.value
  toPurge.value = null
  if (!r) return
  try {
    const data: any = await kvApi.delete('', { params: { id: r.id, purge: '1' } })
    if (data?.sourceFailed) {
      alert('源文件删除失败，记录已保留在回收站，可稍后重试')
      return
    }
    items.value = items.value.filter((x) => x.id !== r.id)
  } catch (e: any) { alert(e?.message || '删除失败') }
}

onMounted(load)
</script>
