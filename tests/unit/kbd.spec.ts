/**
 * Kbd · 契约
 *
 * 这个组件看着简单，真正会出错的只有三件事：
 *   1. `Mod` 的平台展开（写死 Ctrl 在 mac 上就是错的）
 *   2. 分隔符的取舍（列表里 `Ctrl + K` 比 `CtrlK` 好读，密集场景又要能关掉）
 *   3. 键帽不能被长键名撑破（`Backspace` 这种比 `⌘` 宽一倍）
 */
import { describe, expect, it, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Kbd from '@/components/basic/Kbd.vue'

const realPlatform = navigator.platform
const realUA = navigator.userAgent

function mockPlatform(platform: string, ua = '') {
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true })
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
}

afterEach(() => {
  Object.defineProperty(navigator, 'platform', { value: realPlatform, configurable: true })
  Object.defineProperty(navigator, 'userAgent', { value: realUA, configurable: true })
})

const keys = (w: ReturnType<typeof mount>) => Array.from(w.element.querySelectorAll('.kbd-key')).map((k) => k.textContent)

describe('Kbd · 键名与平台展开', () => {
  it('字符串按键按 + 拆开，逐键一个键帽', () => {
    const w = mount(Kbd, { props: { keys: 'Ctrl+K' } })
    expect(keys(w)).toEqual(['Ctrl', 'K'])
    w.unmount()
  })

  it('数组按键等价于字符串', () => {
    const w = mount(Kbd, { props: { keys: ['Ctrl', 'K'] } })
    expect(keys(w)).toEqual(['Ctrl', 'K'])
    w.unmount()
  })

  it('**Mod 在非 mac 上展开成 Ctrl**', () => {
    mockPlatform('Win32', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    const w = mount(Kbd, { props: { keys: 'Mod+S' } })
    expect(keys(w)).toEqual(['Ctrl', 'S'])
    w.unmount()
  })

  it('**Mod 在 mac 上展开成 ⌘**（写死 Ctrl 在 mac 上就是错的）', () => {
    mockPlatform('MacIntel', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    const w = mount(Kbd, { props: { keys: 'Mod+S' } })
    expect(keys(w)).toEqual(['⌘', 'S'])
    w.unmount()
  })

  it('常见键转字形：Enter/Esc/方向键', () => {
    const w = mount(Kbd, { props: { keys: 'Enter' } })
    expect(keys(w)).toEqual(['↵'])
    w.unmount()
  })

  it('未知键原样显示（不猜、不臆造字形）', () => {
    const w = mount(Kbd, { props: { keys: 'F13' } })
    expect(keys(w)).toEqual(['F13'])
    w.unmount()
  })

  it('空串与多余空白被忽略，不产空键帽', () => {
    const w = mount(Kbd, { props: { keys: ' Ctrl +  + K ' } })
    expect(keys(w)).toEqual(['Ctrl', 'K'])
    w.unmount()
  })
})

describe('Kbd · 分隔符', () => {
  it('默认用 + 分隔，且分隔符数 = 键数 - 1（结尾不多一个）', () => {
    const w = mount(Kbd, { props: { keys: 'Mod+Shift+P' } })
    expect(w.element.querySelectorAll('.kbd-sep').length).toBe(2)
    w.unmount()
  })

  it('sep="" 时不渲染分隔符（密集列表用）', () => {
    const w = mount(Kbd, { props: { keys: 'Ctrl+K', sep: '' } })
    expect(w.element.querySelectorAll('.kbd-sep').length).toBe(0)
    w.unmount()
  })

  it('单键不渲染分隔符', () => {
    const w = mount(Kbd, { props: { keys: 'Esc' } })
    expect(w.element.querySelectorAll('.kbd-sep').length).toBe(0)
    w.unmount()
  })
})

describe('Kbd · 尺寸与语义', () => {
  it('size 只改排版类，不改语义（仍是 kbd 元素）', () => {
    const w = mount(Kbd, { props: { keys: 'Mod+K', size: 'sm' } })
    expect(w.element.classList.contains('kbd-sm')).toBe(true)
    expect(w.element.querySelector('kbd')?.tagName).toBe('KBD')
    w.unmount()
  })
})

/**
 * 字形表：两个平台各跑一遍。
 * 为什么值得逐条钉：这些字形是**平台的用户预期**（mac 用户找 ⌥/⇧，Windows 用户找 Alt/Shift），
 * 一旦有人"统一成一套字形"就会静默变成错的提示 —— 不报错、不红，用户照着按发现不灵。
 */
describe('Kbd · 平台字形表', () => {
  const MAC = ['Meta+Shift+Alt+Ctrl', ['⌘', '⇧', '⌥', '⌃']] as const
  const WIN = ['Meta+Shift+Alt+Ctrl', ['Win', 'Shift', 'Alt', 'Ctrl']] as const

  it('mac：修饰键用符号字形', () => {
    mockPlatform('MacIntel', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    const w = mount(Kbd, { props: { keys: MAC[0] } })
    expect(keys(w)).toEqual(MAC[1])
    w.unmount()
  })

  it('Windows：修饰键用文字字形', () => {
    mockPlatform('Win32', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    const w = mount(Kbd, { props: { keys: WIN[0] } })
    expect(keys(w)).toEqual(WIN[1])
    w.unmount()
  })

  it('别名归一到同一字形（Cmd/Option/Control/Escape）', () => {
    mockPlatform('MacIntel', 'Mozilla/5.0 (Macintosh)')
    const w = mount(Kbd, { props: { keys: ['Cmd', 'Option', 'Control', 'Escape'] } })
    expect(keys(w)).toEqual(['⌘', '⌥', '⌃', 'Esc'])
    w.unmount()
  })

  it('非 mac 上 Backspace 用文字（⌫ 只有 mac 认）', () => {
    mockPlatform('Win32', 'Mozilla/5.0 (Windows NT 10.0)')
    expect(keys(mount(Kbd, { props: { keys: 'Backspace' } }))).toEqual(['Backspace'])
    mockPlatform('MacIntel', 'Mozilla/5.0 (Macintosh)')
    expect(keys(mount(Kbd, { props: { keys: 'Backspace' } }))).toEqual(['⌫'])
  })

  it('方向键与 Tab 用箭头字形（两平台一致）', () => {
    const w = mount(Kbd, { props: { keys: ['Up', 'Down', 'Left', 'Right', 'Tab'] } })
    expect(keys(w)).toEqual(['↑', '↓', '←', '→', '⇥'])
    w.unmount()
  })

  it('iPhone/iPad 也按 mac 处理（触屏设备同样没有 Win/Ctrl 键）', () => {
    mockPlatform('iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    expect(keys(mount(Kbd, { props: { keys: 'Mod+K' } }))).toEqual(['⌘', 'K'])
  })

  it('userAgentData.platform 优先参与判定（UA 里没有 mac 字样时也认得出）', () => {
    // 现代 Chromium 会逐步收紧 UA 字符串，platform 才是可靠来源
    Object.defineProperty(navigator, 'userAgentData', { value: { platform: 'macOS' }, configurable: true })
    mockPlatform('', '')
    expect(keys(mount(Kbd, { props: { keys: 'Mod+K' } }))).toEqual(['⌘', 'K'])
    Object.defineProperty(window.navigator, 'userAgentData', { get: undefined, configurable: true })
    delete (navigator as unknown as { userAgentData?: unknown }).userAgentData
  })

  it('没有 navigator（SSR/非浏览器环境）不抛错，按非 mac 处理', () => {
    const realNav = globalThis.navigator
    Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true })
    try {
      const w = mount(Kbd, { props: { keys: 'Mod+K' } })
      expect(keys(w)).toEqual(['Ctrl', 'K'])
      w.unmount()
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: realNav, configurable: true })
    }
  })
})
