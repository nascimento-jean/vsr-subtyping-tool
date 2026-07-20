import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [{
    name: 'sites-worker-entrypoint',
    closeBundle() {
      mkdirSync('dist/server', { recursive: true });
      mkdirSync('dist/.openai', { recursive: true });
      writeFileSync('dist/server/index.js', `export default { async fetch(request, env) { return env.ASSETS.fetch(request); } };\n`);
      copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json');
    },
  }],
});
