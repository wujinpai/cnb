import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const isAuthenticated = ref(false)
  const password = ref('')
  const theme = ref<'light' | 'dark'>(
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  )
  const currentTab = ref<'upload' | 'album'>('upload')

  function login(pwd: string = '') {
    isAuthenticated.value = true
    password.value = pwd
    sessionStorage.setItem('authenticated', 'true')
    sessionStorage.setItem('password', pwd)
  }

  function logout() {
    isAuthenticated.value = false
    password.value = ''
    sessionStorage.removeItem('authenticated')
    sessionStorage.removeItem('password')
  }

  function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
  }

  function setTab(tab: 'upload' | 'album') {
    currentTab.value = tab
  }

  function initAuth() {
    const stored = sessionStorage.getItem('authenticated')
    if (stored === 'true') {
      isAuthenticated.value = true
      password.value = sessionStorage.getItem('password') || ''
    }
  }

  return {
    isAuthenticated,
    password,
    theme,
    currentTab,
    login,
    logout,
    toggleTheme,
    setTab,
    initAuth
  }
})
