import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'virtual:pwa-register': fileURLToPath(new URL('./src/pwa-register-stub.ts', import.meta.url)),
    },
  },
  server: { host: '127.0.0.1' },
});
