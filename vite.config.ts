import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base יחסי כדי שהאתר יעבוד גם בכתובת משנה של GitHub Pages
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { sourcemap: false, chunkSizeWarningLimit: 800 },
});
