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
