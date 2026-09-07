/// <reference types="vite/client" />
import type { CadenzaApi } from '@shared/api'

declare global {
  interface Window {
    api: CadenzaApi
  }
}

export {}
