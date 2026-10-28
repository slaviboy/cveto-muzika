/// <reference types="vitest/config" />
import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// `npm run dev:https` serves over HTTPS on the LAN so phones are allowed to use the microphone.
export default defineConfig(({ mode }) => {
  const https = mode === 'https'
  return {
    plugins: [react(), tailwindcss(), ...(https ? [basicSsl()] : [])],
    server: { host: https ? true : undefined },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: (id: string) => (id.includes('node_modules/three') ? 'three' : undefined),
        },
      },
    },
    test: {
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
      restoreMocks: true,
    },
  }
})
