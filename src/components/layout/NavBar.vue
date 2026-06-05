<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useRouter, useRoute } from 'vue-router'

const store = useAppStore()
const router = useRouter()
const route = useRoute()

function switchTab(tab: 'upload' | 'album') {
  store.setTab(tab)
  if (tab === 'upload') {
    router.push('/')
  } else {
    router.push('/album')
  }
}

const isUpload = () => route.path === '/'
const isAlbum = () => route.path === '/album'
</script>

<template>
  <header class="sticky top-0 z-20 border-b border-border glass-card">
    <div class="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl gradient-btn flex items-center justify-center shadow-lg">
          <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <span class="font-bold text-xl gradient-text">CNB 图床</span>
      </div>

      <nav class="flex items-center gap-2 p-1.5 rounded-2xl bg-surface-elevated">
        <button
          @click="switchTab('upload')"
          :class="[
            'px-5 py-2 text-sm font-semibold rounded-xl transition-all duration-300',
            isUpload()
              ? 'gradient-btn text-white shadow-lg'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface'
          ]"
        >
          📤 上传
        </button>
        <button
          @click="switchTab('album')"
          :class="[
            'px-5 py-2 text-sm font-semibold rounded-xl transition-all duration-300',
            isAlbum()
              ? 'gradient-btn text-white shadow-lg'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface'
          ]"
        >
          📸 相册
        </button>
      </nav>

      <button
        @click="store.toggleTheme"
        class="w-10 h-10 rounded-xl flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-all duration-300 hover:scale-110"
      >
        <svg v-if="store.theme === 'dark'" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        <svg v-else class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      </button>
    </div>
  </header>
</template>
