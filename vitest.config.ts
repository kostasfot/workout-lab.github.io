import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['tests/unit/**/*.test.ts'], maxWorkers: 2, fileParallelism: false, testTimeout: 30000, hookTimeout: 60000 } })
