import { defineConfig } from 'vite';

export default defineConfig({
  base: '/suspension-pipe-support/',
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: 'index.html',
        calculator: 'calculator.html',
      },
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three';
        },
      },
    },
  },
});
