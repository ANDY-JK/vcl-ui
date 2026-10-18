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
    // vmThreads：happy-dom 环境按 worker 复用而非每文件重建（threads 池下实测创建 171 次、
    // 占 tracked time 44%）。per-file 隔离由默认 isolate:true 保持在 VM 上下文层，
    // 模块级单例（useTheme 等）不跨文件泄漏——2026-09-30 F11 实测 1628 用例全绿后启用。
    pool: 'vmThreads',
    // 单条用例上限 20s —— 默认 5s 在「带覆盖率插桩 + 全库并行」下会误伤大数据挂载用例：
    // 实测 1000~2000 行的 DataTable 挂载单条 2~4s，并行时越过 5s 判失败（不放开就是偶发红），
    // 而真挂死的用例照样会在 20s 处报错，探测能力没丢。
    testTimeout: 20_000,
    // 关掉 worker 端的 console 拦截（2026-10-18）。
    //
    // 起因：整链第 14 步 test:unit 反复出现「全绿却退出码 1」——日志显示
    //   191 files / 1798 tests 全 passed，但 Errors: 1
    //   EnvironmentTeardownError: [vitest-worker]: Closing rpc while "onUserConsoleLog" was pending
    // 即 worker 拆除时仍有一条 console 转发 RPC 在途（测试里有大量**预期内**的噪音：
    // IndexedDB 不可用、组件外调用 composable 等）。vitest 把它记成 unhandled error → 整个
    // 测试步骤判失败。这是**闸口误报**：用例一条没挂，却报红。
    //
    // 为什么用这个开关而不是 onConsoleLog：onConsoleLog 跑在**主进程 reporter** 里，
    // 是 RPC 到达之后才调用，治不了竞态；disableConsoleIntercept 在 worker 端就跳过
    // `setupConsoleLogSpy()`（见 vitest 内部 base chunk），RPC 根本不产生。
    // 代价：测试内 console 输出不再按用例名归属（spy 断言仍在进程内生效，不受影响）。
    disableConsoleIntercept: true,
    // 全局 setup：静默测试环境噪音（composable 组件外调用的生命周期 warn 等）
    setupFiles: ['tests/unit/setup.ts'],
    // 只收集 tests/unit 下的 vitest 用例，tests/*.spec.mjs 为 Playwright 套件，保持独立
    include: ['tests/unit/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      // 'lcov' 会为 lcov.info 额外生成一整份 lcov-report/ 网页（与 'html' 那份内容相同），
      // 而全仓库无人消费 lcov.info（CI 没有覆盖率上传步骤）→ 只留 text + html，产物减半
      reporter: ['text', 'html', 'json'],
      reportsDirectory: 'reports/coverage',
      include: ['src/components/**/*.{ts,vue}'],
      exclude: [
        'src/components/_internal/pinyin-pro/**',
        // 仓内 vendor 的上游代码不算本库的覆盖分母（与 eslint/prettier 同口径排除）
        'src/components/_internal/xlsx/**',
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
