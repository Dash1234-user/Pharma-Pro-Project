import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    proxy: {
      // During development: every /api/* call is forwarded to Flask
      // So React at :5173 talks to Flask at :5000 seamlessly
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },

  build: {
    // Vite builds into frontend/dist/
    // Flask's serve_static() will serve files from here
    outDir: '../dist',
    emptyOutDir: true,
  },
});
