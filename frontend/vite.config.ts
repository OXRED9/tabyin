import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The backend (FastAPI) serves `dist/` at `/` in production, so every API call in the app is a
// relative `/api/...` URL. In development the dev server proxies them to the backend, which
// listens on :8765 unless VITE_API_TARGET says otherwise.
const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:8765'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
        // Keep the framework and the UI primitives in their own long-lived chunks.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 20 },
            { name: 'ui', test: /node_modules[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
})
