<script setup lang="ts">
import type { ImageRecord } from '@/composables/useImages'
import { isVideo } from '@/composables/useImages'

interface Props {
  images: ImageRecord[]
  loading?: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'select', image: ImageRecord): void
}>()
</script>

<template>
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
    <template v-if="loading">
      <div
        v-for="i in 8"
        :key="i"
        class="aspect-square glass-card rounded-2xl animate-pulse"
      />
    </template>

    <template v-else>
      <div
        v-for="image in images"
        :key="image.id"
        class="group flex flex-col glass-card rounded-2xl overflow-hidden cursor-pointer shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.03]"
        @click="emit('select', image)"
      >
        <div class="aspect-square overflow-hidden relative">
          <img
            v-if="!isVideo(image)"
            :src="image.thumbnailUrl || image.url"
            :alt="image.name"
            class="w-full h-full object-cover transition-transform group-hover:scale-110 duration-500"
            loading="lazy"
          />
          <div v-else class="w-full h-full relative">
            <img
              v-if="image.thumbnailUrl"
              :src="image.thumbnailUrl"
              :alt="image.name"
              class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              loading="lazy"
            />
            <div v-else class="w-full h-full bg-surface-elevated flex items-center justify-center">
              <svg class="w-12 h-12 gradient-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="absolute inset-0 flex items-center justify-center bg-black/20">
              <div class="w-14 h-14 rounded-full gradient-btn shadow-xl flex items-center justify-center">
                <svg class="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
        <div class="p-3">
          <p class="text-sm text-text-secondary truncate font-medium" :title="image.name">
            {{ image.name }}
          </p>
        </div>
      </div>
    </template>
  </div>
</template>
