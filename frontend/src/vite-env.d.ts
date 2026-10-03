/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "1" to replay fixture streams instead of calling the backend. */
  readonly VITE_MOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
