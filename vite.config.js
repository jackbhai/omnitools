import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  server: { host: '0.0.0.0', port: 3000, strictPort: true, allowedHosts: true,
    hmr: { clientPort: 443, protocol: 'wss' } },
  build: { outDir: 'dist', target: 'es2020' },
});
