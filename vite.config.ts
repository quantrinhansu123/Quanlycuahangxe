import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: { include: ['xlsx', 'xlsx-js-style'] },
  server: {
    watch: { ignored: ['**/.build-verification/**'] }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['framer-motion', 'lucide-react', 'clsx', 'tailwind-merge'],
          'vendor-charts': ['recharts'],
          'vendor-excel': ['xlsx'],
          'vendor-utils': ['date-fns', 'luxon']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
})
