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

export default defineConfig({
  testDir: './tests/e2e',
  // 只跑"整站逐页"这类受益最明显的 spec
  testMatch: /site-audit\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 25 * 60 * 1000,
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
