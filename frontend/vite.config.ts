import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Enable minification
    minify: 'terser',
    
    // Code splitting strategy to reduce main bundle size
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Split large dependencies into separate chunks
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react';
          }
          if (id.includes('node_modules/recharts')) {
            return 'recharts';
          }
          if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet')) {
            return 'leaflet';
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'framer-motion';
          }
          if (id.includes('node_modules/lodash-es') || id.includes('node_modules/date-fns')) {
            return 'utils';
          }
        },
        // Optimize chunk names
        chunkFileNames: 'chunks/[name]-[hash].js',
        entryFileNames: '[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    
    // Source maps for production debugging (optional, remove for smaller bundle)
    sourcemap: false,
    
    // CSS minification
    cssMinify: 'lightningcss',
    
    // Library mode disabled (app mode enabled)
    lib: undefined,
    
    // Chunk size warnings
    chunkSizeWarningLimit: 600,
    
    // Report compressed size
    reportCompressedSize: true,
  },
  
  // Optimization options
  optimizeDeps: {
    // Pre-bundle these dependencies at startup
    include: ['react', 'react-dom', 'react-router-dom'],
    // Force exclude from pre-bundling if causing issues
    exclude: [],
  },
})
