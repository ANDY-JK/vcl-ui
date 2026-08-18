import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 配置
 *
 * 运行方式：
 *   npx playwright test              # 运行所有 E2E 测试
 *   npx playwright test --headed     # 有头模式
 *   npx playwright test --ui         # UI 模式
 *   npx playwright codegen          # 录制测试
 *
 * 前置条件：
 *   1. 安装浏览器：npx playwright install
 *   2. 开发服务器运行中：npm run dev (port 3721)
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'reports/e2e-html' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:3721',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  // 自动启动开发服务器
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3721',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
