// 低代码展示类「真数据」端到端（2026-10-18）
//
// 为什么必须是 e2e：单测里 api 数据源只能用 stub fetch 模拟，**链路是否真的通**——
// 真实网络 → 同源守卫放行 → JSON 解析 → dataPath 取值 → 表格渲染——只有真跑一次才知道。
// 端点由 vite.config 的 lowcodeDemoApiPlugin 提供（仅 dev server，不进构建产物）。
//
// 同时锁负向：把同一个地址换成外域，必须**零请求**且给出可见拒绝原因。
import { test, expect } from '@playwright/test'

/** 分享码：`FD1.<base64url(JSON)>`（编码器本身由单测覆盖，这里只关心视图拿到码之后的行为） */
function shareCode(design: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(design), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `FD1.${b64}`
}

const tableDesign = (apiUrl: string) => ({
  schemaVersion: 3,
  meta: { title: '真数据验证' },
  nodes: [
    {
      id: 'n1',
      type: 'data-table',
      label: '门店明细',
      span: 24,
      displaySource: { kind: 'api', apiUrl, dataPath: 'data.rows' },
      columns: [
        { key: 'sku', label: '编号' },
        { key: 'name', label: '名称' },
        { key: 'qty', label: '数量' },
      ],
    },
  ],
})

test.describe('展示类 · api 数据源走真实 HTTP', () => {
  test('同源接口：真实数据被拉取并渲染成表格', async ({ page }) => {
    const requested: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/api/lowcode-demo/rows')) requested.push(r.url())
    })

    await page.goto(`/#/form/${shareCode(tableDesign('/api/lowcode-demo/rows'))}`)

    // 真实接口确实被请求了一次
    await expect.poll(() => requested.length, { timeout: 15_000 }).toBeGreaterThan(0)

    // 真实数据落到页面上（端点的固定数据，见 vite.config 的 lowcodeDemoApiPlugin）
    await expect(page.getByText('门店 A · 冷藏柜')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('SP-1001')).toBeVisible()
    // 配置的列标题生效（而不是用原始字段名）
    await expect(page.getByText('编号', { exact: true })).toBeVisible()
  })

  test('外域接口：默认被拦，零请求，并显示拒绝原因', async ({ page }) => {
    const leaked: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('attacker.example')) leaked.push(r.url())
    })

    await page.goto(`/#/form/${shareCode(tableDesign('https://attacker.example/rows'))}`)

    await expect(page.getByText(/安全策略拒绝/)).toBeVisible({ timeout: 15_000 })
    expect(leaked, `外域地址不得发出任何请求，实际: ${leaked.join(', ')}`).toHaveLength(0)
  })
})
