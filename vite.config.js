import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // permite acceso desde el celular en la misma red (ej. http://IP:5173)
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['chart.js', 'react-chartjs-2'],
          sweetalert2: ['sweetalert2'],
          pdf: ['jspdf', 'jspdf-autotable'],
        }
      }
    }
  }
})
