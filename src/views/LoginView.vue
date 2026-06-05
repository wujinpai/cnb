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
  <div class="min-h-screen flex items-center justify-center">
    <div class="gradient-bg fixed inset-0"></div>
    <div class="w-full max-w-md p-8 relative z-10">
      <div class="text-center mb-10">
        <div class="inline-flex items-center justify-center w-20 h-20 rounded-2xl gradient-btn shadow-xl mb-6">
          <svg class="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 class="text-3xl font-bold gradient-text mb-2">CNB 图床</h1>
        <p class="text-text-secondary mt-2 text-lg">安全、简洁的图片托管服务</p>
      </div>

      <div class="glass-card rounded-3xl p-8 shadow-2xl">
        <div class="space-y-6">
          <div>
            <label class="block text-sm font-semibold text-text-secondary mb-3">
              🔐 访问密码
            </label>
            <input
              v-model="password"
              type="password"
              placeholder="请输入访问密码"
              class="w-full px-5 py-4 rounded-2xl bg-surface border border-border text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all duration-300 focus:scale-[1.02]"
              @keyup.enter="handleLogin"
            />
          </div>

          <p v-if="error" class="text-sm text-red-500 text-center glass-card bg-red-500/10 rounded-xl py-3 border border-red-500/30">
            {{ error }}
          </p>

          <button
            @click="handleLogin"
            :disabled="loading"
            class="w-full py-4 px-6 rounded-2xl gradient-btn text-white font-semibold transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:scale-100 shadow-lg"
          >
            {{ loading ? '⏳ 验证中...' : '✨ 确认进入' }}
          </button>
        </div>
      </div>

      <p class="text-center text-sm text-text-secondary mt-10">
        忘记密码？请联系管理员
      </p>
    </div>
  </div>
</template>
