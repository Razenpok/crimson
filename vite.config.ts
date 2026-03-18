import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  server: {
    port: 3000,
  },
  build: {
    target: 'es2022',
  },
  resolve: {
    alias: {
      '@engine': resolve(__dirname, 'src/grim'),
      '@game': resolve(__dirname, 'src/crimson'),
    },
  },
});
