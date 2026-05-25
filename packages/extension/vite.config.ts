import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import path from 'node:path';
import manifest from './manifest.json' with { type: 'json' };

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@hscan/shared-types': path.resolve(__dirname, '../shared-types/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    cors: {
      origin: [/chrome-extension:\/\//],
    },
    hmr: {
      port: 5173,
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
