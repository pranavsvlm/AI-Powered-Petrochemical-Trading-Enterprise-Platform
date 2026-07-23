import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
  },
  server: {
    // Dev-only same-origin proxy to the backend, so the renderer never has to deal with CORS.
    // Production points VITE_API_BASE_URL at the deployed backend instead — see src/lib/api-client.ts.
    proxy: {
      '/api': {
        target: process.env.BACKEND_DEV_URL ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
