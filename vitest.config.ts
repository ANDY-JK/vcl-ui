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
    // ★ pool：forks（2026-10-26 改；原为 vmThreads）
    //
    // 为什么改：vmThreads 下**每个 worker 共用同一份 Vite 转换缓存**，并行跑同一批 .vue 时
    // 会偶发把「主模块」与「?vue&type=style 子模块」串台 —— 组件 import 拿到的是该文件的
    // 样式子模块（CSS-modules 对象），于是渲染报
    //   [Vue warn]: Component is missing template or render function
    //   TypeError: Cannot read properties of undefined (reading 'modules')
    // 实测（同一棵树、未改任何产品代码）：
    //   · vmThreads 全量 ×9 → **4 次红**（1 例 / 11 例 / 185 例不等，单跑该文件必绿，复跑必绿）
    //   · forks    全量 ×5 → **5/5 全绿**
    //   · vmThreads + --no-file-parallelism 全量 ×2 → 2/2 全绿（代价 128s）
    // 代价：forks 约 67s（vmThreads 约 40s，+27s）；换来的是"整链不再随机假红"。
    // 历史注记（2026-09-30 F11）：当初选 vmThreads 是为**省时间** —— threads 池下 happy-dom
    // 环境被创建 171 次、占 tracked time 44%，vmThreads 按 worker 复用。性能收益实测约 27s，
    // 但代价是上面那类**不可自证**的假红（最坏一次 185 例），对"质量链结论可信"伤害更大。
    pool: 'forks',
    // 并发上限（#409）：默认按「核数」开 fork，本机 8 核 → 8 个 fork 同时搭 happy-dom。
    // 争用下**重用例假红**，且红点每轮都不一样（同一棵树、未改任何产品代码实测）：
    //   · chart-wordcloud-degrade → 20009ms（撞 20s 上限，单跑 3.2s）
    //   · fix-regression「requireEmail…」→ 20018ms（单跑 <1s）
    //   · form-target-collect-upload「ZIP 导出」→ 8151ms 且 handler 抛错（单跑 1.2s）
    //   · designer-store / docs-gate / tech-debt-gate 轮流红（tech-debt-gate 单跑 22.6s）
    // 单跑每个都必绿 → 结论是**并行争用**，不是用例本身。留 4 个 fork：总时长约 +15%，
    // 换来"红就是真红"。这也是本仓一贯立场：闸口结论不可信，比闸口慢更糟（见上面 pool 那段）。
    maxWorkers: 4,
    minWorkers: 1,
    // 单条用例上限 60s（#409）：原 20s 是按"理想并行"估的，但 forks 争用下，
    // ZIP/xlsx 真跑、千行表格挂载、子进程闸门自测都能到 20~40s。真挂死的用例照样在 60s 报错，
    // 探测能力没丢；20s 则会稳定误伤上面那几类重用例。
    testTimeout: 60_000,
    // worker 拆除宽限 30s（默认 10s）：满载时 "Timeout terminating forks worker" 会刷屏，
    // 并把用例收尾算成未完成。放宽后交给 vitest 自行回收。
    teardownTimeout: 30_000,
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
