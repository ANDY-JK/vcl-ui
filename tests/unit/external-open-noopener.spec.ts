// 外链打开必须带 noopener,noreferrer（#404）
//
// 背景：window.open(url, '_blank') 默认把新窗口的 window.opener 指向本页，
// 目标站可执行 window.opener.location = '仿冒页' 把用户当前的正版页面换掉（反向标签劫持）。
// 本仓对 <a target="_blank"> 已有防护（sanitize 补 rel、LowCodeNav 手写 rel），
// 但三处 window.open 调用全漏了。此处锁定行为：任何外链出口都必须带这两个 feature。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { openExternalUrl } from '@/components/_internal/utils'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('openExternalUrl · 外链出口必须防反向标签劫持', () => {
  it('传给 window.open 的 features 同时含 noopener 与 noreferrer', () => {
    const spy = vi.spyOn(window, 'open').mockReturnValue(null)
    openExternalUrl('https://third-party.example/nav')
    expect(spy).toHaveBeenCalledTimes(1)
    const [url, target, features] = spy.mock.calls[0]
    expect(url).toBe('https://third-party.example/nav')
    expect(target).toBe('_blank')
    expect(typeof features).toBe('string')
    expect(features, '缺 noopener → 目标站可改本页地址').toMatch(/noopener/)
    expect(features, '缺 noreferrer → 内部地址与查询串泄漏给第三方').toMatch(/noreferrer/)
  })

  it('转发返回值（调用方可判断是否被拦截）', () => {
    const win = { closed: false } as unknown as Window
    vi.spyOn(window, 'open').mockReturnValue(win)
    expect(openExternalUrl('https://a.example')).toBe(win)
  })

  it('**三处调用点都不再自己拼 window.open**（源码级防回归）', async () => {
    const { readFileSync } = await import('node:fs')
    const files = [
      'src/components/feedback/composables/useNotify.ts',
      'src/components/route-planner/RouteResult.vue',
      'src/components/_internal/utils.ts',
    ]
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      // 只数**代码行**：注释里必然会出现 `window.open(...)` 这种说明
      const codeLines = src
        .split('\n')
        .filter((l) => !/^\s*(\*|\/\/)/.test(l))
        .join('\n')
      const direct = codeLines.match(/window\.open\(/g) ?? []
      // utils.ts 是该 helper 自身所在文件，允许出现一次（带 features 的那行）
      const allowed = f.endsWith('_internal/utils.ts') ? 1 : 0
      expect(direct.length, `${f} 出现了 ${direct.length} 处裸 window.open（应为 ${allowed}）`).toBe(allowed)
      expect(src).toContain('openExternalUrl')
    }
  })
})