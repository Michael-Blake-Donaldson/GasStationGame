import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  build: {
    // The direct Three.js prototype is intentionally kept in one initial chunk.
    // Revisit with measured scene data in GS-056 before adding speculative splits.
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/game/campaign/**/*.ts',
        'src/game/persistence/**/*.ts',
        'src/game/serialization/**/*.ts',
        'src/game/simulation/**/*.ts',
        'src/content/**/*.ts',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 75,
      },
    },
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
