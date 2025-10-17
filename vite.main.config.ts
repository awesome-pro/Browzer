import { defineConfig } from 'vite';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/main': path.resolve(__dirname, './src/main'),
      '@/renderer': path.resolve(__dirname, './src/renderer'),
      '@/shared': path.resolve(__dirname, './src/shared'),
    },
  },
  build: {
    sourcemap: true,
    minify: false,
    rollupOptions: {
      // Externalize native modules - don't bundle them
      external: ['better-sqlite3'],
      output: {
        // Preserve module structure for better debugging
        manualChunks: undefined,
      },
    },
  },
  // Enable better error messages
  clearScreen: false,
});
