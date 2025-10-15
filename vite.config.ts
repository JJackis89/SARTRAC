import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3850
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV === 'development',
    minify: 'esbuild',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          leaflet: ['leaflet', 'react-leaflet'],
          icons: ['lucide-react']
        }
      }
    }
  },
  optimizeDeps: {
    include: ['leaflet', 'react-leaflet']
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version)
  }
})