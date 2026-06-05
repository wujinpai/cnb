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
  <div class="min-h-screen">
    <NavBar />

    <main class="max-w-6xl mx-auto px-4 py-8">
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-2xl font-bold gradient-text">📸 我的相册</h1>
          <p class="text-sm text-text-secondary mt-2">共 <span class="gradient-text font-bold">{{ images.length }}</span> 张图片</p>
        </div>
        <button
          @click="fetchImages"
          class="px-6 py-3 rounded-xl gradient-btn text-white font-semibold transition-all duration-300 hover:scale-105 shadow-lg"
        >
          🔄 刷新
        </button>
      </div>

      <div v-if="error" class="mb-6 glass-card rounded-2xl p-4 border-red-500/30 bg-red-500/10">
        <div class="flex items-center gap-3 text-red-500">
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="font-medium">{{ error }}</span>
        </div>
      </div>

      <ImageGrid :images="images" :loading="loading" @select="handleSelect" />

      <div
        v-if="!loading && images.length === 0"
        class="text-center py-20"
      >
        <div class="w-24 h-24 mx-auto mb-6 rounded-3xl glass-card flex items-center justify-center shadow-lg">
          <svg class="w-12 h-12 gradient-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p class="text-text-secondary text-lg font-medium">还没有上传过图片</p>
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
