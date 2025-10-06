import { resolve } from 'path'
import { defineConfig } from 'vite'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@bootstrap': resolve(__dirname, 'node_modules/bootstrap'),
    },
  },
  plugins: [ViteImageOptimizer()],
})
