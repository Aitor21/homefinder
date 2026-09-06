import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port comes from the environment so the dev server can coexist with others.
const port = Number(process.env.PORT) || 5173;

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so a built copy runs from any directory: the root of
  // a domain, a subfolder on a shared host, or a GitHub Pages project site.
  // The default of '/' only works at a domain root and fails silently
  // everywhere else, which is the wrong default for something meant to be
  // handed to other people.
  base: './',
  server: { port, host: '127.0.0.1' },
});
