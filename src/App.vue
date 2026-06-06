<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { watch, onMounted } from 'vue'

const store = useAppStore()

onMounted(() => {
  store.initAuth()
})

watch(
  () => store.theme,
  (theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  },
  { immediate: true }
)
</script>

<template>
  <div class="min-h-screen">
    <div class="gradient-bg"></div>
    <RouterView />
  </div>
</template>
