import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/integration/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 10000, // 10 seconds
  },
}); 