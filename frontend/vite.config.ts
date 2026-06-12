import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import browserslist from 'browserslist'
import { browserslistToTargets } from 'lightningcss'

// Browser floor for the whole app. Tailwind v4 emits oklch()/color-mix()/
// @property and Vite's default JS target is Safari 16 — together that made
// the SPA render a blank black page on any iPhone below iOS 16.4. We compile
// down to Safari 15 instead: LightningCSS rewrites the modern color functions
// into rgb() fallbacks (see css.lightningcss below) and esbuild downlevels the
// JS syntax (see build.target). Keep this list and build.target in sync.
const BROWSER_TARGETS = browserslist([
  'safari >= 15',
  'ios_saf >= 15',
  'last 2 versions',
  '> 0.5%',
  'not dead',
])

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    // Use LightningCSS for the full transform (not just minify) so it
    // downlevels oklch()/color-mix()/cascade-layers to the targets below.
    // Without this, those declarations are dropped by older Safari and the
    // page renders as black-on-black.
    transformer: 'lightningcss',
    lightningcss: {
      targets: browserslistToTargets(BROWSER_TARGETS),
    },
  },
  build: {
    // JS syntax floor. esbuild downlevels modern syntax (e.g. ??=, which the
    // React chunk shipped) so Safari < 16 can parse the bundle and React can
    // actually mount instead of throwing before first paint.
    target: ['es2020', 'safari15'],

    // CSS gets transformed by css.lightningcss above; this keeps the minifier
    // aligned with the same engine.
    cssTarget: ['es2020', 'safari15'],

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
          if (id.includes('node_modules/framer-motion')) {
            return 'framer-motion';
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
