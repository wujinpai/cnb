<template>
  <div v-if="show" class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 fade-in" @click.self="$emit('cancel')">
    <div class="card p-5 w-full max-w-sm" @click.stop>
      <h3 class="font-semibold">{{ title }}</h3>
      <p class="mt-2 text-sm text-stone-500 dark:text-stone-400">{{ message }}</p>
      <div class="mt-4 flex justify-end gap-2">
        <button class="btn" @click="$emit('cancel')">取消</button>
        <button class="btn btn-danger" @click="$emit('confirm')">{{ confirmText }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ show: boolean; title: string; message: string; confirmText?: string }>(), {
  confirmText: '删除',
})
defineEmits<{ cancel: []; confirm: [] }>()
</script>
