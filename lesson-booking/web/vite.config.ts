import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const API = process.env.VITE_API_PROXY ?? 'http://localhost:8787';
const apiPaths = ['/hosts', '/bookings', '/me', '/rules', '/health', '/google'];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // サーバーと共有する型・定数・表示名(../src/shared)。Node に依存しないモジュールだけを置く
  resolve: { alias: { '@shared': fileURLToPath(new URL('../src/shared', import.meta.url)) } },
  server: {
    fs: { allow: ['..'] },
    port: 5174,
    proxy: Object.fromEntries(apiPaths.map((p) => [p, { target: API, changeOrigin: true }])),
  },
});
