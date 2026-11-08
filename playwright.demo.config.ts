/**
 * e2e **产物模式**配置（只用于 site-audit 这类"全站逐页"的 spec）
 *
 * 与默认 `playwright.config.ts` 的区别只有一处：webServer 不再起 `vite`（dev），
 * 而是起「已经构建好的 dist-demo + 同一份低代码 mock」的静态服务。
 *
 * ## 为什么值得单独一份配置
 *
 * dev server 每访问一条新路由都要**现编译那页的模块图**，49 页串行导航的代价是
 * 「首访 15s 才渲染」和 `net::ERR_INSUFFICIENT_RESOURCES` 这类环境 flake
 * （机理见 docs/boardui-对照分析 §9.36 / §9.40）。产物模式下模块图已经打好包，
 * 这两条成本直接消失。
 *
 * ## 为什么不直接改主配置
 *
 * 默认配置服务 40 个 spec / 121 条 e2e。切到产物是**全局行为变更**，
 * 会连带影响那些依赖 dev-only 行为的 spec。这里先让 site-audit 单独跑产物，
 * 拿到实测数据再决定要不要全量切。
 *
 * 用法：
 *   npm run build:demo && npx playwright test -c playwright.demo.config.ts
 */
import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_DEMO_PORT || 3722)
const BASE_URL = `http://127.0.0.1:${PORT}`

// 让那些「模块顶层读 E2E_BASE，否则回落 dev 的 3721」的 spec 也能跑在产物上。
// 这是唯一需要改的地方：不用逐个去改 12 个 spec 的常量。
process.env.E2E_BASE ||= BASE_URL

export default defineConfig({
  testDir: './tests/e2e',
  // 只跑"整站逐页"这类受益最明显的 spec
  // 默认只跑「整站逐页」这类受益最明显的 spec；E2E_PROD_ALL=1 时跑全量（评估「能不能整体切产物」）
  testMatch: process.env.E2E_PROD_ALL ? /\.spec\.ts$/ : /site-audit\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  // site-audit 要扫 51 页；全量模式下按单条 90s 兜（有 spec 会在产物下等 dev-only 的东西）
  timeout: process.env.E2E_PROD_ALL ? 90_000 : 25 * 60 * 1000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // 不起 vite dev，而是把产物发出来（不在这里 build：构建失败要与测试失败分开看）
    command: `node scripts/serve-demo-dist.mjs --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
