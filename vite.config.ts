import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Electron loads the production UI with file://, so bundled assets must be
  // resolved relative to dist/ instead of the filesystem root.
  base: './',
  plugins: [react()],
  clearScreen: false,
});
