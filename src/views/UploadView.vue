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
  <div class="min-h-screen">
    <NavBar />

    <main class="max-w-3xl mx-auto px-4 py-8">
      <div class="space-y-4 glass-card rounded-2xl p-6">
        <div class="flex items-center justify-between">
          <label for="thumbnail-toggle" class="text-xs text-text-secondary">生成缩略图</label>
          <button
            id="thumbnail-toggle"
            type="button"
            role="switch"
            :aria-checked="generateThumbnail"
            @click="generateThumbnail = !generateThumbnail"
            :class="[
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2',
              generateThumbnail ? 'gradient-btn' : 'bg-surface-elevated'
            ]"
          >
            <span
              :class="[
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                generateThumbnail ? 'translate-x-5' : 'translate-x-0'
              ]"
            />
          </button>
        </div>
      </div>

      <DropZone @files="handleFiles" class="mt-4" />

      <div v-if="processing" class="mt-6 glass-card rounded-2xl p-4">
        <div class="flex items-center gap-2 text-sm text-text-secondary">
          <svg class="h-5 w-5 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>媒体处理中...</span>
        </div>
      </div>

    <div v-if="uploading" class="mt-6 glass-card rounded-2xl p-4">
      <div class="flex items-center justify-between text-sm mb-3">
        <span class="text-text-secondary">上传中...</span>
        <span class="text-text-primary font-medium">
          {{ uploadQueue.length > 0 ? `${currentUploadIndex + 1}/${uploadQueue.length}` : '' }}
          <span class="gradient-text font-bold">{{ Math.round(getUploadProgress()) }}%</span>
        </span>
      </div>
      <div class="h-3 bg-surface-elevated rounded-full overflow-hidden">
        <div
          class="h-full gradient-btn transition-all duration-300 rounded-full"
          :style="{ width: getUploadProgress() + '%' }"
        />
      </div>
    </div>

      <div v-if="error" class="mt-6 glass-card rounded-2xl p-4 border-red-500/30 bg-red-500/5">
        <div class="flex items-center gap-2 text-red-500">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="text-sm">{{ error }}</span>
        </div>
      </div>

      <div v-if="uploadedFiles.length > 0" class="mt-8">
        <h2 class="text-xl font-bold gradient-text mb-4">
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
