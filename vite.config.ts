import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// Shown in Settings: package version plus the commit, for example "0.2.0 · 1a2b3c4".
function appVersion(): string {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  let sha = process.env.GITHUB_SHA?.slice(0, 7);
  try {
    sha ??= execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    sha = 'local';
  }
  return `${version} · ${sha}`;
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  plugins: [
    svelte(),
    // Service worker: precaches the app shell so the app opens offline.
    // /api/* is never cached; the app handles being offline itself.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Hangi Tracker',
        short_name: 'Hangi',
        description: 'Hangboard sessions, timed and logged.',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f2f2f3',
        theme_color: '#2c455d',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
  server: {
    // `npm run dev` serves the app; `npm run dev:worker` runs the API on 8787.
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
