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
      // 'lcov' 会为 lcov.info 额外生成一整份 lcov-report/ 网页（与 'html' 那份内容相同），
      // 而全仓库无人消费 lcov.info（CI 没有覆盖率上传步骤）→ 只留 text + html，产物减半
      reporter: ['text', 'html'],
      reportsDirectory: 'reports/coverage',
      include: ['src/components/**/*.{ts,vue}'],
      exclude: [
        'src/components/_internal/pinyin-pro/**',
        'src/components/_internal/solar-icons.ts',
        'src/components/wc/**',
      ],
      // 覆盖率阈值 — 2026-09-08 错误防护整改后基线（738 用例）
      // 实测：46.03 stmts / 37.83 branch / 43.27 funcs / 47.87 lines
      // 地板留 5~7 个点余量，低于即失败防回退；测试再增长按同口径上调
      thresholds: {
        statements: 40,
        branches: 32,
        functions: 38,
        lines: 41,
      },
    },
  },
})
