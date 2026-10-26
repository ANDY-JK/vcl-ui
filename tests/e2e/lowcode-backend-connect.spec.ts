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

  // 计数由**后端自己报**：+1 才说明写真的落库了（不是页面内存里的假象）。
  // 用"至少 +1"而不是严格等值：两个 spec 文件**并行**打同一个 dev server，
  // 别的用例也会往里写（严格等值会随并行时序变红，而"写错地方"时它**一次都不会增**，判别力不减）
  await expect
    .poll(async () => (await statOf(status)).records, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(before.records + 1)

  // 断开 → 重连：数据仍在（落在后端，不是页面状态）
  await page.locator('[data-test="backend-disconnect-btn"]').click()
  await page.locator('[data-test="backend-connect-btn"]').click()
  await expect(status).toContainText('已连接', { timeout: 15_000 })
  expect((await statOf(status)).records, '重连后仍能看到那条记录').toBeGreaterThanOrEqual(before.records + 1)
})

/**
 * 造物链闭环：用户在**自己的库**里建表单 —— 设计 → 存进你的后端 → 后端把它下发成导航项 → 重连仍在。
 * 与上一条的区别：上一条验"填表提交"（数据），这条验"用户自建"（结构）。
 */
test('用户在**自己的库**里建表单：保存后后端自报表单数 +1，导航里出现该项，重连后仍在', async ({ page }) => {
  await page.goto(PAGE)
  await page.locator('[data-test="backend-connect-btn"]').click()
  const status = page.locator('[data-test="backend-status"]')
  await expect(status).toContainText('已连接', { timeout: 15_000 })
  const before = await statOf(status)

  // 建表单：点一下组件面板的字段项即加入画布，再走工具栏「保存」→ 弹窗改名 → 确认
  const build = page.locator('.lcn-demo-build')
  await build.locator('.ldp-field-item').first().click()
  await build.getByRole('button', { name: '保存' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('.ld-save-input').fill('你自己的巡检表')
  await dialog.locator('.modal-footer').getByRole('button', { name: '保存' }).click()

  // ① 后端自报的表单数 +1（数据进了**你的库**，不是页面内存）。
  //    同样用"至少 +1"：并行跑时别的文件也会存表单（见上一条测试的注释）
  await expect
    .poll(async () => (await statOf(status)).forms, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(before.forms + 1)

  // ② 导航由后端下发 → 新表单以「我的表单」项出现（保存后不刷新页面）
  const nav = page.locator('.lcn-demo-nav')
  const added = nav.locator('.lcn-demo-item').filter({ hasText: '你自己的巡检表' })
  await expect(added, '保存后它成了导航项（后端下发）').toBeVisible({ timeout: 15_000 })

  // ③ 断开重连：仍在（结构存在后端，不是页面状态）
  await page.locator('[data-test="backend-disconnect-btn"]').click()
  await page.locator('[data-test="backend-connect-btn"]').click()
  await expect(status).toContainText('已连接', { timeout: 15_000 })
  await expect(nav.locator('.lcn-demo-item').filter({ hasText: '你自己的巡检表' }), '重连后仍在').toBeVisible({
    timeout: 15_000,
  })
  expect((await statOf(status)).forms, '重连后表单数也没变少').toBeGreaterThanOrEqual(before.forms + 1)
})

/**
 * 建完还要能改：重命名必须写进**你的库**。
 * 判据用"重连后导航里还是新名字"——导航由后端下发，只改页面显示的话重连就现原形。
 */
test('重命名写进**你的库**：导航项标签跟着变，重连后仍是新名字（且不是新建）', async ({ page }) => {
  await page.goto(PAGE)
  await page.locator('[data-test="backend-connect-btn"]').click()
  const status = page.locator('[data-test="backend-status"]')
  await expect(status).toContainText('已连接', { timeout: 15_000 })

  // 自己建一份再改名：**别动 seed 里那份**。共享后端上"改掉别人依赖的数据"
// 会把另一个 spec（`lowcode-nav-shell` 找 `服务端：客户台账`）打红 —— 上一轮踩的是"新增数据"，
// 这次踩的是"改掉数据"，同一类：凡写共享 fixture，就要自带数据、别动别人的。
  const build = page.locator('.lcn-demo-build')
  await build.locator('.ldp-field-item').first().click()
  await build.getByRole('button', { name: '保存' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('.ld-save-input').fill('待改名表')
  await dialog.locator('.modal-footer').getByRole('button', { name: '保存' }).click()

  // 「我的表单」列表读的是当前 store —— 连上后即你的库
  const admin = page.locator('[data-test="form-admin"]')
  const seedRow = admin.locator('.lcn-admin-row').filter({ hasText: '待改名表' })
  await expect(seedRow, '列表来自当前 store').toBeVisible({ timeout: 15_000 })

  // 记下 id 再按 id 定位：点进"改名态"后名字进了 input 的 value，
  // `hasText` 不再匹配（第一次写这条用例就踩了：fill 一直等到超时）
  const formId = await seedRow.getAttribute('data-form-id')
  expect(formId, '每行要带 data-form-id（稳定定位用）').toBeTruthy()
  const row = admin.locator(`.lcn-admin-row[data-form-id="${formId}"]`)

  await row.locator('[data-test="rename-btn"]').click()
  await row.locator('[data-test="rename-input"]').fill('改过名的台账')
  await row.locator('[data-test="rename-save"]').click()

  // 列表、导航同时变（导航来自后端 → 说明改的是库，不是页面）
  const nav = page.locator('.lcn-demo-nav')
  await expect(admin.locator('.lcn-admin-row').filter({ hasText: '改过名的台账' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(nav.locator('.lcn-demo-item').filter({ hasText: '改过名的台账' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(nav.locator('.lcn-demo-item').filter({ hasText: '待改名表' }), '旧名字要没了').toHaveCount(0)

  // 断开重连：仍是新名字（=改名落了库；若是"新建"则旧项会复活）
  await page.locator('[data-test="backend-disconnect-btn"]').click()
  await page.locator('[data-test="backend-connect-btn"]').click()
  await expect(status).toContainText('已连接', { timeout: 15_000 })
  await expect(nav.locator('.lcn-demo-item').filter({ hasText: '改过名的台账' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(nav.locator('.lcn-demo-item').filter({ hasText: '待改名表' })).toHaveCount(0)
})

/**
 * 能建也要能删：删除必须写进**你的库**。
 * 判据同上：重连后导航里**仍然没有**它 —— 只删了页面状态的话，后端下发的导航会把它带回来。
 */
test('删除写进**你的库**：导航项消失，重连后仍不在', async ({ page }) => {
  await page.goto(PAGE)
  await page.locator('[data-test="backend-connect-btn"]').click()
  const status = page.locator('[data-test="backend-status"]')
  await expect(status).toContainText('已连接', { timeout: 15_000 })

  // 先建一份"待删除表"（别动 seed / 别的用例依赖的项）
  const build = page.locator('.lcn-demo-build')
  await build.locator('.ldp-field-item').first().click()
  await build.getByRole('button', { name: '保存' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('.ld-save-input').fill('待删除表')
  await dialog.locator('.modal-footer').getByRole('button', { name: '保存' }).click()

  const nav = page.locator('.lcn-demo-nav')
  const item = nav.locator('.lcn-demo-item').filter({ hasText: '待删除表' })
  await expect(item, '建好了才谈删').toBeVisible({ timeout: 15_000 })

  // 两步删除：先点「删除」再「确认删除」（避免一键误删用户的表单与它的记录）
  const admin = page.locator('[data-test="form-admin"]')
  const row = admin.locator('.lcn-admin-row').filter({ hasText: '待删除表' })
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.locator('[data-test="delete-btn"]').click()
  await expect(row.locator('[data-test="delete-confirm"]'), '要先确认').toBeVisible()
  await row.locator('[data-test="delete-confirm"]').click()

  await expect(admin.locator('.lcn-admin-row').filter({ hasText: '待删除表' })).toHaveCount(0)
  await expect(item).toHaveCount(0)

  // 断开重连：仍不在（=删除落了库）
  await page.locator('[data-test="backend-disconnect-btn"]').click()
  await page.locator('[data-test="backend-connect-btn"]').click()
  await expect(status).toContainText('已连接', { timeout: 15_000 })
  await expect(item, '重连后不该复活').toHaveCount(0)
})
