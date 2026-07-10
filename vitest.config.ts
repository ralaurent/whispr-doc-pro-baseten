// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'node', // Critical: we are testing serverless functions, not DOM
        globals: true,
        setupFiles: ['./__tests__/setup.ts'], // We'll create this next
        include: ['__tests__/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['app/api/**/*.ts', 'app/actions/**/*.ts', 'lib/**/*.ts'],
        },
        alias: {
            '@': path.resolve(__dirname, './'), // Matches your tsconfig paths
        },
    },
});