/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Root-relative paths so the site works unchanged on pages.dev or a custom domain.
  base: '/',
  // Generated pipeline output is served as static files.
  publicDir: 'data',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
