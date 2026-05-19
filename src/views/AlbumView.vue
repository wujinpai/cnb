<script setup lang="ts">
import { ref, onMounted } from 'vue'
import NavBar from '@/components/layout/NavBar.vue'
import ImageGrid from '@/components/ImageGrid.vue'
import ImagePreview from '@/components/ImagePreview.vue'
import { useImages, type ImageRecord } from '@/composables/useImages'

const {
  images,
  loading,
  error,
  fetchImages,
  deleteImage
} = useImages()

const selectedIndex = ref(-1)
const showPreview = ref(false)

function handleSelect(image: ImageRecord) {
  selectedIndex.value = images.value.indexOf(image)
  showPreview.value = true
}

function handleClose() {
  showPreview.value = false
  selectedIndex.value = -1
}

function handlePrev() {
  if (selectedIndex.value > 0) {
    selectedIndex.value--
  }
}

function handleNext() {
  if (selectedIndex.value < images.value.length - 1) {
    selectedIndex.value++
  }
}

async function handleDelete(id: string) {
  if (confirm('确定要删除这张图片吗？')) {
    const success = await deleteImage(id)
    if (success) {
      handleClose()
    }
  }
}

onMounted(() => {
  fetchImages()
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <NavBar />

    <main class="max-w-6xl mx-auto px-4 py-8">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-xl font-semibold text-text-primary">我的相册</h1>
          <p class="text-sm text-text-secondary mt-1">共 {{ images.length }} 张图片</p>
        </div>
        <button
          @click="fetchImages"
          class="px-4 py-2 rounded-lg bg-surface-elevated text-text-secondary hover:text-text-primary transition"
        >
          刷新
        </button>
      </div>

      <div v-if="error" class="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
        {{ error }}
      </div>

      <ImageGrid :images="images" :loading="loading" @select="handleSelect" />

      <div
        v-if="!loading && images.length === 0"
        class="text-center py-20"
      >
        <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-elevated flex items-center justify-center">
          <svg class="w-8 h-8 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p class="text-text-secondary">还没有上传过图片</p>
      </div>
    </main>

    <ImagePreview
      v-if="showPreview && selectedIndex >= 0"
      :image="images[selectedIndex]"
      :has-prev="selectedIndex > 0"
      :has-next="selectedIndex < images.length - 1"
      @close="handleClose"
      @prev="handlePrev"
      @next="handleNext"
      @delete="handleDelete"
    />
  </div>
</template>
