import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const root = process.cwd();
const rendererRoot = resolve(root, 'src/renderer');

export default defineConfig({
  plugins: [react()],
  root: rendererRoot,
  base: './',
  build: {
    outDir: resolve(root, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        ...(process.env.SPEAKEASY_MAC_STAGING === '1' ? { 'design-review': resolve(rendererRoot, 'design-review/index.html') } : {}),
        onboarding: resolve(rendererRoot, 'onboarding/index.html'),
        overlay: resolve(rendererRoot, 'overlay/index.html'),
        settings: resolve(rendererRoot, 'settings/index.html')
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
