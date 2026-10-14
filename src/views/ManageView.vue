<template>
  <div>
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <div class="relative flex-1 min-w-40">
        <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input v-model="q" @input="debouncedLoad" placeholder="搜索文件名…" class="input !pl-9" />
      </div>
      <select v-model="typeFilter" @change="() => load()" class="select !w-auto">
        <option value="">全部类型</option>
        <option value="image">图片</option>
        <option value="video">视频</option>
      </select>
      <select v-model="sortKey" @change="() => load()" class="select !w-auto">
        <option value="createdAt">按时间</option>
        <option value="name">按名称</option>
        <option value="size">按大小</option>
      </select>
      <button class="btn !px-3" @click="toggleDir" :title="dir === 'desc' ? '降序' : '升序'">
        <ArrowDownWideNarrow v-if="dir === 'desc'" :size="16" />
        <ArrowUpNarrowWide v-else :size="16" />
      </button>
      <button class="btn !px-3 text-sm" @click="orphanOpen = true" title="扫描 CNB 上不在记录中的孤儿文件并清理">
        清理孤儿文件
      </button>
    </div>

    <div v-if="selected.size" class="card mb-4 p-3 flex items-center gap-3 fade-in">
      <span class="text-sm">已选 {{ selected.size }} 项</span>
      <div class="flex-1" />
      <button class="btn !py-1.5 text-sm" @click="clearSelect">取消</button>
      <button class="btn btn-danger !py-1.5 text-sm" @click="confirmBatchDelete = true">
        <Trash2 :size="15" /> 移入回收站
      </button>
    </div>

    <div v-if="items.length" class="masonry">
      <div v-for="(r, i) in items" :key="r.recordId"
        class="card overflow-hidden group relative cursor-pointer"
        :class="{ 'ring-2 ring-stone-900 dark:ring-stone-100': selected.has(r.recordId!) }"
        @click="onCardClick(r, i, $event)">
        <div class="relative">
          <img v-if="!r.isVideo" :src="r.thumbnailUrl || r.url" :alt="r.name" loading="lazy" class="w-full" />
          <div v-else class="relative">
            <video :src="r.url" class="w-full" preload="metadata" muted playsinline />
            <span class="absolute inset-0 grid place-items-center bg-black/20"><Play :size="28" class="text-white" /></span>
          </div>
          <button v-if="selected.has(r.recordId!)" class="absolute top-2 right-2 w-6 h-6 rounded-full bg-stone-900 text-white grid place-items-center" @click.stop="toggleSelect(r.recordId!)">
            <Check :size="14" />
          </button>
          <div class="absolute inset-x-0 bottom-0 p-2 pt-6 bg-gradient-to-t from-black/60 to-transparent text-white text-xs opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
            <span class="truncate flex-1">{{ r.name }}</span>
            <button class="p-1 hover:bg-white/20 rounded" title="复制直链" @click.stop="copyUrl(r)"><Link2 :size="14" /></button>
            <button class="p-1 hover:bg-white/20 rounded" title="分享" @click.stop="shareItem(r)"><Share2 :size="14" /></button>
            <button class="p-1 hover:bg-white/20 rounded" title="删除" @click.stop="askDelete(r)"><Trash2 :size="14" /></button>
          </div>
        </div>
      </div>
    </div>
    <p v-else-if="!loading" class="text-center text-stone-400 py-16">没有文件</p>
    <p v-if="loading" class="text-center text-stone-400 py-8">加载中…</p>

    <div v-if="total > items.length" class="mt-6 text-center">
      <button class="btn" @click="loadMore" :disabled="loading">加载更多（{{ items.length }}/{{ total }}）</button>
    </div>

    <Lightbox :item="lbItem" :has-prev="lbIndex > 0" :has-next="lbIndex < items.length - 1"
      @close="lbItem = null" @prev="step(-1)" @next="step(1)" />

    <ConfirmDialog :show="!!toDelete" title="移入回收站" message="文件将移入回收站，30 天后自动彻底删除。"
      @cancel="toDelete = null" @confirm="doDelete" />
    <ConfirmDialog :show="confirmBatchDelete" title="批量移入回收站" :message="`确定将 ${selected.size} 个文件移入回收站吗？`"
      @cancel="confirmBatchDelete = false" @confirm="doBatchDelete" />

    <!-- 孤儿文件清理 -->
    <div v-if="orphanOpen" class="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" @click.self="orphanOpen = false">
      <div class="card max-w-lg w-full max-h-[80vh] overflow-auto p-5">
        <h3 class="text-lg font-semibold mb-2">清理孤儿文件</h3>
        <p class="text-sm text-stone-500 mb-4">扫描 CNB 存储桶中存在、但不在图床记录里的文件（例如手动上传、记录丢失的）。清理将直接从 CNB 删除，无法恢复。</p>
        <div v-if="orphanState === 'idle'">
          <button class="btn" @click="scanOrphans" :disabled="orphanLoading">
            {{ orphanLoading ? '扫描中…' : '开始扫描' }}
          </button>
        </div>
        <div v-else-if="orphanState === 'done'">
          <p class="text-sm mb-2">共扫描 {{ orphanScanned }} 个文件，发现孤儿 <strong>{{ orphans.length }}</strong> 个
            <span v-if="orphanTruncated" class="text-amber-600">（仅显示前 1000 个）</span>
          </p>
          <div v-if="orphans.length" class="max-h-48 overflow-auto border rounded text-xs mb-3">
            <div v-for="(o, i) in orphans.slice(0, 100)" :key="i" class="px-2 py-1 border-b truncate" :title="o.path">
              {{ o.path }} <span class="text-stone-400">({{ fmtSize(o.size) }})</span>
            </div>
            <div v-if="orphans.length > 100" class="px-2 py-1 text-stone-400">…等 {{ orphans.length - 100 }} 个</div>
          </div>
          <p v-else class="text-sm text-green-600 mb-3">没有孤儿文件，很干净。</p>
          <div class="flex gap-2">
            <button class="btn" @click="scanOrphans" :disabled="orphanLoading">重新扫描</button>
            <button v-if="orphans.length" class="btn btn-danger" @click="cleanOrphans" :disabled="orphanCleaning">
              {{ orphanCleaning ? `清理中 ${orphanCleaned}/${orphans.length}…` : `清理全部 ${orphans.length} 个` }}
            </button>
            <div class="flex-1" />
            <button class="btn" @click="orphanOpen = false">关闭</button>
          </div>
          <p v-if="orphanResult" class="text-sm mt-2" :class="orphanResult.ok ? 'text-green-600' : 'text-red-600'">{{ orphanResult.msg }}</p>
        </div>
        <div v-else>
          <p class="text-sm text-red-600">{{ orphanError }}</p>
          <div class="flex gap-2 mt-3">
            <button class="btn" @click="scanOrphans">重试</button>
            <button class="btn" @click="orphanOpen = false">关闭</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Search, Trash2, Check, Play, Link2, Share2, ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-vue-next'
import Lightbox from '@/components/Lightbox.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { kvApi, nodeApi } from '@/utils/api'
import { copyText } from '@/utils/clipboard'
import type { UploadItem } from '@/utils/formatLinks'

const items = ref<UploadItem[]>([])
const total = ref(0)
const loading = ref(false)
const q = ref('')
const typeFilter = ref('')
const sortKey = ref('createdAt')
const dir = ref<'desc' | 'asc'>('desc')
const selected = ref(new Set<string>())
const toDelete = ref<UploadItem | null>(null)
const confirmBatchDelete = ref(false)

// 孤儿文件清理
const orphanOpen = ref(false)
const orphanState = ref<'idle' | 'done' | 'error'>('idle')
const orphanLoading = ref(false)
const orphanCleaning = ref(false)
const orphans = ref<{ path: string; size: number }[]>([])
const orphanScanned = ref(0)
const orphanTruncated = ref(false)
const orphanError = ref('')
const orphanCleaned = ref(0)
const orphanResult = ref<{ ok: boolean; msg: string } | null>(null)

function fmtSize(b: number) {
  if (!b) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++ }
  return `${b.toFixed(1)} ${u[i]}`
}

async function scanOrphans() {
  orphanLoading.value = true
  orphanResult.value = null
  orphanError.value = ''
  try {
    const data: any = await kvApi.get('', { params: { 'cnb-assets': '1' } })
    orphans.value = (data.orphans || []).map((o: any) => ({ path: o.path, size: o.size || 0 }))
    orphanScanned.value = data.scanned || 0
    orphanTruncated.value = !!data.orphansTruncated
    orphanState.value = 'done'
  } catch (e: any) {
    orphanError.value = e?.message || '扫描失败'
    orphanState.value = 'error'
  } finally {
    orphanLoading.value = false
  }
}

async function cleanOrphans() {
  if (!orphans.value.length || orphanCleaning.value) return
  if (!confirm(`确定要从 CNB 直接删除这 ${orphans.value.length} 个孤儿文件吗？此操作无法恢复。`)) return
  orphanCleaning.value = true
  orphanCleaned.value = 0
  orphanResult.value = null
  let failed = 0
  // /file/delete 单次最多 50 个，分批
  for (let i = 0; i < orphans.value.length; i += 50) {
    const batch = orphans.value.slice(i, i + 50).map(o => o.path)
    try {
      const r: any = await nodeApi.post('/file/delete', { paths: batch })
      orphanCleaned.value += (r.ok || []).length
      failed += (r.failed || []).length
    } catch {
      failed += batch.length
    }
  }
  orphanCleaning.value = false
  const ok = failed === 0
  orphanResult.value = {
    ok,
    msg: ok ? `清理完成，共删除 ${orphanCleaned.value} 个文件。` : `清理结束，成功 ${orphanCleaned.value} 个，失败 ${failed} 个。`,
  }
  if (ok) {
    orphans.value = []
  }
}

const lbItem = ref<UploadItem | null>(null)
const lbIndex = ref(0)

const PAGE = 40
let debounceTimer: any = null
function debouncedLoad() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => load(), 400)
}

async function load(reset = true) {
  if (loading.value) return
  loading.value = true
  try {
    const params: any = { limit: PAGE, offset: reset ? 0 : items.value.length, sort: sortKey.value, dir: dir.value, stats: 1 }
    if (q.value.trim()) params.q = q.value.trim()
    if (typeFilter.value) params.type = typeFilter.value
    const data: any = await kvApi.get('', { params })
    const list = (data.records || []).map((r: any) => ({
      url: r.url, thumbnailUrl: r.thumbnailUrl, name: r.name, size: r.size,
      type: r.type, isVideo: !!r.isVideo, recordId: r.id,
    }))
    items.value = reset ? list : [...items.value, ...list]
    total.value = data.total ?? list.length
  } catch (e: any) {
    alert(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}
function loadMore() { load(false) }
function toggleDir() { dir.value = dir.value === 'desc' ? 'asc' : 'desc'; load() }

function toggleSelect(id: string) {
  if (selected.value.has(id)) selected.value.delete(id)
  else selected.value.add(id)
}
function clearSelect() { selected.value.clear() }

function onCardClick(r: UploadItem, i: number, e: MouseEvent) {
  if (e.shiftKey || e.ctrlKey || e.metaKey) { toggleSelect(r.recordId!); return }
  lbIndex.value = i
  lbItem.value = r
}
function step(d: number) {
  const n = lbIndex.value + d
  if (n >= 0 && n < items.value.length) { lbIndex.value = n; lbItem.value = items.value[n] }
}

async function copyUrl(r: UploadItem) {
  const ok = await copyText(r.url)
  if (!ok) alert('复制失败')
}
async function shareItem(r: UploadItem) {
  try {
    const data: any = await kvApi.post('?share-create=1', { recordId: r.recordId })
    const url = `${location.origin}/s/${data.token}`
    const ok = await copyText(url)
    alert(ok ? `分享链接已复制：\n${url}` : `分享链接：\n${url}`)
  } catch (e: any) {
    alert(e?.message || '创建分享失败')
  }
}

function askDelete(r: UploadItem) { toDelete.value = r }
async function doDelete() {
  const r = toDelete.value
  toDelete.value = null
  if (!r?.recordId) return
  try {
    await kvApi.delete('', { params: { id: r.recordId } })
    items.value = items.value.filter((x) => x.recordId !== r.recordId)
    total.value--
  } catch (e: any) { alert(e?.message || '删除失败') }
}
async function doBatchDelete() {
  confirmBatchDelete.value = false
  const ids = [...selected.value]
  if (!ids.length) return
  try {
    const params = new URLSearchParams()
    ids.forEach((id) => params.append('id', id))
    await kvApi.delete(`?${params.toString()}`)
    const set = new Set(ids)
    items.value = items.value.filter((x) => !set.has(x.recordId!))
    total.value -= ids.length
    selected.value.clear()
  } catch (e: any) { alert(e?.message || '删除失败') }
}

function onKey(e: KeyboardEvent) {
  if (lbItem.value) {
    if (e.key === 'Escape') lbItem.value = null
    if (e.key === 'ArrowLeft') step(-1)
    if (e.key === 'ArrowRight') step(1)
  }
}

onMounted(() => { window.addEventListener('keydown', onKey); load() })
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>
