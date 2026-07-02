/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // admin.html(開発専用のメタ情報編集画面)は本番ビルドに含めない。
    // 開発サーバーでは /admin.html として直接アクセスできる。
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
