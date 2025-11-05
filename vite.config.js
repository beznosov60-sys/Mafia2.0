import { defineConfig } from 'vite';
import path from 'path';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@scss': path.resolve(__dirname, './src/scss'),
      '@bootstrap': path.resolve(__dirname, './node_modules/bootstrap'),
    },
  },
  plugins: [ViteImageOptimizer()],
});

