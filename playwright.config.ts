import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 配置
 *
 * 运行方式：
 *   npx playwright test              # 运行所有 E2E 测试
 *   npx playwright test --headed     # 有头模式
 *   npx playwright test --ui         # UI 模式
 *   npx playwright codegen           # 录制测试
 *
 * 前置条件：
 *   1. 本机装有 Chrome（project 用 channel: 'chrome'）
 *   2. 不用手动起服务：webServer 会带 VITE_NO_HTTPS=1 自己起一个明文 HTTP 服务。
 *      仓库里放了 key.pem/cert.pem 时 `npm run dev` 默认走 HTTPS，自签证书会让 Playwright
 *      的探活请求直接失败（http 探 https 端口 / https 探自签证书都不通），所以 e2e 固定用 HTTP，
 *      并且不复用已在跑的 dev server —— 它的协议可能是 HTTPS。端口被占时先关掉已在跑的那个。
 */
const PORT = 3721
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  /**
   * 本机也重试 1 次（2026-10-22 修）。
   *
   * ## 为什么原来只给 CI 重试是错的
   *
   * 原配置 `retries: process.env.CI ? 2 : 0` 的隐含假设是「CI 会跑，本机只是快检」。
   * 但这个项目**没有 git remote，CI 从不运行** —— 本机整链就是唯一的门禁。
   * 于是 e2e 的任何一次偶发超时都会**直接断链**，而偶发是真实存在的：
   * 本会话记录到 3 次（`site-audit` 超时、`table-row-line` beforeEach 超时、
   * `demo-dynamic-nav` 侧栏不可见），**三次单独重跑全部通过**。
   *
   * 根因不是测试不稳，而是**整链跑到第 32 步时机器已被前 31 步耗尽**：
   * 实测该时刻有 46 个 node 进程 / 5.1 GB 内存（其中 5 个是 MCP 服务常驻，
   * 剩下的来自 vite / playwright / vitest 的残留）。
   *
   * ## 为什么是「重试」而不是「等资源」
   *
   * 资源不足是环境事实，脚本无法可靠地等它恢复（等多久算够？）。
   * 而 Playwright 的重试语义恰好区分了两类失败：
   *   · 真失败 → 重试仍失败 → 整链红（该红）
   *   · 偶发超时 → 重试通过 → 整链绿（该绿）
   * 且 `trace: 'on-first-retry'` 本来就是为这个场景设计的 —— 首次失败会留 trace，
   * 不会因为重试通过就把现场丢掉。
   *
   * 给 1 次（不是 2 次）：本机只有偶发、没有环境差异，1 次足够区分；
   * 2 次会让真失败多耗一轮（e2e 单轮约 8-11 分钟）。
   */
  retries: process.env.CI ? 2 : 1,
  // 本机也走串行：扫码类用例要在浏览器里实时解二维码，并行时多个浏览器抢 CPU 会解不出来，
  // 表现为「失败点在三个扫码用例之间漂、单跑必过」的假红（45s 预算仍被打满过一次）。
  // 实测代价：本机 25 条并行 4.1 分钟 → 串行 4.7 分钟，只多 36 秒（全站审计一条就占 3.5 分钟）。
  workers: 1,
  reporter: [['html', { outputFolder: 'reports/e2e-html' }], ['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      // 用 Playwright 自带 Chromium（版本随 playwright 锁定，CI 上 `playwright install` 即可复现）；
      // 不用 channel: 'chrome' —— 那依赖 runner 预装的 Google Chrome，版本不可控
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    env: { VITE_NO_HTTPS: '1' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
