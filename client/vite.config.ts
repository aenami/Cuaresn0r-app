import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // El plugin del router debe ir antes que el de react: genera
    // src/routeTree.gen.ts a partir de los archivos en src/routes/.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // Pre-bundlear TODAS las deps en una sola pasada: si el optimizador
  // descubre alguna tarde (lazy imports como los devtools o sonner), crea un
  // segundo chunk de React y la app revienta con "Invalid hook call /
  // useContext of null" por dos instancias de React conviviendo.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'radix-ui',
      'sonner',
      'lucide-react',
      'zustand',
      'zustand/middleware',
      'react-hook-form',
      'zod',
      '@hookform/resolvers/zod',
      '@tanstack/react-query',
      '@tanstack/react-router',
      '@tanstack/react-query-devtools',
      '@tanstack/react-router-devtools',
    ],
  },
})
