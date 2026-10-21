<template>
  <div v-if="item" class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 fade-in" @click.self="$emit('close')">
    <div class="card p-5 w-full max-w-sm" @click.stop>
      <div class="flex items-start justify-between gap-3">
        <h3 class="font-semibold">分享文件</h3>
        <button class="p-1 -m-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300" @click="$emit('close')">
          <X :size="18" />
        </button>
      </div>
      <p class="mt-1 text-sm text-stone-500 dark:text-stone-400 truncate" :title="item.name">{{ item.name }}</p>

      <div v-if="!link">
        <label class="block mt-4 text-sm font-medium">有效期</label>
        <select v-model="expireHours" class="select mt-1.5 w-full">
          <option :value="0">永久有效</option>
          <option :value="1">1 小时</option>
          <option :value="24">24 小时</option>
          <option :value="168">7 天</option>
          <option :value="720">30 天</option>
        </select>

        <label class="block mt-4 text-sm font-medium">浏览次数上限</label>
        <input v-model="maxViewsStr" type="number" min="1" max="100000" inputmode="numeric"
          placeholder="留空 = 不限次数" class="input mt-1.5 w-full" />
        <p class="mt-2 text-xs text-stone-400">限制只对分享页生效，图片/视频直链不受影响。</p>

        <div class="mt-5 flex justify-end gap-2">
          <button class="btn" @click="$emit('close')">取消</button>
          <button class="btn btn-primary" :disabled="creating" @click="create">
            {{ creating ? '生成中…' : '生成分享链接' }}
          </button>
        </div>
      </div>

      <div v-else>
        <div class="mt-4 flex gap-2">
          <input :value="link" readonly class="input flex-1 min-w-0 text-sm" @focus="($event.target as HTMLInputElement).select()" />
          <button class="btn shrink-0" @click="copyLink">
            <Check v-if="copied" :size="15" class="text-green-600" /> <Copy v-else :size="15" />
            {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <p class="mt-2 text-xs text-stone-400">{{ limitText }}</p>
        <div class="mt-5 flex justify-end">
          <button class="btn" @click="$emit('close')">完成</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { X, Copy, Check } from 'lucide-vue-next'
import { kvApi } from '@/utils/api'
import { copyText } from '@/utils/clipboard'
import type { UploadItem } from '@/utils/formatLinks'

const props = defineProps<{ item: UploadItem | null }>()
defineEmits<{ close: [] }>()

const expireHours = ref(0)
const maxViewsStr = ref('')
const creating = ref(false)
const link = ref('')
const copied = ref(false)
const limitText = ref('')

const EXPIRE_LABELS: Record<number, string> = { 0: '永久有效', 1: '1 小时内有效', 24: '24 小时内有效', 168: '7 天内有效', 720: '30 天内有效' }

watch(() => props.item, (it) => {
  if (it) {
    expireHours.value = 0
    maxViewsStr.value = ''
    link.value = ''
    copied.value = false
    limitText.value = ''
  }
})

async function create() {
  const item = props.item
  if (!item?.recordId || creating.value) return
  const maxViews = Math.floor(Number(maxViewsStr.value) || 0)
  creating.value = true
  try {
    const data: any = await kvApi.post('?share-create=1', {
      recordId: item.recordId,
      expireHours: expireHours.value,
      maxViews,
    })
    link.value = `${location.origin}/s/${data.token}`
    limitText.value = maxViews > 0
      ? `${EXPIRE_LABELS[expireHours.value]} · 最多浏览 ${maxViews} 次`
      : `${EXPIRE_LABELS[expireHours.value]} · 浏览次数不限`
    const ok = await copyText(link.value)
    if (ok) copied.value = true
  } catch (e: any) {
    alert(e?.message || '创建分享失败')
  } finally {
    creating.value = false
  }
}

async function copyLink() {
  const ok = await copyText(link.value)
  if (ok) {
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  }
}
</script>
