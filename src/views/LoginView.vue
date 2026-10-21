<template>
  <div class="relative -m-4 sm:-m-6">
    <!-- 必应每日一图背景 -->
    <div v-if="wallpaperLoaded" class="fixed inset-0 z-0">
      <img :src="wallpaper" class="h-full w-full object-cover" alt="" />
      <div class="absolute inset-0 bg-black/45 dark:bg-black/60" />
    </div>
    <div class="max-w-sm mx-auto pt-16 pb-16 text-center relative z-10">
      <img src="/favicon.png" class="mx-auto w-16 h-16 rounded-2xl mb-6 bg-white shadow-lg" alt="己素图床" />
      <h1 class="text-2xl font-bold" :class="{ 'text-white': wallpaperLoaded }">登录己素图床</h1>
      <p class="mt-2 text-sm" :class="wallpaperLoaded ? 'text-white/80' : 'text-stone-500 dark:text-stone-400'">使用己素账号一键登录</p>

      <div v-if="!configured" class="card mt-6 p-4 text-sm text-left">
        <p class="font-medium flex items-center gap-2"><TriangleAlert :size="16" class="text-amber-500" /> 未配置登录</p>
        <p class="mt-2 text-stone-500 dark:text-stone-400">
          管理员请在 EdgeOne 控制台设置 <code>NOTE_PRO_URL</code> 与 <code>SSO_SECRET</code> 环境变量后重新部署，
          并在 NotePro 管理后台的 SSO 设置中把本站回调地址加入白名单。
        </p>
      </div>

      <template v-else>
        <label class="mt-6 flex items-center justify-center gap-2 text-sm cursor-pointer select-none"
          :class="wallpaperLoaded ? 'text-white' : ''">
          <input type="checkbox" v-model="remember" class="w-4 h-4" /> 记住我（7 天）
        </label>
        <button class="btn btn-primary mt-3 !py-3 !text-base !px-10" :disabled="loading" @click="login">
          <KeyRound :size="18" /> {{ loading ? '跳转中…' : '用己素账号登录' }}
        </button>
        <p v-if="error" class="mt-3 text-sm" :class="wallpaperLoaded ? 'text-red-300' : 'text-red-600 dark:text-red-400'">{{ error }}</p>
        <p v-if="wallpaperCopyright && wallpaperLoaded" class="mt-4 text-xs text-white/60">{{ wallpaperCopyright }}</p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { KeyRound, TriangleAlert } from 'lucide-vue-next'
import { nodeApi } from '@/utils/api'
import { setToken } from '@/composables/useAuthState'
import { isTokenLive, getToken } from '@/utils/auth'
import { wallpaperLoaded } from '@/composables/useWallpaperState'

const route = useRoute()
const router = useRouter()
const configured = ref(true)
const loading = ref(false)
const error = ref('')
const remember = ref(true)
const wallpaper = ref('')
const wallpaperCopyright = ref('')

// SSO 回调：?token=xxx&name=xxx
async function handleCallback() {
  const token = route.query.token as string
  if (!token) return
  if (!isTokenLive(token)) {
    error.value = '登录凭证无效或已过期，请重新登录'
    // 清掉 URL 里的 token，避免重复触发
    router.replace({ name: 'login' })
    return
  }
  const name = (route.query.name as string) || ''
  try {
    setToken(token, remember.value, { uid: 0, name, avatar: '' })
    // 拉取真实身份
    const me: any = await nodeApi.get('/auth/me')
    setToken(token, remember.value, { uid: me.user.uid, name: me.user.name, avatar: me.user.avatar || '' })
  } catch { /* token 仍可用 */ }
  const redirect = (route.query.redirect as string) || '/'
  router.replace(redirect)
}

async function login() {
  loading.value = true
  error.value = ''
  try {
    const data: any = await nodeApi.get('/auth/login-url', { params: { remember: remember.value ? '1' : '' } })
    location.href = data.url
  } catch (e: any) {
    error.value = e?.message || '获取登录地址失败'
    loading.value = false
  }
}

onMounted(async () => {
  // 离开登录页时重置壁纸状态，避免页脚在其他页保持白字
  onUnmounted(() => { wallpaperLoaded.value = false })

  // SSO 回调被拒（如非管理员）：显示提示并清掉 URL 参数
  if (route.query.error) {
    error.value = String(route.query.error)
    router.replace({ name: 'login' })
  }

  // SSO 回调带 token：优先处理，直接跳首页，不拉壁纸避免白闪
  if (route.query.token) {
    await handleCallback()
    return
  }

  // 拉必应每日一图做背景：预加载成功后才启用，避免白字配浅底
  nodeApi.get('/bing-wallpaper').then((d: any) => {
    if (d?.url) {
      const img = new Image()
      img.onload = () => {
        wallpaper.value = d.url
        wallpaperCopyright.value = d.copyright || ''
        wallpaperLoaded.value = true
      }
      img.src = d.url
    }
  }).catch(() => { /* 忽略，用默认背景 */ })

  try {
    const cfg: any = await nodeApi.get('/auth/config')
    configured.value = !!cfg.ssoConfigured
  } catch {
    configured.value = false
  }
  // 已登录则跳首页
  const t = getToken()
  if (t && isTokenLive(t)) {
    router.replace((route.query.redirect as string) || '/')
  }
})
</script>
