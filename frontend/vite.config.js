import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  envDir: '../',
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    legacy: {
      // Rolldown (Vite 8) is stricter on CJS/ESM interop than Rollup.
      // Several dependencies (axios, supabase-js, etc.) ship as CJS and
      // need this flag to bundle correctly in production.
      inconsistentCjsInterop: true,
    },
  },
})