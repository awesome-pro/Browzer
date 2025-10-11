import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    sourcemap: true,
    minify: false,
    rollupOptions: {
      output: {
        // Preserve module structure for better debugging
        manualChunks: undefined,
      },
    },
  },
  // Enable better error messages
  clearScreen: false,
});
