<template>
  <div class="min-h-screen bg-stone-100 text-stone-900 dark:bg-stone-950 dark:text-stone-100 transition-colors">
    <header class="sticky top-0 z-40 backdrop-blur bg-stone-100/80 dark:bg-stone-950/80 border-b border-stone-200 dark:border-stone-800">
      <div class="max-w-6xl mx-auto px-4 h-14 flex items-center gap-2">
        <RouterLink to="/" class="flex items-center gap-2 font-semibold text-lg tracking-tight">
          <span class="w-8 h-8 rounded-xl bg-stone-900 dark:bg-stone-100 text-stone-100 dark:text-stone-900 grid place-items-center">
            <ImageIcon :size="18" />
          </span>
          <span>己素图床</span>
        </RouterLink>
        <nav class="ml-6 hidden sm:flex items-center gap-1 text-sm">
          <RouterLink to="/" class="nav-link" active-class="nav-active">上传</RouterLink>
          <RouterLink to="/manage" class="nav-link" active-class="nav-active">管理</RouterLink>
          <RouterLink to="/trash" class="nav-link" active-class="nav-active">回收站</RouterLink>
        </nav>
        <div class="flex-1" />
        <button class="icon-btn" @click="toggleTheme" :title="theme === 'dark' ? '浅色模式' : '深色模式'">
          <Sun v-if="theme === 'dark'" :size="18" />
          <Moon v-else :size="18" />
        </button>
        <template v-if="authed">
          <span class="text-sm text-stone-500 dark:text-stone-400 hidden sm:inline">{{ userName }}</span>
          <button class="icon-btn" @click="logout" title="退出登录">
            <LogOut :size="18" />
          </button>
        </template>
        <nav class="sm:hidden flex items-center gap-1 text-sm ml-2">
          <RouterLink to="/manage" class="nav-link" active-class="nav-active">管理</RouterLink>
          <RouterLink to="/trash" class="nav-link" active-class="nav-active">回收站</RouterLink>
        </nav>
      </div>
    </header>
    <main class="max-w-6xl mx-auto px-4 py-6">
      <RouterView />
    </main>
    <footer class="max-w-6xl mx-auto px-4 pb-8 text-center text-xs text-stone-400 dark:text-stone-600">
      图片与小视频托管 · 用己素账号登录
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Image as ImageIcon, Sun, Moon, LogOut } from 'lucide-vue-next'
import { useTheme } from '@/composables/useTheme'
import { getToken, getUser, clearToken, isTokenLive } from '@/utils/auth'
import { nodeApi } from '@/utils/api'

const { theme, toggle: toggleTheme } = useTheme()
const router = useRouter()

const authed = computed(() => {
  const t = getToken()
  return !!t && isTokenLive(t)
})
const userName = computed(() => getUser()?.name || '')

async function logout() {
  try { await nodeApi.post('/auth/logout') } catch { /* ignore */ }
  clearToken()
  router.push('/login')
}
</script>

<style>
.nav-link {
  padding: 0.4rem 0.8rem;
  border-radius: 0.6rem;
  color: inherit;
  opacity: 0.65;
}
.nav-link:hover { opacity: 1; background: rgba(0,0,0,0.05); }
.dark .nav-link:hover { background: rgba(255,255,255,0.07); }
.nav-active { opacity: 1; font-weight: 600; }
.icon-btn {
  width: 2.25rem; height: 2.25rem;
  display: grid; place-items: center;
  border-radius: 0.6rem; opacity: 0.7;
}
.icon-btn:hover { opacity: 1; background: rgba(0,0,0,0.05); }
.dark .icon-btn:hover { background: rgba(255,255,255,0.07); }
</style>
