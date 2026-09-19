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
    // 单条用例上限 20s —— 默认 5s 在「带覆盖率插桩 + 全库并行」下会误伤大数据挂载用例：
    // 实测 1000~2000 行的 DataTable 挂载单条 2~4s，并行时越过 5s 判失败（不放开就是偶发红），
    // 而真挂死的用例照样会在 20s 处报错，探测能力没丢。
    testTimeout: 20_000,
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
      // 覆盖率阈值 — 2026-09-20 测试入库扩量后基线（1139 用例）
      // 实测：54.69 stmts / 46.33 branch / 51.37 funcs / 56.90 lines
      // 地板留 4~5 个点余量，低于即失败防回退；测试再增长按同口径上调
      // 已知结构性洼地：storage/indexedDB.ts（happy-dom 无原生 IDB，靠 e2e 覆盖）
      thresholds: {
        statements: 50,
        branches: 42,
        functions: 46,
        lines: 52,
      },
    },
  },
})
