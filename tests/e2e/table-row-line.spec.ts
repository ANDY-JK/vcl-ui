// DataTable 行级左边线取证 —— 有线行伪元素贴行左缘着色、无线行不渲染、固定列 sticky 不被行线破坏
// 背景：线画在每行最左 td 的伪元素上（tr 的 inset box-shadow 会被 sticky 不透明底固定列盖住）。
// 非 sticky 首单元格补 position:relative 提供定位上下文，选择器用 :not(.col-fixed-left) 排除
// 固定列——sticky 是定位上下文，若被 relative 顶掉会退化为静态定位（列不再吸附）。
// scoped CSS 单测加载不到，只有真实浏览器量几何才守得住。
import { test, expect } from '@playwright/test'

const BASE = process.env.E2E_BASE || 'http://localhost:3721'
const W = 1440
const H = 900

const SCOPE = '.row-line-demo'
const firstTd = (trClasses: string) =>
  `${SCOPE} tbody tr.${trClasses.split(' ').join('.')} td:first-child`

/** 页面 --vcl-scale 当前值（宽度做了 calc(Npx*scale)，断言须跟着 scale 走） */
async function readScale(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--vcl-scale').trim()
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) throw new Error(`--vcl-scale 解析失败: ${v}`)
    return n
  })
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: W, height: H })
  await page.goto(`${BASE}/#/data-table`)
  await page.locator(SCOPE).scrollIntoViewIfNeeded()
})

test('回调模式：危险行伪元素着 danger 语义色、贴行左缘、宽度随 --vcl-scale', async ({ page }) => {
  const scale = await readScale(page)

  const td = page.locator(firstTd('row-line row-line-danger'))
  await expect(td).toHaveCount(1)
  const pseudo = await td.evaluate((el) => {
    const s = getComputedStyle(el, '::before')
    return {
      content: s.content,
      background: s.backgroundColor,
      width: parseFloat(s.width),
      tdX: el.getBoundingClientRect().x,
    }
  })
  // 表格外框左缘：行线的 left:0 必须钉在首单元格左缘（td 定位上下文的起点）
  const tableX = await page.evaluate((sel) => {
    const t = document.querySelector(`${sel} .data-table`) as HTMLElement
    return t.getBoundingClientRect().x
  }, SCOPE)

  expect(pseudo.content, '伪元素已渲染').toBe('""')
  expect(pseudo.background, 'danger 语义色 #e54545').toBe('rgb(229, 69, 69)')
  expect(Math.abs(pseudo.width - 3 * scale), `线宽=3px*scale(${(3 * scale).toFixed(2)})`).toBeLessThan(0.3)
  expect(Math.abs(pseudo.tdX - tableX), '有线行首格贴表格左缘').toBeLessThanOrEqual(1)
})

test('未标注行无伪元素（没设置不显示，回到现状）', async ({ page }) => {
  const rows = page.locator(`${SCOPE} tbody tr`)
  const total = await rows.count()
  const withLine = await page.locator(`${SCOPE} tbody tr.row-line`).count()
  expect(withLine, '演示数据里 6 行有 4 行带线、2 行未标注').toBe(total - 2)

  const plain = page.locator(`${SCOPE} tbody tr:not(.row-line) td:first-child`).first()
  const pseudo = await plain.evaluate((el) => {
    const s = getComputedStyle(el, '::before')
    return { content: s.content, background: s.backgroundColor }
  })
  expect(pseudo.content, '无 row-line 类 → 伪元素不渲染').toBe('none')
})

test('固定列不被行线破坏：勾选列仍 sticky，线画在其左缘伪元素上', async ({ page }) => {
  // 演示表带 fixed:left 列 + selectable → 首格是 col-fixed-left 勾选列
  const td = page.locator(firstTd('row-line row-line-primary'))
  await expect(td).toHaveCount(1)
  const info = await td.evaluate((el) => {
    const s = getComputedStyle(el, '::before')
    return {
      tdPosition: getComputedStyle(el).position,
      isStickyLeft: (el as HTMLElement).classList.contains('col-fixed-left'),
      lineColor: s.backgroundColor,
      lineLeft: parseFloat(s.left),
    }
  })
  expect(info.isStickyLeft, '勾选列挂 col-fixed-left').toBe(true)
  expect(info.tdPosition, '回归点：行线不得把 sticky 顶成 relative/static').toBe('sticky')
  // 行线色 = primary 令牌的实测渲染色（2026-10-12 主色换 #0052ff，硬编码旧 hex 会被换肤打回；
  // 探针 span 引令牌求值，换主色后本断言自动跟随）
  const expectRgb = await td.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--vcl-color-primary)'
    document.body.appendChild(probe)
    const v = getComputedStyle(probe).color
    probe.remove()
    return v
  })
  expect(info.lineColor, `行线 = primary 语义色（令牌实测 ${expectRgb}）`).toBe(expectRgb)
  expect(info.lineLeft, '线钉在固定列左缘').toBe(0)
})
