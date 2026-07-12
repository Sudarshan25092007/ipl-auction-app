import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['TEST/**/*.test.ts'],
    setupFiles: ['./TEST/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/frontend/src'),
      react: path.resolve(__dirname, './apps/frontend/node_modules/react'),
      'react-dom': path.resolve(
        __dirname,
        './apps/frontend/node_modules/react-dom'
      ),
      next: path.resolve(__dirname, './node_modules/next'),
    },
  },
});
