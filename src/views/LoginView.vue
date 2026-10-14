<template>
  <div class="max-w-sm mx-auto pt-16 text-center">
    <img src="/favicon.png" class="mx-auto w-16 h-16 rounded-2xl mb-6" alt="己素图床" />
    <h1 class="text-2xl font-bold">登录己素图床</h1>
    <p class="mt-2 text-sm text-stone-500 dark:text-stone-400">使用己素账号一键登录</p>

    <div v-if="!configured" class="card mt-6 p-4 text-sm text-left">
      <p class="font-medium flex items-center gap-2"><TriangleAlert :size="16" class="text-amber-500" /> 未配置登录</p>
      <p class="mt-2 text-stone-500 dark:text-stone-400">
        管理员请在 EdgeOne 控制台设置 <code>NOTE_PRO_URL</code> 与 <code>SSO_SECRET</code> 环境变量后重新部署，
        并在 NotePro 管理后台的 SSO 设置中把本站回调地址加入白名单。
      </p>
    </div>

    <template v-else>
      <label class="mt-6 flex items-center justify-center gap-2 text-sm cursor-pointer select-none">
        <input type="checkbox" v-model="remember" class="w-4 h-4" /> 记住我（7 天）
      </label>
      <button class="btn btn-primary w-full mt-3 !py-3 !text-base" :disabled="loading" @click="login">
        <KeyRound :size="18" /> {{ loading ? '跳转中…' : '用己素账号登录' }}
      </button>
      <p v-if="error" class="mt-3 text-sm text-red-600 dark:text-red-400">{{ error }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { KeyRound, TriangleAlert } from 'lucide-vue-next'
import { nodeApi } from '@/utils/api'
import { setToken, isTokenLive, getToken } from '@/utils/auth'

const route = useRoute()
const router = useRouter()
const configured = ref(true)
const loading = ref(false)
const error = ref('')
const remember = ref(true)

// SSO 回调：?token=xxx&name=xxx
async function handleCallback() {
  const token = route.query.token as string
  if (!token || !isTokenLive(token)) return
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
  if (route.query.token) {
    await handleCallback()
    return
  }
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
