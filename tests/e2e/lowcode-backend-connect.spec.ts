import { test, expect, type Locator } from '@playwright/test'

/** 从状态行里读出后端自报的两份数（"已连接：后端自报 1 份表单 · 3 条记录"） */
async function statOf(status: Locator): Promise<{ forms: number; records: number }> {
  const text = (await status.textContent()) ?? ''
  const m = /(\d+)\s*份表单\s*·\s*(\d+)\s*条记录/.exec(text)
  if (!m) throw new Error(`状态行里读不到份数/条数：${text}`)
  return { forms: Number(m[1]), records: Number(m[2]) }
}

/**
 * 「连接你自己的后端」面板（第 114 轮）
 *
 * 两条断言回答两个问题：
 *   ① **真连接**能不能成？（dev server 里就有参考后端：`/api/lowcode-demo/store`）
 *   ② **坏地址**会不会被拦住、而且**真的没发请求**？（"拦住"如果只是界面报错、请求照发，
 *      那令牌就已经送出去了 —— 必须用 network 事件证明它没发出）
 */
const PAGE = '/#/lowcode-nav'

test('连上参考后端：状态行报出后端自报的两份数，出现"断开"；断开后状态消失', async ({ page }) => {
  await page.goto(PAGE)
  const panel = page.locator('[data-test="backend-connect"]')
  await expect(panel, '面板在页面上').toBeVisible()

  // 默认预填的是内置参考后端（同源 → 默认策略放行）
  await expect(page.locator('[data-test="backend-url"]')).toHaveValue('/api/lowcode-demo/store')
  await expect(page.locator('[data-test="backend-status"]'), '还没连之前不该有状态行').toHaveCount(0)

  await page.locator('[data-test="backend-connect-btn"]').click()
  const status = page.locator('[data-test="backend-status"]')
  await expect(status, '连上了要显示后端自报的份数/条数').toContainText('已连接', { timeout: 15_000 })
  await expect(status).toContainText('份表单')
  await expect(page.locator('[data-test="backend-disconnect-btn"]'), '连上后出现"断开"').toBeVisible()

  await page.locator('[data-test="backend-disconnect-btn"]').click()
  await expect(page.locator('[data-test="backend-status"]'), '断开后状态行消失').toHaveCount(0)
  await expect(page.locator('[data-test="backend-disconnect-btn"]')).toHaveCount(0)
})

test('坏地址被**前置**拦住：界面报原因，且 __stats 请求一次都没发出', async ({ page }) => {
  const statsCalls: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('__stats')) statsCalls.push(req.url())
  })

  await page.goto(PAGE)
  await page.locator('[data-test="backend-url"]').fill('javascript:alert(1)')
  await page.locator('[data-test="backend-connect-btn"]').click()

  const status = page.locator('[data-test="backend-status"]')
  await expect(status, '要说清为什么不行').toContainText('不被允许')
  await expect(page.locator('[data-test="backend-disconnect-btn"]'), '没连上就不该有断开按钮').toHaveCount(0)
  expect(statsCalls, '非法地址不该产生任何请求（否则牌子就跟着令牌送出去了）').toHaveLength(0)
})

/**
 * TD-30 的写入闭环：光"连上"不算接好 —— 得证明**写进去的数据落在你的库里**。
 * 这条同时钉住两件事：① 连上后提交走 `activeStore`（不是内置演示后端）；② 后端按库中的表单下发导航项。
 */
test('连上后**写入落在你的库**里：提交一条记录 → 后端自报计数 +1 → 断开重连仍在', async ({ page }) => {
  await page.goto(PAGE)
  await page.locator('[data-test="backend-connect-btn"]').click()
  const status = page.locator('[data-test="backend-status"]')
  await expect(status).toContainText('已连接', { timeout: 15_000 })
  const before = await statOf(status)

  // 导航来自你的后端：里面有「我的表单」（由**库中的表单**派生，否则一份表单都点不到）
  const nav = page.locator('.lcn-demo-nav')
  const formItem = nav.locator('.lcn-demo-item[data-key^="form-"]').first()
  await expect(formItem, '连上后导航里得有你自己库里的表单').toBeVisible({ timeout: 15_000 })
  await formItem.click()

  // 打开的是**库里那份**设计：字段标签来自后端 seed（服务端字段·客户名称）
  const nameBox = page.getByRole('textbox', { name: '服务端字段·客户名称' })
  await expect(nameBox, '设计来自你后端，不是页面内置那份').toBeVisible({ timeout: 15_000 })
  await nameBox.fill('走你自己的库')
  await page.getByRole('button', { name: '提交' }).click()
  await expect(page.locator('[data-event="record-saved"]').first(), '宿主把记录写进了 store').toBeVisible({
    timeout: 15_000,
  })

  // 计数由**后端自己报**：+1 才说明写真的落库了（不是页面内存里的假象）
  await expect(status).toContainText(`${before.records + 1} 条记录`, { timeout: 15_000 })

  // 断开 → 重连：数据仍在（落在后端，不是页面状态）
  await page.locator('[data-test="backend-disconnect-btn"]').click()
  await page.locator('[data-test="backend-connect-btn"]').click()
  await expect(status).toContainText('已连接', { timeout: 15_000 })
  expect((await statOf(status)).records, '重连后仍能看到那条记录').toBe(before.records + 1)
})
