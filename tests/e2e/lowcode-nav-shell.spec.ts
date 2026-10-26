// 低代码导航外壳 · 宿主接入示例的端到端（2026-10-25）
//
// 锁的是「宿主只挂一个 <LowCodeNav> + 一个低代码入口，其余导航项由用户自建」这条产品形态里
// **只有真浏览器能证明**的部分：
//   · 后端下发的导航 JSON 走真实 HTTP（dev server 的 lowcodeDemoApiPlugin）→ 同源守卫放行 → 渲染
//   · 脏数据（javascript: 链接 / 未知 kind）在真 JSON 里被拒、且原因可见
//   · 注入宿主自己的 FormStore（内存实现、不碰 localStorage）→ formId 解析成真字段
//     —— 这一段在单测里是 happy-dom，"注入的 store 与解析器是否真的是同一条链"只有真跑才认
//   · **提交不发一条网络请求**（外壳只 emit；发给谁由宿主决定）—— 用请求计数证明，不靠读代码
//   · 无障碍：本页跑一遍 axe（WCAG 2.1 AA）
//
// 选择器约定：外壳给**页面区**元素也挂了 `data-key`（`section.lcn-page[data-key]`），
// 所以点导航必须用导航项自己的类名 `.lcn-demo-item`，否则 strict mode 会命中两个元素。
import { test, expect } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'

const PAGE = '/#/lowcode-nav'
const item = (key: string) => `.lcn-demo-item[data-key="${key}"]`

test.describe('低代码导航外壳 · 宿主接入示例', () => {
  test('后端下发的导航定义（真 HTTP）渲染成导航；脏数据不渲染，但问题可查', async ({ page }) => {
    const navHits: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/api/lowcode-demo/nav')) navHits.push(r.url())
    })

    await page.goto(PAGE)
    await expect(page.locator('h1')).toContainText('低代码导航外壳')

    const nav = page.locator('.lcn-demo-nav')
    await expect(nav.locator(item('form-customers')), '后端 JSON 里的表单页成为导航项').toBeVisible({
      timeout: 15_000,
    })
    await expect(nav.locator(item('link-doc'))).toBeVisible()
    expect(navHits.length, '真接口被请求过一次').toBeGreaterThan(0)

    // 负向：同一份真 JSON 里的脏数据必须**不出现**在导航里
    await expect(page.getByText('脏数据（会被拒）')).toHaveCount(0)
    await expect(page.getByText('未知类型（会被丢弃）')).toHaveCount(0)

    // 但它是"被拒"而不是"被静默吞掉"：勾上问题清单就能看到原因
    await page.getByLabel(/显示配置问题清单/).check()
    const issues = page.locator('.lcn-issues li[data-code]')
    await expect(issues).toHaveCount(2)
    await expect(issues.first()).toContainText('javascript')
  })

  test('点表单页 → 注入的宿主 store 取设计 → 真字段渲染 → 填值 → 提交（全程不发网络）', async ({ page }) => {
    const posts: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST') posts.push(`${r.method()} ${r.url()}`)
    })

    await page.goto(PAGE)
    await page.locator('.lcn-demo-nav ' + item('form-customers')).click()

    // 走的是注入 store 里的真设计（节点树 → toFormSchema → FormBuilder）
    await expect(page.getByRole('textbox', { name: '客户名称' }), '设计里的 text 字段渲染成输入框').toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('combobox', { name: '客户等级' }), 'select 字段的 label 也在').toBeVisible()

    // 填值：外壳把数据变化 emit 给宿主（事件日志看得见）
    await page.getByRole('textbox', { name: '客户名称' }).fill('张三')
    await expect(page.locator('[data-event="page-change"]').first()).toBeVisible({ timeout: 10_000 })

    // 提交：只 emit，不外发
    await page.getByRole('button', { name: '提交' }).click()
    const submitted = page.locator('[data-event="page-submit"]').first()
    await expect(submitted).toBeVisible({ timeout: 10_000 })
    await expect(submitted).toContainText('"name":"张三"')
    // 观察（如实记）：未选择的 select 也会以 null 进提交数据，键不缺席
    await expect(submitted).toContainText('"level":null')

    expect(posts, '外壳不替宿主外发：整个流程一条 POST 都没有').toEqual([])
  })

  test('必填没填 → 真校验挡住，不发 page-submit', async ({ page }) => {
    await page.goto(PAGE)
    await page.locator('.lcn-demo-nav ' + item('form-tickets')).click()
    await expect(page.getByRole('textbox', { name: '工单标题' })).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: '提交' }).click()
    await expect(page.locator('[data-event="page-submit"]')).toHaveCount(0)
  })

  test('三种导航来源可在同一外壳里切换；注入的 store 不碰本机存储', async ({ page }) => {
    await page.goto(PAGE)
    const nav = page.locator('.lcn-demo-nav')

    // forms：由用户自建表单派生（这里是宿主注入的内存 store）
    await page.getByRole('button', { name: /forms：用户自建表单/ }).click()
    await expect(nav.locator(item('demo-customers'))).toBeVisible({ timeout: 10_000 })
    await expect(nav.locator(item('demo-tickets'))).toBeVisible()
    await expect(page.locator('[data-test="store-stat"]'), '注入的 store 不写本机存储').toContainText(
      'localStorage 记录：0 条',
    )

    // static：配置内置
    await page.getByRole('button', { name: /static：配置内置/ }).click()
    await expect(nav.locator(item('s1'))).toBeVisible({ timeout: 10_000 })
    await expect(nav.locator(item('demo-customers'))).toHaveCount(0)

    // api：回到后端下发
    await page.getByRole('button', { name: /api：后端下发定义/ }).click()
    await expect(nav.locator(item('form-customers'))).toBeVisible({ timeout: 10_000 })
  })

  test('两个出口：自定义导航项渲染 + #page 插槽完全接管页面区', async ({ page }) => {
    await page.goto(PAGE)
    const nav = page.locator('.lcn-demo-nav')
    await expect(nav.locator(item('form-customers'))).toBeVisible({ timeout: 15_000 })

    // #nav-item 接管：切到自定义样式后带上标记
    await page.getByLabel(/自定义导航项样式/).check()
    await expect(nav.locator(item('form-customers'))).toContainText('★')

    // #page 接管：整块页面区交给宿主（并跳过表单页解析）
    await page.getByLabel(/用 #page 插槽自己渲染整块页面区/).check()
    await page.locator('.lcn-demo-nav ' + item('form-customers')).click()
    await expect(page.locator('.lcn-demo-page')).toContainText('宿主自渲染：客户台账', { timeout: 10_000 })
    await expect(page.getByRole('textbox', { name: '客户名称' }), '接管后不再走内置表单渲染').toHaveCount(0)
  })

  test('无障碍：本页 axe（WCAG 2.1 AA）零违规', async ({ page }) => {
    await page.goto(PAGE)
    await expect(page.locator('h1')).toContainText('低代码导航外壳')
    await page.locator('.lcn-demo-nav ' + item('form-customers')).click()
    await expect(page.getByRole('textbox', { name: '客户名称' })).toBeVisible({ timeout: 15_000 })

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(
      violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      '无障碍违规',
    ).toEqual([])
  })
  test('用户自建：在设计器里建表单 → 保存 → 它自己成为导航项（全程零网络）', async ({ page }) => {
    const posts: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST') posts.push(r.url())
    })

    await page.goto(PAGE)
    await page.getByRole('button', { name: /forms：用户自建表单/ }).click()
    const nav = page.locator('.lcn-demo-nav')
    await expect(nav.locator(item('demo-customers'))).toBeVisible({ timeout: 10_000 })
    const before = await nav.locator('.lcn-demo-item').count()

    // ② 设计器：点一下组件面板的字段项即加入画布
    const build = page.locator('.lcn-demo-build')
    await build.locator('.ldp-field-item').first().click()

    // 保存：工具栏「保存」→ 弹窗改名 → 确认
    await build.getByRole('button', { name: '保存' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('.ld-save-input').fill('巡检台账')
    await dialog.locator('.modal-footer').getByRole('button', { name: '保存' }).click()

    // 保存后：导航**自己**多出一项（宿主 store 收到设计 + navRef.refresh()），不用刷新页面
    const added = nav.locator('.lcn-demo-item').filter({ hasText: '巡检台账' })
    await expect(added, '保存后新表单成为导航项').toBeVisible({ timeout: 10_000 })
    expect(await nav.locator('.lcn-demo-item').count()).toBe(before + 1)
    await expect(page.locator('[data-event="designer-saved"]').first()).toContainText('巡检台账')
    await expect(page.locator('[data-test="store-stat"]'), '走宿主 store，不写本机存储').toContainText(
      'localStorage 记录：0 条'
    )

    // 点进去能渲染刚建的字段（设计 → store → 导航 → 页面这条链真的通）
    await added.click()
    await expect(page.locator('.lcn-page input').first(), '新建表单的字段渲染成输入框').toBeVisible({
      timeout: 10_000,
    })

    expect(posts, '用户自建全程没有一条网络请求（数据进的是宿主自己的 store）').toEqual([])
  })

  // ── ③ 自托管后端：官方 createRestFormStore + 真 HTTP ──
  // 单测里 createRestFormStore 用的是 stub fetch；「真 HTTP → 鉴权头 → 表单库/收集记录」这条链
  // 只有真跑才认。dev server 那份参考后端**故意要求 Authorization**（缺了 401），
  // 于是"宿主有没有把 headers 接对"是可观测的，而不是"看着能跑"。
  test('自托管后端：切到 REST 仓储 → 导航来自服务端（带令牌）→ 提交真落到服务端', async ({ page }) => {
    const storeCalls: { url: string; method: string; auth: string | undefined }[] = []
    page.on('request', (r) => {
      const u = r.url()
      if (u.includes('/api/lowcode-demo/store/')) {
        storeCalls.push({ url: u, method: r.method(), auth: r.headers()['authorization'] })
      }
    })

    await page.goto(PAGE)
    const nav = page.locator('.lcn-demo-nav')
    const serverStat = page.locator('[data-test="server-stat"]')

    // 内存仓储（默认）：导航是内存那两份，且一条后端请求都没有
    await page.getByRole('button', { name: /forms：用户自建表单/ }).click()
    await expect(nav.locator('.lcn-demo-item').filter({ hasText: '客户台账' }).first()).toBeVisible()
    expect(storeCalls, '内存实现不该碰后端').toEqual([])

    // 切到 REST 仓储：导航立刻变成"服务端才有的那一份"
    await page.getByRole('button', { name: /REST（真 HTTP）/ }).click()
    await expect(nav.locator('.lcn-demo-item').filter({ hasText: '服务端：客户台账' }).first()).toBeVisible({
      timeout: 10_000,
    })
    await expect(
      nav.locator('.lcn-demo-item').filter({ hasText: '工单' }),
      '换实现后旧 store 的导航项必须消失'
    ).toHaveCount(0)

    // 每个仓储请求都必须带令牌；表单份数由**服务端**报出来（不是前端自己数的）
    const listCalls = storeCalls.filter((c) => c.method === 'GET' && c.url.includes('/forms'))
    expect(listCalls.length, '导航必须来自服务端').toBeGreaterThan(0)
    expect(
      listCalls.every((c) => c.auth === 'Bearer demo-token-r105'),
      '宿主必须把令牌接上（缺它后端 401）'
    ).toBe(true)
    // 表单份数由**服务端**报出来（不是前端自己数的）。
    // 同样不断言绝对值：另一个 spec 文件也会往这个共享后端存表单（≥1 = 至少有那份 seed）
    await expect
      .poll(
        async () => Number(/(\d+)\s*份表单/.exec((await serverStat.textContent()) ?? '')?.[1] ?? -1),
        { timeout: 10_000 },
      )
      .toBeGreaterThanOrEqual(1)

    // 打开服务端表单：页面区渲染的是**服务端下发的字段**
    await nav.locator('.lcn-demo-item').filter({ hasText: '服务端：客户台账' }).first().click()
    const pageArea = page.locator('.lcn-page')
    await expect(pageArea.getByText('服务端字段·客户名称')).toBeVisible({ timeout: 10_000 })

    // 提交前的条数：断言**增量**而不是绝对值 ——
    // dev server 的参考后端在整轮 e2e 里是共享的（别的用例也会写记录），
    // 写死 "1 条" 会随用例执行顺序变红（第 115 轮加写入闭环用例时当场发生）
    const before = Number(/(\d+)\s*条收集记录/.exec((await serverStat.textContent()) ?? '')?.[1] ?? -1)
    expect(before, '状态行要能读出条数（读不出就是这条断言本身失效了）').toBeGreaterThanOrEqual(0)

    // 填一栏提交 → 记录真的 POST 到收集记录路由，服务端计数 +1（后端自己报的数）。
    // 用"至少 +1"而不是等值：另一个 spec 文件也在往**同一个** dev server 写记录，
    // 等值会随两文件交错执行变红；而"提交没落库"时它一次都不会增，判别力不减
    await pageArea.getByRole('textbox', { name: /服务端字段·客户名称/ }).fill('进来一条真数据')
    await pageArea.getByRole('button', { name: '提交' }).click()
    await expect
      .poll(
        async () =>
          Number(/(\d+)\s*条收集记录/.exec((await serverStat.textContent()) ?? '')?.[1] ?? -1),
        { timeout: 10_000 },
      )
      .toBeGreaterThanOrEqual(before + 1)
    const recordPosts = storeCalls.filter((c) => c.method === 'POST' && c.url.includes('/records/'))
    expect(recordPosts.length, '提交必须 POST 到收集记录路由（外壳不自动外发，是宿主发的）').toBeGreaterThan(0)
    expect(recordPosts[0].auth, '落库请求同样要带令牌').toBe('Bearer demo-token-r105')
    await expect(page.locator('[data-event="record-saved"]').first()).toBeVisible()
  })

})