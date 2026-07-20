import { defineConfig } from 'vite';

export default defineConfig({
  base: '/vsr-subtyping-tool/',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
});
