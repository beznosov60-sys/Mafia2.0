import { defineConfig } from 'vite';
<<<<<<< HEAD
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

=======
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
});
>>>>>>> 4aeb9276f7e7298a19e2a614b311b9d8e06723f1
