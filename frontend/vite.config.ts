import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

// The backend (FastAPI) serves `dist/` at `/` in production, so every API call in the app is a
// relative `/api/...` URL. In development the dev server proxies them to the backend, which
// listens on :8765 unless VITE_API_TARGET says otherwise.
const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:8765'

/**
 * index.html paints a static shell from HTML, CSS and preloaded fonts. The app's code must not
 * compete with those for the first paint, so its entry and the chunks preloaded for it are
 * marked low priority: the browser fetches them alongside, behind what the shell needs.
 */
const codeAfterShell = (): Plugin => ({
  name: 'tabayyun:code-after-shell',
  enforce: 'post',
  transformIndexHtml: (html) =>
    html
      .replace(/<link rel="modulepreload"(?![^>]*fetchpriority)/g, '<link rel="modulepreload" fetchpriority="low"')
      .replace(/<script type="module"(?![^>]*fetchpriority)/g, '<script type="module" fetchpriority="low"'),
})

export default defineConfig({
  plugins: [react(), tailwindcss(), codeAfterShell()],
  // Names this build: the page registers /sw.js?v=<build>, and the worker names its cache after it.
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
  preview: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    rolldownOptions: {
      output: {
        // Only the framework gets a named long-lived chunk. Everything else follows the code
        // that imports it, so what a dialog or an open note needs is fetched with it, on demand,
        // and not with the first screen.
        codeSplitting: {
          groups: [{ name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 20 }],
        },
      },
    },
  },
})
