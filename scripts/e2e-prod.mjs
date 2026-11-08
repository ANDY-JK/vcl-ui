#!/usr/bin/env node
/**
 * 产物模式跑 e2e（默认全量；`--audit-only` 只跑 site-audit）
 *
 * 为什么不直接在 npm script 里写 `VAR=1 playwright …`：
 * Windows 的 npm script 走 cmd，`VAR=1 cmd` 这种前缀写法不通用。用 Node 起进程最稳。
 *
 * 用法：
 *   node scripts/e2e-prod.mjs                 # 全量（134 条）
 *   node scripts/e2e-prod.mjs --audit-only    # 只跑 site-audit（51 页逐页审计，约 4 分钟）
 *
 * 注意：**不在这里构建**。构建失败与测试失败要分开看（构建属于 step 失败，不该伪装成用例红）。
 * 调用方先跑 `node scripts/build-demo.mjs`。
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const auditOnly = process.argv.includes('--audit-only')

const env = { ...process.env }
if (auditOnly) env.E2E_PROD_AUDIT_ONLY = '1'

// 用 `node <playwright cli>` 而不是 `npx`：Windows 上 spawnSync('npx.cmd') 会直接 EINVAL
// （Node 24 起 .cmd 必须带 shell:true，而 shell:true 又要处理引号注入）。走 node + CLI 路径最稳。
const cli = createRequire(import.meta.url).resolve('@playwright/test/cli')

const res = spawnSync(process.execPath, [cli, 'test', '-c', 'playwright.demo.config.ts'], {
  cwd: ROOT,
  env,
  stdio: 'inherit',
})

if (res.error) {
  // 不要静默失败：进程起不来时 status 是 null，链只会看到"无输出 + 非零"
  console.error('[e2e-prod] 启动 playwright 失败：', res.error.message)
  process.exit(1)
}

process.exit(res.status ?? 1)
