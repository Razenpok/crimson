import { defineConfig } from 'vite';
import { resolve } from 'path';
import unimport from 'unimport/unplugin';

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
      '@grim': resolve(__dirname, 'src/grim'),
      '@crimson': resolve(__dirname, 'src/crimson'),
      '@wgl': resolve(__dirname, 'src/grim/wgl'),
    },
  },
  plugins: [
    unimport.vite({
      imports: [
        { name: 'int', from: 'src/compat' },
      ],
      dts: 'src/types/unimport.d.ts',
    }),
  ]
});
