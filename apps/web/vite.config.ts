import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@living-world/shared-types': fileURLToPath(
        new URL('../../packages/shared-types/src/index.ts', import.meta.url),
      ),
    },
  },
  // Fase 7: split the three.js vendor code out of the app chunk. Total
  // bytes are unchanged; the win is caching — app-code changes no longer
  // invalidate the ~1 MB vendor download, and the two chunks load in
  // parallel. (A lazy split of the 3D scene was rejected: the world IS the
  // first screen, so deferring it would only delay first paint.)
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
  server: { port: 5173 },
  preview: { port: 4173 },
})
