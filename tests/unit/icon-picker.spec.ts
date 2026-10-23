/**
 * IconPicker.vue — 图标选择器的选择 / 确认 / 搜索 / 分页（2026-10-22）
 *
 * ## 为什么测它
 *
 * 429 行，未覆盖 97 条（44.3%）。已有 `icon-color-picker.spec.ts`（50 行）只测了
 * 颜色设置，**核心的「选图标 → 确认」主流程完全没测**。
 *
 * ## 最该锁住的五条契约
 *
 *   ① **确认前是「草稿」**：选图标只改 `localIcon`，不 emit —— 用户点开面板乱翻
 *      再关掉，不能把没确认的选择写回去
 *   ② **确认时才 emit 四个 update + change** —— 漏一个，下游拿到的就是旧值
 *   ③ **再次打开面板要重置为 props 的值** —— 上次没确认的草稿不能残留
 *   ④ **搜索按小写包含匹配** —— 大小写不敏感
 *   ⑤ **切换 provider 要清空搜索词** —— 否则切过去看到空列表以为坏了
 *
 * ## 测试构造的三个坑（都踩过）
 *
 *   ① 面板用 `<Teleport to="body">` —— `wrapper.find()` **找不到**里面的元素，
 *      必须在 `document.body` 上查。所以每次 mount 都要 `attachTo: document.body`，
 *      并在 afterEach 清理 DOM，否则上一个用例的残留会污染下一个。
 *   ② 面板是 `v-show="open"` 而非 `v-if` —— 元素**始终在 DOM 里**，
 *      判断「是否打开」不能看 `exists()`，要看 `display` 或 `.icon-item` 数量。
 *   ③ 最初 mock 了图标库，但下游组件（IconSvg 等）也从这些模块取别的导出，
 *      补一个冒一个（`lucideSubset` → `isSolarReady` → …）。
 *      图标库是纯本地数据、无副作用，**让它们真跑**即可，只 mock 有浏览器 API 依赖的模块。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, shallowRef } from 'vue'

// useFloating：happy-dom 无布局，定位无意义；只保留接口形状。
//
// ⚠️ **必须返回真正的 Vue ref**，不能用 `{ value: null }` 这种普通对象 ——
// 模板里写的是 `ref="triggerRef"` / `ref="floatingRef"`，
// Vue 在挂载时要把元素**写进**这两个 ref；给普通对象它会告警：
//   [Vue warn]: Template ref "triggerRef" used on a non-ref value.
//   It will not work in the production build.      ← 新增 console 噪音类别
// 这条告警会被 check:console-noise 的棘轮拦住（且它本身是真问题：
// 生产构建下模板 ref 就失效了）。用 shallowRef 是因为元素本身不需要深响应。
vi.mock('@/components/_internal/useFloating', () => ({
  useFloating: () => ({
    triggerRef: shallowRef(null),
    floatingRef: shallowRef(null),
    direction: ref<'up' | 'down'>('down'),
    floatingStyle: ref<Record<string, string>>({}),
    updatePosition: vi.fn(),
    prepareOpen: vi.fn(),
  }),
}))

// useClickOutside：需要暴露「点外面」的回调供测试触发
let outsideHandler: (() => void) | null = null
vi.mock('@/components/_internal/useClickOutside', () => ({
  useClickOutside: (_refs: unknown, cb: () => void) => {
    outsideHandler = cb
  },
}))

import IconPicker from '@/components/form/IconPicker.vue'

/** 面板在 Teleport 到 body 的容器里 */
function panel(): HTMLElement | null {
  return document.body.querySelector('.picker-panel')
}

/** 面板是否真的可见（v-show 看 display） */
function panelVisible(): boolean {
  const p = panel()
  if (!p) return false
  return (p as HTMLElement).style.display !== 'none'
}

function iconItems(): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll('.icon-item')) as HTMLButtonElement[]
}

/** 点第 n 个图标项 */
async function clickIcon(n: number) {
  const items = iconItems()
  items[n]?.click()
  await flushPromises()
}

/** 点确认按钮 */
async function clickConfirm() {
  const btn = document.body.querySelector('.confirm-btn') as HTMLButtonElement | null
  btn?.click()
  await flushPromises()
}

/** 搜索框（在面板里） */
function searchInput(): HTMLInputElement | null {
  const p = panel()
  if (!p) return null
  return p.querySelector('input[type="text"], input:not([type])') as HTMLInputElement | null
}

async function setSearch(v: string) {
  const input = searchInput()
  if (!input) return
  input.value = v
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

/** 打开面板 */
async function openPanel(w: ReturnType<typeof mount>) {
  await w.find('.picker-trigger').trigger('click')
  await flushPromises()
  // toggle 里有 rAF 兜底（RAF_FALLBACK_MS），等它走完
  await new Promise((r) => setTimeout(r, 80))
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  outsideHandler = null
  document.body.innerHTML = ''
  // happy-dom 没有 IntersectionObserver —— 组件会降级为「一次性全量渲染」，
  // 这正是我们要的分页行为，不要补桩（补了反而测不到降级分支）
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('初始渲染', () => {
  it('渲染触发器按钮，显示当前图标名', () => {
    const w = mount(IconPicker, { props: { modelValue: 'heart' }, attachTo: document.body })
    expect(w.find('.picker-trigger').exists()).toBe(true)
    expect(w.html()).toContain('heart')
    w.unmount()
  })

  it('未传 modelValue → 用默认 star', () => {
    const w = mount(IconPicker, {}, )
    expect(w.html()).toContain('star')
    w.unmount()
  })

  it('placeholder 渲染在触发器上', () => {
    const w = mount(IconPicker, { props: { placeholder: '选个图标' } })
    expect(w.html()).toContain('选个图标')
    w.unmount()
  })

  it('**面板默认不可见**（v-show，元素在但 display:none）', () => {
    const w = mount(IconPicker, { props: { modelValue: 'star' }, attachTo: document.body })
    expect(panelVisible(), '未打开时面板应不可见').toBe(false)
    w.unmount()
  })
})

describe('打开 / 关闭面板', () => {
  it('点触发器 → 面板可见，渲染图标列表', async () => {
    const w = mount(IconPicker, { props: { modelValue: 'star' }, attachTo: document.body })
    await openPanel(w)
    expect(panelVisible(), '面板应可见').toBe(true)
    expect(iconItems().length, '应渲染图标项').toBeGreaterThan(0)
    w.unmount()
  })

  it('再点触发器 → 面板关闭', async () => {
    const w = mount(IconPicker, { props: { modelValue: 'star' }, attachTo: document.body })
    await openPanel(w)
    expect(panelVisible()).toBe(true)

    await w.find('.picker-trigger').trigger('click')
    await flushPromises()
    expect(panelVisible(), '再点应关闭').toBe(false)
    w.unmount()
  })

  it('**打开时重置为 props 的值**（上次未确认的草稿不能残留）', async () => {
    const w = mount(IconPicker, { props: { modelValue: 'star' }, attachTo: document.body })
    await openPanel(w)

    // 选一个不同的图标（未确认）
    await clickIcon(3)
    // 关闭（不确认）
    await w.find('.picker-trigger').trigger('click')
    await flushPromises()

    // 再次打开 —— 应回到 props 的 star
    await openPanel(w)
    const selected = document.body.querySelectorAll('.icon-item.selected')
    expect(selected.length, '应有一个 selected 项').toBeGreaterThan(0)
    expect(selected[0].textContent, '应重置为 props 的 star').toContain('star')
    w.unmount()
  })
})

describe('选择图标（草稿语义）', () => {
  it('**点图标不 emit**（只是草稿，确认才生效）', async () => {
    const w = mount(IconPicker, { props: { modelValue: 'star' }, attachTo: document.body })
    await openPanel(w)
    await clickIcon(2)
    expect(w.emitted('update:modelValue'), '未确认前不该 emit').toBeFalsy()
    w.unmount()
  })

  it('点图标后 selected 类切换', async () => {
    const w = mount(IconPicker, { props: { modelValue: 'star' }, attachTo: document.body })
    await openPanel(w)
    await clickIcon(2)
    const selected = document.body.querySelectorAll('.icon-item.selected')
    expect(selected.length, '应有一个 selected 项').toBe(1)
    expect(selected[0].getAttribute('aria-pressed'), 'aria-pressed 应同步').toBe('true')
    w.unmount()
  })
})

describe('确认（emit 四个 update + change）', () => {
  it('点确认 → emit update:modelValue 为所选图标', async () => {
    const w = mount(IconPicker, { props: { modelValue: 'star' }, attachTo: document.body })
    await openPanel(w)
    const before = iconItems()[2].textContent?.trim()
    await clickIcon(2)
    await clickConfirm()

    const emitted = w.emitted('update:modelValue')
    expect(emitted, '应 emit update:modelValue').toBeTruthy()
    expect(emitted!.at(-1)![0], '应是所选图标').toBe(before)
    w.unmount()
  })

  it('**确认时同时 emit color / bgColor / provider / change**（漏一个下游就拿旧值）', async () => {
    const w = mount(IconPicker, {
      props: { modelValue: 'star', color: '#f00', bgColor: '#eee', provider: 'lucide' },
      attachTo: document.body,
    })
    await openPanel(w)
    await clickConfirm()

    expect(w.emitted('update:color'), '应 emit color').toBeTruthy()
    expect(w.emitted('update:bgColor'), '应 emit bgColor').toBeTruthy()
    expect(w.emitted('update:provider'), '应 emit provider').toBeTruthy()
    expect(w.emitted('change'), '应 emit change').toBeTruthy()

    const change = w.emitted('change')!.at(-1)![0] as Record<string, unknown>
    expect(change, 'change 应含 icon/color/bgColor').toHaveProperty('icon')
    expect(change).toHaveProperty('color')
    expect(change).toHaveProperty('bgColor')
    w.unmount()
  })

  it('确认后关闭面板', async () => {
    const w = mount(IconPicker, { props: { modelValue: 'star' }, attachTo: document.body })
    await openPanel(w)
    await clickConfirm()
    expect(panelVisible(), '确认后应关闭').toBe(false)
    w.unmount()
  })

  it('**点面板外面 → 自动确认**（useClickOutside 绑的是 confirm）', async () => {
    const w = mount(IconPicker, { props: { modelValue: 'star' }, attachTo: document.body })
    await openPanel(w)
    await clickIcon(2)

    expect(outsideHandler, 'useClickOutside 应已注册').toBeTruthy()
    outsideHandler!()
    await flushPromises()

    expect(w.emitted('update:modelValue'), '点外面应确认并 emit').toBeTruthy()
    w.unmount()
  })
})

describe('搜索过滤', () => {
  it('输入搜索词 → 只显示匹配项', async () => {
    const w = mount(IconPicker, { props: { modelValue: 'star' }, attachTo: document.body })
    await openPanel(w)
    const before = iconItems().length
    expect(before, '打开后应有图标').toBeGreaterThan(10)

    await setSearch('home')
    const after = iconItems().length
    expect(after, '搜索后应减少').toBeLessThan(before)
    expect(after, '至少匹配到一个').toBeGreaterThan(0)
    w.unmount()
  })

  it('**大小写不敏感**', async () => {
    const w = mount(IconPicker, { props: { modelValue: 'star' }, attachTo: document.body })
    await openPanel(w)
    await setSearch('HOME')
    const upper = iconItems().length
    await setSearch('home')
    const lower = iconItems().length
    expect(upper, '大小写结果应一致').toBe(lower)
    expect(upper).toBeGreaterThan(0)
    w.unmount()
  })

  it('无匹配 → 图标项为 0，且显示空态提示', async () => {
    const w = mount(IconPicker, { props: { modelValue: 'star' }, attachTo: document.body })
    await openPanel(w)
    await setSearch('zzz-绝对不存在-9f3a')
    expect(iconItems().length, '不该有图标项').toBe(0)
    const emptyTip = document.body.querySelector('.empty-tip')
    expect(emptyTip, '应显示空态提示').toBeTruthy()
    w.unmount()
  })
})

describe('provider 切换', () => {
  it('切到 solar → 图标源变成 solar 列表', async () => {
    const w = mount(IconPicker, { props: { modelValue: 'star' }, attachTo: document.body })
    await openPanel(w)
    const lucideNames = iconItems().map((i) => i.textContent?.trim())
    expect(lucideNames, 'Lucide 图标名不带 -linear 后缀').not.toContain('add-circle-linear')

    const tabs = Array.from(document.body.querySelectorAll('.provider-tab')) as HTMLButtonElement[]
    const solarTab = tabs.find((b) => /solar/i.test(b.textContent || ''))
    expect(solarTab, '应有 Solar tab').toBeTruthy()
    solarTab!.click()
    await flushPromises()

    // ⚠️ SOLAR_ICONS 的名字**不带 `solar:` 前缀**，是 `add-circle-linear` 这种形态
    // （见 _internal/solar-icons.ts）。最初断言 startsWith('solar') 会失败。
    const solarNames = iconItems().map((i) => i.textContent?.trim())
    expect(solarNames.length, 'solar 列表应有图标').toBeGreaterThan(0)
    expect(
      solarNames.some((n) => n?.endsWith('-linear') || n?.endsWith('-bold')),
      '切换后应是 solar 命名风格（*-linear / *-bold）',
    ).toBe(true)
    expect(solarNames, '不该再是 lucide 的名字').not.toEqual(lucideNames)
    w.unmount()
  })

  it('**切换 provider 时清空搜索词**（否则切过去看到空列表以为坏了）', async () => {
    const w = mount(IconPicker, { props: { modelValue: 'star' }, attachTo: document.body })
    await openPanel(w)
    await setSearch('star')
    expect(searchInput()?.value).toBe('star')

    const tabs = Array.from(document.body.querySelectorAll('.provider-tab')) as HTMLButtonElement[]
    const solarTab = tabs.find((b) => /solar/i.test(b.textContent || ''))
    solarTab!.click()
    await flushPromises()

    expect(searchInput()?.value, '搜索词应被清空').toBe('')
    w.unmount()
  })

  it('切 provider 后分页重置（回到第一页）', async () => {
    const w = mount(IconPicker, { props: { modelValue: 'star' }, attachTo: document.body })
    await openPanel(w)
    const tabs = Array.from(document.body.querySelectorAll('.provider-tab')) as HTMLButtonElement[]
    const lucideTab = tabs.find((b) => /lucide/i.test(b.textContent || ''))
    lucideTab!.click()
    await flushPromises()
    expect(iconItems().length, '应回到第一页的图标数').toBeGreaterThan(0)
    w.unmount()
  })
})

describe('颜色设置', () => {
  it('**透明背景按钮** → bgColor 变 transparent', async () => {
    const w = mount(IconPicker, { props: { modelValue: 'star' }, attachTo: document.body })
    await openPanel(w)

    // ⚠️ 第一版用「按文本找按钮 + if (found) 才断言」的写法，
    // 找不到时静默跳过 → 负向对照（把 transparent 改成 #ffffff）抓不到。
    // 这是典型假绿形态，改为用真实类名 + 强制断言。
    const btn = document.body.querySelector('.transparent-btn') as HTMLButtonElement | null
    expect(btn, '应有透明背景按钮（.transparent-btn）').toBeTruthy()
    btn!.click()
    await flushPromises()
    await clickConfirm()

    expect(w.emitted('update:bgColor')!.at(-1)![0], '应是 transparent').toBe('transparent')
    w.unmount()
  })

  it('透明按钮在 bgColor=transparent 时高亮（active）', async () => {
    const w = mount(IconPicker, {
      props: { modelValue: 'star', bgColor: 'transparent' },
      attachTo: document.body,
    })
    await openPanel(w)
    const btn = document.body.querySelector('.transparent-btn')
    expect(btn, '应有透明背景按钮').toBeTruthy()
    expect(btn!.classList.contains('active'), '应为 active').toBe(true)
    w.unmount()
  })
})
