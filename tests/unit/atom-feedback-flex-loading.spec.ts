// @vitest-environment happy-dom
/**
 * 三个"0% 覆盖"的原子组件（第 119 轮）：`OfflineIndicator` / `Flex` / `Loading`。
 *
 * 为什么先补这三个：覆盖率报告里它们的语句覆盖是 **0%**，而它们都带"真实风险点"——
 *   · `OfflineIndicator` 是**全局横幅**（`z-index: var(--vcl-z-top)`、`role="alert"`）：断网提示看不见，
 *     用户就会以为"点了没反应"；它还依赖 `online`/`offline` 事件，**监听必须能卸干净**（否则组件重挂会泄漏）
 *   · `Flex` 是布局基建（`justify`/`align` 的映射写错，整页排版就错，且**错得很隐蔽**）
 *   · `Loading` 的 `fullscreen` 会在遮罩期间**锁 body 滚动**，且支持 Teleport 到 Shadow DOM 宿主 ——
 *     漏解锁会让页面"再也滚不动"
 *
 * 另有两条**跨组件一致性**断言（这类错项目里最难发现）：
 *   ① 尺寸一律走 `calc(Npx * var(--vcl-scale))`，只引真实令牌 —— 否则缩放开关对它不生效
 *   ② 三个组件的样式都只该用白名单内的令牌名（`tokens.css` 里真实存在的）
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import OfflineIndicator from '@/components/feedback/OfflineIndicator.vue'
import Loading from '@/components/feedback/Loading.vue'
import Flex from '@/components/layout/Flex.vue'

/** 统一的收尾：每个用例后清掉可能挂着的 body 锁与残留容器 */
afterEach(() => {
  document.body.innerHTML = ''
  document.body.removeAttribute('style')
})

// ════════════════════════════════════════════════════════════════════
// OfflineIndicator
// ════════════════════════════════════════════════════════════════════
describe('OfflineIndicator（断网横幅）', () => {
  it('初始不渲染任何东西（联网时不打扰用户）', () => {
    const w = mount(OfflineIndicator)
    expect(w.find('.offline-bar').exists()).toBe(false)
    w.unmount()
  })

  it('收到 offline 事件 → 出现 role="alert" 横幅；重新 online → 横幅消失', async () => {
    const w = mount(OfflineIndicator, { attachTo: document.body })

    window.dispatchEvent(new Event('offline'))
    await nextTick()
    const bar = document.querySelector('.offline-bar')
    expect(bar, '断网必须能被看见').toBeTruthy()
    expect(bar!.getAttribute('role'), 'role=alert 让读屏软件立刻播报').toBe('alert')
    expect(bar!.getAttribute('aria-live')).toBe('assertive')

    window.dispatchEvent(new Event('online'))
    await nextTick()
    expect(document.querySelector('.offline-bar'), '恢复联网要自动收起').toBeNull()
    w.unmount()
  })

  it('点关闭 → 横幅收起；但再断一次网会**重新出现**（关掉的不是"永久静音"）', async () => {
    const w = mount(OfflineIndicator, { attachTo: document.body })
    window.dispatchEvent(new Event('offline'))
    await nextTick()

    ;(document.querySelector('.offline-dismiss') as HTMLButtonElement).click()
    await nextTick()
    expect(document.querySelector('.offline-bar'), '用户可以临时关掉').toBeNull()

    // 关键：**不经过 online** 再断一次（网络抖动时常常只重复 offline）。
    // 负向对照发现：若这里先派发 online，`onOnline` 也会重置 dismissed，
    // 用例就分辨不出"onOffline 有没有重置"——探针因此没能把它打红。
    window.dispatchEvent(new Event('offline'))
    await nextTick()
    expect(document.querySelector('.offline-bar'), '再次断网必须重新提示（否则用户永远不知道）').toBeTruthy()
    w.unmount()
  })

  it('**卸载后不再响应事件**（监听器要卸干净，否则组件重挂会累积泄漏）', async () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const w = mount(OfflineIndicator)
    w.unmount()

    const removed = remove.mock.calls.map((c) => c[0])
    expect(removed, 'online/offline 两个监听都要卸').toEqual(expect.arrayContaining(['online', 'offline']))

    window.dispatchEvent(new Event('offline'))
    await nextTick()
    expect(document.querySelector('.offline-bar'), '已卸载的组件不该再渲染').toBeNull()
    remove.mockRestore()
  })

  it('文案走 i18n（不写死中文；缺键也不该渲染成 undefined）', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/feedback/OfflineIndicator.vue'), 'utf8')
    expect(src, '文案要用 t(...)').toMatch(/t\('offline\.disconnected'\)/)
    expect(src, '关闭按钮要有可读的 aria-label').toMatch(/:aria-label="t\('common\.close'\)"/)
  })
})

// ════════════════════════════════════════════════════════════════════
// Flex
// ════════════════════════════════════════════════════════════════════
describe('Flex（弹性布局容器）', () => {
  const styleOf = async (props: Record<string, unknown> = {}) => {
    const w = mount(Flex, { props, slots: { default: '<i>a</i>' }, attachTo: document.body })
    await nextTick()
    const el = w.find('.flex').element as HTMLElement
    const s = el.style
    w.unmount()
    return s
  }

  it('默认值：display flex / row / start / stretch / 撑满剩余空间（1）', async () => {
    const s = await styleOf()
    expect(s.display).toBe('flex')
    expect(s.flexDirection).toBe('row')
    expect(s.justifyContent).toBe('flex-start')
    expect(s.alignItems).toBe('stretch')
    // 浏览器会把简写 `flex: '1'` 归一化成 `1 1 0%`（grow/shrink/basis）—— 断言**语义**而不是字符串
    expect(s.flexGrow, '默认 flex:1（撑满剩余空间）').toBe('1')
    expect(s.flexShrink).toBe('1')
  })

  it('justify 六个值逐个映射到 CSS 关键字（映射表写错=整页排版错，且错得隐蔽）', async () => {
    const map = {
      start: 'flex-start',
      center: 'center',
      end: 'flex-end',
      between: 'space-between',
      around: 'space-around',
      evenly: 'space-evenly',
    } as const
    for (const [input, expected] of Object.entries(map)) {
      expect((await styleOf({ justify: input })).justifyContent, `justify=${input}`).toBe(expected)
    }
  })

  it('align 五个值逐个映射；wrap 与 gap 透传', async () => {
    const map = {
      start: 'flex-start',
      center: 'center',
      end: 'flex-end',
      stretch: 'stretch',
      baseline: 'baseline',
    } as const
    for (const [input, expected] of Object.entries(map)) {
      expect((await styleOf({ align: input })).alignItems, `align=${input}`).toBe(expected)
    }
    const s = await styleOf({ wrap: true, gap: '12px' })
    expect(s.flexWrap).toBe('wrap')
    expect(s.gap).toBe('12px')
  })

  it('Space 兼容：horizontal → row、vertical → column；inline → inline-flex', async () => {
    expect((await styleOf({ direction: 'horizontal' })).flexDirection).toBe('row')
    expect((await styleOf({ direction: 'vertical' })).flexDirection, 'vertical 是新名字，必须映射成 column').toBe(
      'column',
    )
    expect((await styleOf({ direction: 'column' })).flexDirection).toBe('column')
    expect((await styleOf({ inline: true })).display).toBe('inline-flex')
  })

  it('渲染出默认插槽内容（不是空壳容器）', () => {
    const w = mount(Flex, { slots: { default: '<span class="kid">x</span>' } })
    expect(w.find('.flex .kid').text()).toBe('x')
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
// Loading
// ════════════════════════════════════════════════════════════════════
describe('Loading（加载态）', () => {
  it('spinner 默认档：渲染 spinner-ring，带提示文字时不空着', () => {
    const w = mount(Loading, { props: { text: '加载中' } })
    expect(w.find('.spinner-ring').exists()).toBe(true)
    // 尺寸档挂在**外层容器**上（`.loading-spinner`），不是 ring 自己
    expect(w.find('.loading-spinner').classes()).toContain('spinner-md')
    expect(w.text()).toContain('加载中')
    w.unmount()
  })

  it('size 三档各自落到对应 class（尺寸比例是保护项，不允许悄悄漂）', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const w = mount(Loading, { props: { size } })
      expect(w.find('.loading-spinner').classes()).toContain(`spinner-${size}`)
      w.unmount()
    }
  })

  it('skeleton 变体：按 rows 渲染行数/比例；skeleton-text 与 skeleton-card 各自的容器', () => {
    // variant 缺省 → 走 else 分支的 `.skel-lines`（最后一行为 40%）
    const w = mount(Loading, { props: { variant: 'skeleton', rows: 4 } })
    const lines = w.findAll('.skel-line')
    expect(lines.length, 'rows=4 → 四行').toBe(4)
    expect((lines[0].element as HTMLElement).style.width).toBe('100%')
    expect((lines[3].element as HTMLElement).style.width, '最后一行短一点才像文字').toBe('40%')
    w.unmount()

    // skeleton-card → `.skel-card`，最后一行 60%
    const w2 = mount(Loading, { props: { variant: 'skeleton-card', rows: 3 } })
    expect(w2.find('.skel-card').exists()).toBe(true)
    const cardLines = w2.findAll('.skel-line')
    expect(cardLines.length).toBe(3)
    expect((cardLines[2].element as HTMLElement).style.width).toBe('60%')
    w2.unmount()

    // skeleton-text → 单块，width/height 透传
    const w3 = mount(Loading, { props: { variant: 'skeleton-text', width: '80%', height: '20px' } })
    const block = w3.find('.skel-text').element as HTMLElement
    expect(block.style.width).toBe('80%')
    expect(block.style.height).toBe('20px')
    w3.unmount()
  })

  it('fullscreen → Teleport 到 body 且 aria-busy；**卸载后 body 滚动必须解锁**', async () => {
    const w = mount(Loading, { props: { fullscreen: true }, attachTo: document.body })
    await nextTick()
    const overlay = document.querySelector('.loading-fullscreen')
    expect(overlay, '全屏遮罩要 teleport 到 body').toBeTruthy()
    expect(overlay!.getAttribute('aria-busy')).toBe('true')

    const lockedWhileLoading = document.body.style.overflow
    w.unmount()
    await nextTick()
    expect(document.body.style.overflow, '漏解锁会让页面再也滚不动').not.toBe(lockedWhileLoading)
  })

  it('overlay=false 时不加半透明遮罩 class（默认 true 才加）', async () => {
    const w = mount(Loading, { props: { fullscreen: true, overlay: false }, attachTo: document.body })
    await nextTick()
    const el = document.querySelector('.loading-fullscreen')!
    expect(el.className).not.toContain('--overlay')
    w.unmount()

    const w2 = mount(Loading, { props: { fullscreen: true }, attachTo: document.body })
    await nextTick()
    expect(document.querySelector('.loading-fullscreen')!.className).toContain('--overlay')
    w2.unmount()
  })

  it('非 fullscreen 时不产生全屏遮罩（避免误当层用）', () => {
    const w = mount(Loading)
    expect(w.find('.loading-fullscreen').exists()).toBe(false)
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
// 跨组件一致性：缩放令牌与真实令牌白名单
// ════════════════════════════════════════════════════════════════════
describe('三个组件的样式约定（跨文件一致性）', () => {
  const sources: Array<[string, string]> = [
    ['OfflineIndicator', 'src/components/feedback/OfflineIndicator.vue'],
    ['Flex', 'src/components/layout/Flex.vue'],
    ['Loading', 'src/components/feedback/loading-scoped.css'],
  ]

  it('尺寸一律走 calc(Npx * var(--vcl-scale))，否则全局缩放开关对它们不生效', () => {
    for (const [name, path] of sources) {
      const css = readFileSync(resolve(process.cwd(), path), 'utf8')
      // 找出"裸 px"，排除三类**故意不缩放**的：
      //   ① calc(... * var(--vcl-scale)) 内部   ② @supports 能力探测 / blur() 半径   ③ .sr-only 工具类
      //      （sr-only 的 1px / -1px 是规范写法，不是外观尺寸）
      const stripped = css
        .replace(/calc\([^)]*var\(--vcl-scale\)[^)]*\)/g, '')
        .replace(/@supports[^{]*\{/g, '')
        .replace(/:\s*blur\(\d+px\)/g, '')
        // .sr-only 整块剥掉（先剥注释，否则注释里的 `}` 会提前闭合匹配）
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\.sr-only\s*\{[^}]*\}/g, '')
      const bare = stripped.match(/:\s*[^;:{}]*\b\d+px\b/g) ?? []
      expect(bare, `${name} 里有未走缩放的 px：${bare.join(' / ')}`).toHaveLength(0)
    }
  })

  it('引用的每个 --vcl-* 令牌在 tokens.css 里真实存在（拼错的令牌会静默失效，颜色/间距凭空消失）', () => {
    const tokens = readFileSync(resolve(process.cwd(), 'src/components/tokens.css'), 'utf8')
    const declared = new Set(tokens.match(/--vcl-[a-z0-9-]+/g) ?? [])
    for (const [name, path] of sources) {
      const css = readFileSync(resolve(process.cwd(), path), 'utf8')
      const used = new Set(css.match(/--vcl-[a-z0-9-]+/g) ?? [])
      const missing = [...used].filter((t) => !declared.has(t))
      expect(missing, `${name} 用了不存在的令牌：${missing.join(', ')}`).toEqual([])
    }
  })

  it('断网横幅必须"看得见"：z-index 用最高层令牌 + 实心底色压白字', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/feedback/OfflineIndicator.vue'), 'utf8')
    expect(css, '全局横幅要压在所有弹层之上').toContain('--vcl-z-top')
    expect(css, '暗色下 warning 提亮后白字不可读 → 要用 solid 令牌').toMatch(/--vcl-color-warning-solid/)
  })
})