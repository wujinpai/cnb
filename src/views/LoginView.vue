<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const store = useAppStore()

const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleLogin() {
  if (!password.value.trim()) {
    error.value = '请输入密码'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value })
    })

    const data = await res.json()

    if (data.code === 0) {
      store.login(password.value)
      router.push('/')
    } else {
      error.value = data.msg || '密码错误'
    }
  } catch {
    error.value = '验证失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background">
    <div class="w-full max-w-sm p-8">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 mb-4">
          <svg class="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 class="text-2xl font-semibold text-text-primary">CNB 图床</h1>
        <p class="text-text-secondary mt-2">安全、简洁的图片托管服务</p>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-text-secondary mb-2">
            访问密码
          </label>
          <input
            v-model="password"
            type="password"
            placeholder="请输入访问密码"
            class="w-full px-4 py-3 rounded-xl bg-surface border border-border text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/50 transition"
            @keyup.enter="handleLogin"
          />
        </div>

        <p v-if="error" class="text-sm text-red-500 text-center">
          {{ error }}
        </p>

        <button
          @click="handleLogin"
          :disabled="loading"
          class="w-full py-3 px-4 rounded-xl bg-accent text-white font-medium hover:bg-accent/90 transition disabled:opacity-50"
        >
          {{ loading ? '验证中...' : '确认进入' }}
        </button>
      </div>

      <p class="text-center text-xs text-text-secondary mt-8">
        忘记密码？请联系管理员
      </p>
    </div>
  </div>
</template>
