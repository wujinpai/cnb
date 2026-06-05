<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  (e: 'files', files: File[]): void
}>()

const isDragging = ref(false)
const inputRef = ref<HTMLInputElement>()

function isMediaFile(file: File): boolean {
  return file.type.startsWith('image/') || file.type.startsWith('video/')
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave() {
  isDragging.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false

  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    const fileArray = Array.from(files).filter(isMediaFile)
    if (fileArray.length > 0) {
      emit('files', fileArray)
    }
  }
}

function handleClick() {
  inputRef.value?.click()
}

function handleInputChange(e: Event) {
  const target = e.target as HTMLInputElement
  const files = target.files
  if (files && files.length > 0) {
    const fileArray = Array.from(files).filter(isMediaFile)
    if (fileArray.length > 0) {
      emit('files', fileArray)
    }
  }
  target.value = ''
}
</script>

<template>
  <div
    :class="[
      'relative border-2 border-dashed rounded-3xl p-16 text-center transition-all cursor-pointer upload-dropzone glass-card',
      isDragging ? 'dragging' : ''
    ]"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
    @click="handleClick"
  >
    <input
        ref="inputRef"
        type="file"
        accept="image/*,video/*"
        multiple
        class="hidden"
        @change="handleInputChange"
      />

    <div class="flex flex-col items-center gap-6">
      <div
        :class="[
          'w-20 h-20 rounded-3xl flex items-center justify-center transition-all duration-300',
          isDragging ? 'bg-accent/20 scale-110' : 'bg-surface-elevated'
        ]"
      >
        <svg
          :class="[
            'w-10 h-10 transition-all duration-300',
            isDragging ? 'text-accent scale-110' : 'text-text-secondary'
          ]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
      </div>

      <div>
          <p class="text-text-primary font-semibold text-lg">
            {{ isDragging ? '✨ 松开以上传' : '拖拽图片或视频到此处' }}
          </p>
          <p class="text-text-secondary text-sm mt-2">或点击选择文件（支持多选）</p>
        </div>

      <p class="text-text-secondary text-sm font-medium">
        支持 jpg, png, gif, webp, mp4, mov · 最大 <span class="gradient-text font-bold">50MB</span>
      </p>
    </div>
  </div>
</template>
