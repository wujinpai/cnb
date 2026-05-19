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
  <header class="sticky top-0 z-20 border-b border-border bg-surface/80 backdrop-blur-lg">
    <div class="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
          <svg class="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <span class="font-semibold text-text-primary">CNB 图床</span>
      </div>

      <nav class="flex items-center gap-1 p-1 rounded-xl bg-surface-elevated">
        <button
          @click="switchTab('upload')"
          :class="[
            'px-4 py-1.5 text-sm font-medium rounded-lg transition',
            isUpload()
              ? 'bg-background text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          ]"
        >
          上传
        </button>
        <button
          @click="switchTab('album')"
          :class="[
            'px-4 py-1.5 text-sm font-medium rounded-lg transition',
            isAlbum()
              ? 'bg-background text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          ]"
        >
          相册
        </button>
      </nav>

      <button
        @click="store.toggleTheme"
        class="w-9 h-9 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition"
      >
        <svg v-if="store.theme === 'dark'" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      </button>
    </div>
  </header>
</template>
