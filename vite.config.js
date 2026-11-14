import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The midpoint engine is plain ES modules shared with the Edge Functions.
      '@engine': fileURLToPath(new URL('./supabase/functions/_shared/engine', import.meta.url)),
    },
  },
  server: { port: 5190, strictPort: true },
  preview: { port: 5191, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js', 'tests/functions/**/*.test.js'],
  },
})
