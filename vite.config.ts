import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  server: {
    // `npm run dev` serves the app; `npm run dev:worker` runs the API on 8787.
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
