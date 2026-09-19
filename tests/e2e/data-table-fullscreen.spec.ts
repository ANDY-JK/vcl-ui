// 全屏进出 · 真实浏览器取证
// 退出全屏时那段等待从「固定 250ms」改成「量到原父容器宽度不再变化」——
// 这类改动最怕的不是慢，是节点没搬回去（表格留在 body 上就再也回不了原位）。
// 两点取证口径：
//  1. 进入全屏会把同一个 .table-wrap 移到 body 下 → 全程用 ElementHandle 咬住同一节点，
//     locator 每次重新解析，搬完就指到页面上另一张表了。
//  2. 搬回原父容器发生在「等宽度停下」之后 → 断言等状态（expect.poll），不读一次就下结论。
import { test, expect, type ElementHandle } from '@playwright/test'

const BASE = process.env.E2E_BASE || 'http://localhost:3721'

const clsOf = (el: ElementHandle<Element>) => el.evaluate((n) => n.className as string)
const parentClsOf = (el: ElementHandle<Element>) => el.evaluate((n) => n.parentElement?.className || '')
const styleOf = (el: ElementHandle<Element>) => el.evaluate((n) => n.getAttribute('style') || '')
/** ElementHandle 没有 .locator()，首行是否可见直接量它的矩形 */
const firstRowShown = (el: ElementHandle<Element>) =>
  el.evaluate((n) => {
    const r = n.querySelector('tbody tr')?.getBoundingClientRect()
    return !!r && r.height > 0
  })

test('进出全屏后表格回到原父容器，body 上不留游离节点', async ({ page }) => {
  await page.goto(`${BASE}/#/data-table`)
  const wrap = (await page.locator('.table-wrap').first().elementHandle())!
  await expect.poll(() => firstRowShown(wrap)).toBe(true)
  const parentCls = await parentClsOf(wrap)
  expect(parentCls).toBeTruthy()

  await page.getByTitle('全屏显示').first().click()
  await expect.poll(() => clsOf(wrap)).toContain('fullscreen')
  await expect.poll(() => firstRowShown(wrap)).toBe(true)

  await page.getByTitle('退出全屏').first().click()
  // 归还必须是同步的：点完退出后的下一个任务里就不该再有 body 直挂的表格。
  // 归还前若先去等侧栏动画收尾，这段时间整张表会以"定宽定高静态块"待在 body 末尾，
  // 把宿主页面内容顶开 —— 读一次即时值，而不是 poll（poll 会把这种窗口期等没）。
  const stray = await page.evaluate(() => document.querySelectorAll('body > .table-wrap').length)
  expect(stray, '退出全屏后表格被留在 body 上').toBe(0)
  await expect.poll(() => clsOf(wrap)).not.toContain('fullscreen')
  await expect.poll(() => parentClsOf(wrap)).toBe(parentCls)
  await expect.poll(() => styleOf(wrap)).not.toMatch(/100vw|position: fixed/)
  await expect(page.locator('body > .table-wrap')).toHaveCount(0)
  await expect.poll(() => firstRowShown(wrap)).toBe(true)
})

// 进全屏的等待用自增令牌作废：_fsRun 非 0 被 toggleFullscreen 当成"有等待在飞"。
// 退出分支若无条件 _fsRun++，一进一出之后每次点击都只是"取消一条并不存在的等待"，
// 按钮就此失效 —— 而且第一次的"一进一出"用例正好把它盖住（那次之后再没点过）。
test('全屏按钮可以反复用：进 → 出 → 再进', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 })
  await page.goto(`${BASE}/#/data-table`)
  const wrap = (await page.locator('.table-wrap').first().elementHandle())!
  await expect.poll(() => firstRowShown(wrap)).toBe(true)

  await page.getByTitle('全屏显示').first().click()
  await expect.poll(() => clsOf(wrap)).toContain('fullscreen')
  await page.getByTitle('退出全屏').first().click()
  await expect.poll(() => clsOf(wrap)).not.toContain('fullscreen')

  await page.getByTitle('全屏显示').first().click()
  await expect
    .poll(() => clsOf(wrap), { message: '第二次进全屏没生效：等待令牌被退出分支污染，按钮只能用一次' })
    .toContain('fullscreen')
  await expect.poll(() => firstRowShown(wrap)).toBe(true)
  await page.getByTitle('退出全屏').first().click()
  await expect.poll(() => clsOf(wrap)).not.toContain('fullscreen')
  await expect(page.locator('body > .table-wrap')).toHaveCount(0)
})

// 进入全屏前会先把侧栏收起，这中间有一段"等动画跑完"的窗口。
// 窗口内切路由（组件销毁）时必须作废等待并还原侧栏，否则用户到新页面侧栏还停在收起态、再无人复原。
test('等待进入全屏时切路由，侧栏被还原且不会凭空进全屏', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 })
  await page.goto(`${BASE}/#/data-table`)
  const sidebar = page.locator('aside.sidebar')
  await expect(sidebar).toBeVisible()
  await expect.poll(() => sidebar.evaluate((n) => n.className)).not.toContain('collapsed')

  await page.getByTitle('全屏显示').first().click()
  await expect.poll(() => sidebar.evaluate((n) => n.className)).toContain('collapsed')
  await page.goto(`${BASE}/#/button`)
  // 等过原先的兜底上限，确认没有"迟到的进入全屏"和留在收起态的侧栏
  await page.waitForTimeout(2400)
  await expect.poll(() => sidebar.evaluate((n) => n.className)).not.toContain('collapsed')
  await expect(page.locator('body > .table-wrap')).toHaveCount(0)
})

// 全屏已进场（节点挂在 body 下）之后切路由：组件卸载，但 .table-wrap 是 root 的**子**节点，
// Vue 摘掉 root 时摘不到已被搬到 body 的它 → 整张表会以游离节点永久留在页面上，谁也拿不到引用。
// 这条是确定性的：先把"已进全屏"当同步前提等实，再切路由，不依赖 settle 与 goto 谁先到。
test('已进全屏时切路由，body 上不留游离表格', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 })
  await page.goto(`${BASE}/#/data-table`)
  await expect.poll(() => page.locator('.table-wrap').first().count()).toBe(1)

  await page.getByTitle('全屏显示').first().click()
  // 前提：节点确实被搬到了 body 下（没搬走的说法就是空转）
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('body > .table-wrap').length)).toBe(1)

  await page.goto(`${BASE}/#/button`)
  await expect(page.locator('body > .table-wrap')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('dt-fullscreen-active'))).toBe(false)
})

// 全屏框过去只在进入那一刻量一次，之后只跟 window resize。
// 而侧栏宽度变化改的是内容区尺寸、不触发 window resize → 框会一直停在旧边界。
// 不用折叠按钮来做这件事：全屏时点表格外部会直接退出全屏（既有设计），
// 那样量到的收窄是"回位"不是"跟随"。这里直接改侧栏宽度（等价于宿主自己动侧栏）。
test('全屏期间内容区变窄，全屏框跟着收窄并与内容区对齐', async ({ page }) => {
  await page.goto(`${BASE}/#/data-table`)
  const wrap = (await page.locator('.table-wrap').first().elementHandle())!
  await expect.poll(() => firstRowShown(wrap)).toBe(true)

  await page.getByTitle('全屏显示').first().click()
  await expect.poll(() => clsOf(wrap)).toContain('fullscreen')

  const boxW = () => wrap.evaluate((n) => Math.round(n.getBoundingClientRect().width))
  const contentW = () =>
    page.evaluate(() => Math.round(document.querySelector('.content-body')!.getBoundingClientRect().width))
  /**
   * 内容区的**最终**宽度：先等页面自己的动画（侧栏收起）跑完再量。
   * 拿半途量到的中间值去比进场偏差就是掷硬币 —— 这条断言在并行压帧时偶发红就是这么来的。
   */
  const settledContentW = () =>
    page.evaluate(async () => {
      const cb = document.querySelector('.content-body')!
      await Promise.race([
        Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))),
        new Promise((r) => setTimeout(r, 2000)), // 页面若有常驻动画也别把这条卡死
      ])
      return Math.round(cb.getBoundingClientRect().width)
    })
  const before = await boxW()
  expect(
    Math.abs(before - (await settledContentW())),
    '进场量到的框宽不等于侧栏收起后的最终宽度 → 等收尾没等够，框会在进场后再被挪一次',
  ).toBeLessThanOrEqual(1)

  await page.evaluate(() => {
    const s = document.querySelector('aside.sidebar') as HTMLElement
    s.style.transition = 'none'
    s.style.width = '360px'
  })
  // 三条都放宽到 15s：跟随是靠 rAF 合并触发的，全量并行（多浏览器抢帧）时默认 5s 会误判。
  // 单跑实测 3.2s 内完成，这里放的是并行余量，不是把断言放宽。
  // 前提先成立：内容区确实变窄了（否则后面的断言是空转）
  await expect.poll(() => contentW(), { timeout: 15_000 }).toBeLessThan(before - 100)
  // 再要求框跟上：先收窄，最后与内容区边界对齐
  await expect
    .poll(() => boxW(), { timeout: 15_000, message: '框没跟着内容区收窄 → 只在进场量过一次，正是本次修的行为' })
    .toBeLessThan(before - 100)
  await expect.poll(async () => Math.abs((await boxW()) - (await contentW())), { timeout: 15_000 }).toBeLessThanOrEqual(1)
})
