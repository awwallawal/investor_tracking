import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: resolve(__dirname, 'src/setupTests.js'),  // ✅ absolute path
    // Form tests with many user-event steps can pass 5s on a loaded machine.
    testTimeout: 20000,
  },
});
