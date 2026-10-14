import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '@/composables/useAuthState'
import { isTokenLive } from '@/utils/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/manage', name: 'manage', component: () => import('../views/ManageView.vue') },
    { path: '/trash', name: 'trash', component: () => import('../views/TrashView.vue') },
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
    // 分享页：公开
    { path: '/s/:token', name: 'share', component: () => import('../views/ShareView.vue'), meta: { public: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach((to, _from, next) => {
  if (to.meta.public) return next()
  const t = getToken()
  if (!t || !isTokenLive(t)) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }
  if (to.name === 'login' && t && isTokenLive(t)) {
    return next({ name: 'home' })
  }
  next()
})

export default router
