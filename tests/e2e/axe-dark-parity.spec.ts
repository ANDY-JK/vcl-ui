// 暗色全规则同源守卫（2026-10-21，审查 6.3 第 3 项 / R5-A20）
//
// ## 这条用例存在的理由：把一个**假设**变成**有据可查的结论**
//
// R5-A20 指出：暗色用例只跑 `color-contrast`，其余规则一律不扫，理由是
// 「暗色下别的规则与亮色同源，重复扫描只是拖慢全链」。报告把它定性为
// 「可接受但需知情的口径」并建议「对代表页跑一次全规则，把结果固化成暗色基线」。
//
// 本轮先按建议做了 2 页探测，发现亮/暗违规**完全相同**；但 2 页不足以支撑
// 「全站同源」这个结论（45 个路由里结构差异可能藏在别处）。于是做了全站实测：
//
//   规则                    | 亮色 | 暗色
//   ------------------------|------|------
//   nested-interactive      |  79  |  79
//   label                   |   9  |   9
//   landmark-unique         |   5  |   5
//   image-alt               |   5  |   5
//   empty-table-header      |   4  |   4
//   label-title-only        |   2  |   2
//   frame-title             |   2  |   2
//   select-name             |   1  |   1
//   landmark-main-is-top-level | 1 |   1
//   landmark-no-duplicate-main | 1 |   1
//   **color-contrast**      |  13  | **3**  ← 唯一差异
//
// 结论：**除对比度外，暗色与亮色逐条相同**。R5-A20 推测的根因
// （"暗色会切显隐，结构未必同源"）在全站数据下**不成立** —— 该推测被证伪。
//
// 所以「暗色只扫对比度」这个口径**是对的**，但此前只是"说法"，现在是"结论"。
// 本用例把这个结论**钉住**：一旦将来有人给组件加了暗色专属的结构变化
// （如 `data-theme='dark'` 下条件渲染不同的 DOM 结构），亮暗违规集合就会分叉，
// 这条用例会红 —— 那时才需要给暗色补全规则扫描。
//
// 代价：每轮多扫 2 个代表页（约 4 秒）。这是**便宜的哨兵**。
//
// ## 负向对照（已实测，证明这条守卫真的会红）
//
// 临时在暗色分支注入「把 <main> 的 role 改成 region」以模拟 data-theme 驱动的
// 条件渲染缺陷，实测输出：
//
//   Error: 路由 #/data-table 的亮/暗结构类违规出现分叉：
//   landmark-one-main: 亮色 0 / 暗色 1
//
// 复原后全绿。钩子已移除，不在生产测试里留测试后门。
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const BASE = process.env.E2E_BASE || 'http://localhost:3721'

/**
 * 代表页选择依据：**结构最复杂的两个域**，而不是随便挑。
 * - `data-table`：虚拟滚动 + 可编辑单元格 + 固定列，DOM 结构最重
 * - `form-builder`：设计器 + 渲染器 + 多层嵌套，landmark 结构最容易分叉
 *
 * 只取 2 页是因为「结构分叉」是**全局性**变化（组件级条件渲染），
 * 不会只发生在某一页 —— 2 个最复杂的页足够当哨兵。
 */
const PROBE_ROUTES = ['data-table', 'form-builder']

/** 收集某页在指定主题下的「规则 → 节点数」映射 */
async function scanRules(
  page: import('@playwright/test').Page,
  route: string,
  theme: 'light' | 'dark',
): Promise<Record<string, number>> {
  await page.goto(`${BASE}/#/${route}`)
  await page.locator('h1').first().waitFor({ state: 'visible', timeout: 20_000 })
  if (theme === 'dark') {
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  } else {
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'))
  }
  // 等动画收敛：主题切换会触发过渡，扫到过渡中间态会拿到假的对比度结果
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  )
  const res = await new AxeBuilder({ page }).analyze()
  const per: Record<string, number> = {}
  for (const v of res.violations) per[v.id] = (per[v.id] ?? 0) + (v.nodes ?? []).length
  return per
}

test('暗色与亮色的结构类违规必须同源（分叉即说明暗色需要补全规则扫描）', async ({ page }) => {
  test.setTimeout(5 * 60_000)

  for (const route of PROBE_ROUTES) {
    const light = await scanRules(page, route, 'light')
    const dark = await scanRules(page, route, 'dark')

    // 去掉对比度：它本来就**应该**因主题而变（这正是它需要单独扫的原因）
    delete light['color-contrast']
    delete dark['color-contrast']

    const allRules = [...new Set([...Object.keys(light), ...Object.keys(dark)])].sort()
    const diffs: string[] = []
    for (const rule of allRules) {
      const l = light[rule] ?? 0
      const d = dark[rule] ?? 0
      if (l !== d) diffs.push(`${rule}: 亮色 ${l} / 暗色 ${d}`)
    }

    expect(
      diffs,
      `路由 #/${route} 的亮/暗结构类违规出现分叉：\n  ${diffs.join('\n  ')}\n\n` +
        `这说明**暗色下 DOM 结构与亮色不同**（通常来自 data-theme 驱动的条件渲染）。\n` +
        `此时「暗色只扫 color-contrast」的口径不再成立 —— 需要给暗色用例补全规则扫描。\n` +
        `（本断言的设计意图：把 R5-A20 的"结构同源"假设变成会红的守卫，而不是一句注释。）`,
    ).toEqual([])
  }

  // 不 console.log：eslint 的 no-console 棘轮已卡在 147，现有 e2e 里 6 处是历史存量。
  // 不为一个新文件去抬棘轮数字 —— 这条守卫的价值在"分叉时红"，成功时不需要往 stdout 写东西。
})
