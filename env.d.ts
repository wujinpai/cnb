/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_IMG_URL?: string
}

declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

export {}
