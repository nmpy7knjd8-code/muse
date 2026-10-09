import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app under https://<user>.github.io/<repo>/, so production builds use that
// sub-path. Override with BASE_PATH=/ only after a verified custom domain serves at the apex.
// Dev server stays at '/'.
const PAGES_BASE = '/muse/';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'serve' && !isPreview ? '/' : (process.env.BASE_PATH || PAGES_BASE),
  plugins: [react()],
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
}));
