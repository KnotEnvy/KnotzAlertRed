import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Every deep Babylon import used by src/render/babylon.ts is pre-bundled up front, so the dev
// server never has to re-optimise (and reload the page) when it discovers one late.
const barrel = readFileSync(new URL('./src/render/babylon.ts', import.meta.url), 'utf8');
const babylonDeps = [...barrel.matchAll(/'(@babylonjs\/core\/[^']+)'/g)].map((m) => m[1]);

export default defineConfig({
  server: { port: 5173, host: true },
  optimizeDeps: { include: babylonDeps },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@babylonjs')) return 'babylon';
          return undefined;
        },
      },
    },
  },
});
