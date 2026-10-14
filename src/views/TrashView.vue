<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-xl font-semibold">回收站</h1>
      <div class="flex items-center gap-2">
        <p class="text-xs text-stone-500 dark:text-stone-400 hidden sm:block">删除后保留 30 天，到期自动彻底删除</p>
        <button class="btn !px-3 !py-1.5 text-sm" :class="{ 'btn-primary': selectMode }" @click="toggleSelectMode">
          <CheckSquare :size="15" /> {{ selectMode ? '退出多选' : '多选' }}
        </button>
      </div>
    </div>

    <div v-if="selected.size" class="card mb-4 p-3 flex flex-wrap items-center gap-2 fade-in">
      <span class="text-sm">已选 {{ selected.size }} 项</span>
      <div class="flex-1" />
      <button class="btn !py-1.5 text-sm" @click="clearSelect">取消</button>
      <button class="btn !py-1.5 text-sm" @click="batchRestore">
        <Undo2 :size="15" /> 批量恢复
      </button>
      <button class="btn btn-danger !py-1.5 text-sm" @click="confirmBatchPurge = true">
        <Trash2 :size="15" /> 批量彻底删除
      </button>
    </div>

    <div v-if="items.length" class="masonry">
      <div v-for="r in items" :key="r.id" class="card overflow-hidden relative"
        :class="{ 'ring-2 ring-stone-900 dark:ring-stone-100': selected.has(r.id) }">
        <div class="relative" @click="selectMode && toggleSelect(r.id)">
          <img v-if="!r.isVideo" :src="r.thumbnailUrl || r.url" :alt="r.name" loading="lazy" class="w-full opacity-70" />
          <video v-else :src="r.url" class="w-full opacity-70" preload="metadata" muted playsinline />
          <button v-if="selectMode || selected.has(r.id)" class="absolute top-2 left-2 w-6 h-6 rounded-full grid place-items-center border-2"
            :class="selected.has(r.id) ? 'bg-stone-900 dark:bg-stone-100 border-stone-900 dark:border-stone-100 text-white dark:text-stone-900' : 'bg-black/30 border-white/80 text-transparent'"
            @click.stop="toggleSelect(r.id)">
            <Check :size="14" />
          </button>
        </div>
        <div class="p-3">
          <p class="text-sm truncate" :title="r.name">{{ r.name }}</p>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">删除于 {{ formatTime(r.deletedAt) }}</p>
          <div class="mt-2 flex flex-col gap-2">
            <button class="btn !py-1.5 !text-xs w-full" @click="restore(r)">
              <Undo2 :size="14" /> 恢复
            </button>
            <button class="btn btn-danger !py-1.5 !text-xs w-full" @click="askPurge(r)">
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
    <ConfirmDialog :show="confirmBatchPurge" :title="`批量彻底删除 ${selected.size} 项`" message="将同时删除 CNB 上的源文件，且不可恢复，确定吗？"
      confirm-text="彻底删除" @cancel="confirmBatchPurge = false" @confirm="doBatchPurge" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Undo2, Trash2, Check, CheckSquare } from 'lucide-vue-next'
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
const selected = ref(new Set<string>())
const selectMode = ref(false)
const confirmBatchPurge = ref(false)

function toggleSelect(id: string) {
  if (selected.value.has(id)) selected.value.delete(id)
  else selected.value.add(id)
}
function clearSelect() { selected.value.clear() }
function toggleSelectMode() {
  selectMode.value = !selectMode.value
  if (!selectMode.value) selected.value.clear()
}

async function batchRestore() {
  const ids = [...selected.value]
  if (!ids.length) return
  try {
    await Promise.all(ids.map((id) => kvApi.put('', null, { params: { id } })))
    items.value = items.value.filter((x) => !selected.value.has(x.id))
    selected.value.clear()
  } catch (e: any) { alert(e?.message || '批量恢复失败') }
}

async function doBatchPurge() {
  const ids = [...selected.value]
  confirmBatchPurge.value = false
  if (!ids.length) return
  let failed = 0
  for (const id of ids) {
    try {
      await kvApi.delete('', { params: { id, purge: '1' } })
    } catch { failed++ }
  }
  items.value = items.value.filter((x) => !selected.value.has(x.id))
  selected.value.clear()
  if (failed) alert(`批量彻底删除完成，失败 ${failed} 项`)
}

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
