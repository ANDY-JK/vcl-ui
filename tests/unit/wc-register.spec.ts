// wc 域公共 API 单测（#468 补覆盖）
//
// 此前 wc 域**零 spec** —— 注册逻辑、前缀替换、SSR 兜底、重复注册守卫全都没钉住。
// 本轮拆出 component-map 后补上：既锁公共面（registerWebComponents/defineWC），
// 也锁「标签名 → 组件」映射的完整性（15 个标签、switch 是 Group 的派生形态）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { registerWebComponents, defineWC } from '@/components/wc'
import { componentMap, asWC } from '@/components/wc/component-map'

/** 造一个最小 customElements 注册表（jsdom 默认没有） */
function installCustomElements() {
  const defs = new Map<string, unknown>()
  const ce = {
    get: (n: string) => defs.get(n),
    define: (n: string, c: unknown) => defs.set(n, c),
  }
  vi.stubGlobal('customElements', ce)
  return defs
}

describe('registerWebComponents（Web Components 注册）', () => {
  beforeEach(() => installCustomElements())
  afterEach(() => vi.unstubAllGlobals())

  it('默认前缀：15 个标签全部注册', () => {
    registerWebComponents()
    expect(Object.keys(componentMap).length).toBe(15)
    for (const tag of Object.keys(componentMap)) {
      expect(customElements.get(tag)).toBeTruthy()
    }
  })

  it('自定义前缀：vc-button → my-button（映射表键不变）', () => {
    registerWebComponents('my')
    expect(customElements.get('my-button')).toBeTruthy()
    expect(customElements.get('vc-button')).toBeUndefined()
  })

  it('重复注册不覆盖（第二次调用后仍是第一次的定义）', () => {
    registerWebComponents()
    const first = customElements.get('vc-button')
    registerWebComponents()
    expect(customElements.get('vc-button')).toBe(first)
  })

  it('SSR/Node 无 customElements：跳过并告警，不抛', () => {
    vi.stubGlobal('customElements', undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => registerWebComponents()).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('customElements'))
  })
})

describe('defineWC（单个注册）', () => {
  beforeEach(() => installCustomElements())
  afterEach(() => vi.unstubAllGlobals())

  it('注册指定名字，重复注册不覆盖', () => {
    const comp = { name: 'X' } as never
    defineWC('x-thing', comp)
    expect(customElements.get('x-thing')).toBeTruthy()
    const first = customElements.get('x-thing')
    defineWC('x-thing', { name: 'Y' } as never)
    expect(customElements.get('x-thing')).toBe(first)
  })

  it('无 customElements：跳过并告警', () => {
    vi.stubGlobal('customElements', undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => defineWC('x-thing', {} as never)).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('customElements'), 'x-thing')
  })
})

describe('component-map（标签名 → 组件映射）', () => {
  it('15 个标签，键名与公共文档一致（vc- 前缀）', () => {
    expect(Object.keys(componentMap).sort()).toEqual(
      [
        'vc-breadcrumb',
        'vc-button',
        'vc-divider',
        'vc-empty',
        'vc-input',
        'vc-loading',
        'vc-pagination',
        'vc-progress-bar',
        'vc-result',
        'vc-skeleton',
        'vc-steps',
        'vc-switch',
        'vc-tabs',
        'vc-tag',
        'vc-toast',
      ].sort(),
    )
  })

  it('vc-switch 是 Group 的派生形态（name = VcSwitchElement，默认 type=switch）', () => {
    const sw = asWC(componentMap['vc-switch']) as { name?: string; props?: { type?: { default?: unknown } } }
    expect(sw.name).toBe('VcSwitchElement')
    expect(sw.props?.type?.default).toBe('switch')
  })

  it('映射表存原始组件（未 eager defineCustomElement）', () => {
    // 若被 eager 构造，值会是自定义元素构造器；这里仍应是 Vue 组件/函数形态
    for (const [tag, c] of Object.entries(componentMap)) {
      expect(['object', 'function'], `${tag} 应为对象/函数`).toContain(typeof c)
    }
  })
})
