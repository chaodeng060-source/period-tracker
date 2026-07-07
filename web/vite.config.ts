import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// dev 跑 5173、API 代理到 :8080 的 FastAPI；build 落到 ../static 给生产托管。
export default defineConfig({
  plugins: [react()],
  base: '/static/',
  build: {
    outDir: '../static',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
})
