import { ref } from 'vue'

const KEY = 'imgbed-theme'

function initial(): 'light' | 'dark' {
  try {
    const t = localStorage.getItem(KEY)
    if (t === 'light' || t === 'dark') return t
  } catch { /* ignore */ }
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

const theme = ref<'light' | 'dark'>(initial())

function apply() {
  document.documentElement.classList.toggle('dark', theme.value === 'dark')
  try { localStorage.setItem(KEY, theme.value) } catch { /* ignore */ }
}

export function useTheme() {
  const toggle = () => {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    apply()
  }
  return { theme, toggle }
}
