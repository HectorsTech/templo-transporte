import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import obfuscator from 'rollup-plugin-obfuscator' // <--- La Trituradora

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    obfuscator({
      global: true,
      options: {
        // Configuración EQUILIBRADA (Seguridad vs Velocidad)
        compact: true,
        controlFlowFlattening: false, // Apagado para evitar bloqueo de thread
        deadCodeInjection: false,     // Apagado para reducir tamaño de bundle
        debugProtection: false,       // Apagado para evitar ciclos de CPU
        disableConsoleOutput: true,
        identifierNamesGenerator: 'hexadecimal',
        log: false,
        numbersToExpressions: false, // Apagado para mejor parsing
        rotateStringArray: true,
        selfDefending: false,        // Apagado, causa muchos problemas de performance
        shuffleStringArray: true,
        splitStrings: false,
        stringArray: true,
        stringArrayEncoding: ['rc4'],
        stringArrayThreshold: 0.5,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['lucide-react'],
          supabase: ['@supabase/supabase-js']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
})