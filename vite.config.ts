import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages deploys under /SARTRAC/; local dev uses /
  base: process.env.GITHUB_ACTIONS ? '/SARTRAC/' : '/',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  server: {
    port: 3850,
    proxy: {
      '/api/github': {
        target: 'https://api.github.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/github/, ''),
        headers: {
          'User-Agent': 'SARTRAC-App'
        }
      },
      '/api/releases': {
        target: 'https://github.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/releases/, ''),
        headers: {
          'User-Agent': 'SARTRAC-App'
        }
      }
    }
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