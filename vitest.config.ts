/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // 与 vite.config.ts 保持一致，组件内部 import '@/components/...'
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'happy-dom',
    // 全局 setup：静默测试环境噪音（composable 组件外调用的生命周期 warn 等）
    setupFiles: ['tests/unit/setup.ts'],
    // 只收集 tests/unit 下的 vitest 用例，tests/*.spec.mjs 为 Playwright 套件，保持独立
    include: ['tests/unit/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/components/**/*.{ts,vue}'],
      exclude: [
        'src/components/_internal/pinyin-pro/**',
        'src/components/_internal/solar-icons.ts',
        'src/components/wc/**',
      ],
      // 覆盖率阈值 — 2026-08-25 审计整改后基线（435 用例）
      // 实测：31.6 stmts / 24.5 branch / 28.8 funcs / 33.1 lines
      // 阈值取基线约 80% 留余量，低于即失败，防覆盖回退；后续随测试增长逐步上调
      thresholds: {
        statements: 25,
        branches: 20,
        functions: 23,
        lines: 26,
      },
    },
  },
})
