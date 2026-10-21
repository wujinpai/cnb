<template>
  <div>
    <!-- Hero 上传区 -->
    <section class="text-center pt-6 pb-8">
      <h1 class="text-3xl sm:text-4xl font-bold tracking-tight">图片与小视频托管</h1>
      <p class="mt-2 text-stone-500 dark:text-stone-400">拖拽 / 粘贴 / 点击上传，自动压缩，一键复制链接</p>
    </section>

    <Uploader @uploaded="onUploaded" />

    <!-- 上传设置 -->
    <section class="card mt-4 p-4">
      <button class="w-full flex items-center justify-between text-sm font-medium" @click="showSettings = !showSettings">
        <span class="flex items-center gap-2"><Settings2 :size="16" /> 上传设置</span>
        <ChevronDown :size="16" :class="{ 'rotate-180': showSettings }" class="transition-transform" />
      </button>
      <div v-if="showSettings" class="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
        <label class="flex items-center justify-between gap-3">
          <span>WebP 压缩质量 <b>{{ Math.round(settings.quality * 100) }}%</b></span>
          <input type="range" min="0.3" max="0.95" step="0.05" :value="settings.quality"
            @input="update({ quality: Number(($event.target as HTMLInputElement).value) })" class="w-40" />
        </label>
        <label class="flex items-center justify-between gap-3">
          <span>长边上限 <b>{{ settings.maxDimension || '不限' }}{{ settings.maxDimension ? 'px' : '' }}</b></span>
          <select :value="settings.maxDimension" @change="update({ maxDimension: Number(($event.target as HTMLSelectElement).value) })" class="select !w-40">
            <option :value="0">不限</option>
            <option :value="1024">1024px</option>
            <option :value="2048">2048px</option>
            <option :value="4096">4096px</option>
          </select>
        </label>
        <label class="flex items-center justify-between gap-3 cursor-pointer">
          <span>保留原图（不压缩）</span>
          <input type="checkbox" :checked="settings.keepOriginal" @change="update({ keepOriginal: ($event.target as HTMLInputElement).checked })" class="w-4 h-4" />
        </label>
        <label class="flex items-center justify-between gap-3 cursor-pointer">
          <span>生成缩略图</span>
          <input type="checkbox" :checked="settings.generateThumbnail" @change="update({ generateThumbnail: ($event.target as HTMLInputElement).checked })" class="w-4 h-4" />
        </label>
      </div>
    </section>

    <!-- 本次上传结果 -->
    <section v-if="results.length" class="mt-8">
      <h2 class="text-lg font-semibold mb-3">本次上传（{{ results.length }}）</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ResultCard v-for="r in results" :key="r.recordId" :item="r"
          @preview="openLightbox(r)" @share="shareItem(r)" />
      </div>
    </section>

    <!-- 最近上传 -->
    <section class="mt-8">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-semibold">最近上传</h2>
        <RouterLink to="/manage" class="text-sm text-stone-500 hover:underline">全部 →</RouterLink>
      </div>
      <div v-if="recent.length" class="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <div v-for="r in recent" :key="r.recordId || r.url" class="card overflow-hidden cursor-pointer group !p-0" @click="openLightbox(r)">
          <div class="aspect-square overflow-hidden bg-stone-100 dark:bg-stone-800">
            <img v-if="!r.isVideo" :src="r.thumbnailUrl || r.url" :alt="r.name" loading="lazy" class="h-full w-full object-cover group-hover:opacity-90 transition" />
            <div v-else class="relative h-full w-full">
              <video :src="r.url" class="h-full w-full object-cover" preload="metadata" muted playsinline />
              <span class="absolute inset-0 grid place-items-center bg-black/20"><Play :size="28" class="text-white" /></span>
            </div>
          </div>
        </div>
      </div>
      <p v-else class="text-sm text-stone-400 text-center py-8">还没有上传，快把第一张图拖进来吧</p>
    </section>

    <Lightbox :item="lbItem" :has-prev="lbIndex > 0" :has-next="lbIndex < lbList.length - 1"
      @close="lbItem = null" @prev="step(-1)" @next="step(1)"
      @share="shareItem" @delete="askDelete" />
    <ConfirmDialog :show="!!toDelete" title="移入回收站" message="文件将移入回收站，30 天后自动彻底删除。"
      @cancel="toDelete = null" @confirm="doDelete" />
    <ShareDialog :item="shareTarget" @close="shareTarget = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Settings2, ChevronDown, Play } from 'lucide-vue-next'
import Uploader from '@/components/Uploader.vue'
import ResultCard from '@/components/ResultCard.vue'
import Lightbox from '@/components/Lightbox.vue'
import ShareDialog from '@/components/ShareDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { kvApi, nodeApi } from '@/utils/api'
import { useUploadSettings } from '@/composables/useUploadSettings'
import type { UploadItem } from '@/utils/formatLinks'

const { settings, update, pull } = useUploadSettings()
const showSettings = ref(false)
const results = ref<UploadItem[]>([])
const recent = ref<UploadItem[]>([])

const lbList = ref<UploadItem[]>([])
const lbIndex = ref(0)
const lbItem = ref<UploadItem | null>(null)

function onUploaded(items: UploadItem[]) {
  results.value.unshift(...items)
  loadRecent()
}

function openLightbox(item: UploadItem) {
  const list = [...results.value, ...recent.value]
  const i = list.findIndex((x) => (x.recordId || x.url) === (item.recordId || item.url))
  lbList.value = i >= 0 ? list : [item]
  lbIndex.value = Math.max(0, i)
  lbItem.value = lbList.value[lbIndex.value]
}
function step(d: number) {
  const n = lbIndex.value + d
  if (n >= 0 && n < lbList.value.length) {
    lbIndex.value = n
    lbItem.value = lbList.value[n]
  }
}
function onKey(e: KeyboardEvent) {
  if (!lbItem.value) return
  if (e.key === 'Escape') lbItem.value = null
  if (e.key === 'ArrowLeft') step(-1)
  if (e.key === 'ArrowRight') step(1)
}

const shareTarget = ref<UploadItem | null>(null)
function shareItem(item: UploadItem) {
  if (!item.recordId) return
  shareTarget.value = item
}

const toDelete = ref<UploadItem | null>(null)
function askDelete(item: UploadItem) {
  lbItem.value = null
  toDelete.value = item
}
async function doDelete() {
  const item = toDelete.value
  toDelete.value = null
  if (!item?.recordId) return
  try {
    await kvApi.delete('', { params: { id: item.recordId } })
    results.value = results.value.filter((x) => x.recordId !== item.recordId)
    recent.value = recent.value.filter((x) => x.recordId !== item.recordId)
  } catch (e: any) {
    alert(e?.message || '删除失败')
  }
}

async function loadRecent() {
  try {
    const data: any = await kvApi.get('?recent=12')
    recent.value = (data.records || []).map((r: any) => ({
      url: r.url, thumbnailUrl: r.thumbnailUrl, name: r.name,
      size: r.size, type: r.type, isVideo: !!r.isVideo, recordId: r.id,
    }))
  } catch { /* ignore */ }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  pull()
  loadRecent()
  // SSO 回调带回来的 token 由 LoginView 处理；这里顺带拉一次配置
  nodeApi.get('/config').catch(() => {})
})
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>
