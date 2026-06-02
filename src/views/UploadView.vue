<script setup lang="ts">
import { ref } from 'vue'
import NavBar from '@/components/layout/NavBar.vue'
import DropZone from '@/components/DropZone.vue'
import UploadCard from '@/components/UploadCard.vue'
import { useUpload, type UploadResult, type UploadOptions } from '@/composables/useUpload'

const { uploading, progress, error, processing, upload } = useUpload()

const uploadedFiles = ref<UploadResult[]>([])
const uploadQueue = ref<File[]>([])
const currentUploadIndex = ref(0)

const generateThumbnail = ref(false)

async function handleFiles(files: File[]) {
  if (files.length === 0) return

  const options: UploadOptions = {
    generateThumbnail: generateThumbnail.value,
    thumbnailMaxWidth: 400,
    thumbnailMaxHeight: 800,
    thumbnailQuality: 0.6,
  }

  uploadQueue.value = files
  currentUploadIndex.value = 0

  for (let i = 0; i < files.length; i++) {
    currentUploadIndex.value = i
    const result = await upload(files[i], options)
    if (result) {
      uploadedFiles.value.unshift(result)
    }
  }

  uploadQueue.value = []
}

function getUploadProgress() {
  if (uploadQueue.value.length === 0) return progress.value
  const baseProgress = (currentUploadIndex.value / uploadQueue.value.length) * 100
  const currentFileProgress = (progress.value / uploadQueue.value.length)
  return baseProgress + currentFileProgress
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <NavBar />

    <main class="max-w-3xl mx-auto px-4 py-8">
      <div class="space-y-4 rounded-xl border border-border bg-surface p-5">
        <div class="flex items-center justify-between">
          <label for="thumbnail-toggle" class="text-xs text-text-secondary">生成缩略图</label>
          <button
            id="thumbnail-toggle"
            type="button"
            role="switch"
            :aria-checked="generateThumbnail"
            @click="generateThumbnail = !generateThumbnail"
            :class="[
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
              generateThumbnail ? 'bg-accent' : 'bg-surface-elevated'
            ]"
          >
            <span
              :class="[
                'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                generateThumbnail ? 'translate-x-4' : 'translate-x-0'
              ]"
            />
          </button>
        </div>
      </div>

      <DropZone @files="handleFiles" class="mt-4" />

      <div v-if="processing" class="mt-6">
        <div class="flex items-center gap-2 text-sm text-text-secondary">
          <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>图片处理中...</span>
        </div>
      </div>

    <div v-if="uploading" class="mt-6">
      <div class="flex items-center justify-between text-sm mb-2">
        <span class="text-text-secondary">上传中...</span>
        <span class="text-text-primary font-medium">
          {{ uploadQueue.length > 0 ? `${currentUploadIndex + 1}/${uploadQueue.length}` : '' }}
          {{ Math.round(getUploadProgress()) }}%
        </span>
      </div>
      <div class="h-2 bg-surface-elevated rounded-full overflow-hidden">
        <div
          class="h-full bg-accent transition-all duration-300 rounded-full"
          :style="{ width: getUploadProgress() + '%' }"
        />
      </div>
    </div>

      <div v-if="error" class="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
        {{ error }}
      </div>

      <div v-if="uploadedFiles.length > 0" class="mt-8">
        <h2 class="text-lg font-medium text-text-primary mb-4">
          已上传 ({{ uploadedFiles.length }})
        </h2>
        <div class="space-y-4">
          <UploadCard
            v-for="file in uploadedFiles"
            :key="file.url"
            :url="file.url"
            :name="file.name"
            :size="file.size"
            :type="file.type"
            :has-thumbnail="file.hasThumbnail"
            :thumbnail-url="file.thumbnailUrl"
            :thumbnail-width="file.thumbnailWidth"
            :thumbnail-height="file.thumbnailHeight"
            :thumbnail-size="file.thumbnailSize"
          />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
</style>
