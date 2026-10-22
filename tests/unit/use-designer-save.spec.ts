/**
 * useDesignerSave — 保存 / 分享弹窗逻辑（2026-10-22）
 *
 * ## 为什么测它
 *
 * 此前覆盖率：**语句 20%**，105 行。它是设计器「保存」与「分享」两个入口的全部逻辑。
 *
 * ## 最该锁住的四条契约
 *
 *   ① 画布为空时 `openSave` **提示且不开弹窗**（不能存一个空表单）
 *   ② `saveForm` 返回 falsy 时**不关弹窗**（用户输入不能丢，要能重试）
 *   ③ 保存成功必须调 `onSaved()` —— 组件靠它作废草稿；漏了就是"存了但草稿还在"
 *   ④ **签名失败必须显式提示，不能静默退回未签名码**
 *      （源码注释明说：否则用户以为签了，实际没有 —— 这是安全语义，不是体验问题）
 *
 * ## 关于 buildShareUrl
 *
 * 它读 `location`，在 SSR（无 location）下要回落成相对链接。
 * happy-dom 有 location，所以两种分支要分别构造。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const copyTextMock = vi.fn(async () => true)
vi.mock('@/components/_internal/useCopy', () => ({
  copyText: (...a: unknown[]) => copyTextMock(...a),
}))

import { useDesignerSave, type DesignerSaveHost } from '@/components/form-builder/designer/useDesignerSave'
import type { DesignerNode } from '@/components/form-builder/designer/types'

/** 造一个 host；manager 只需实现被用到的三个方法 */
function makeHost(overrides: Partial<DesignerSaveHost> & { managerOverrides?: Record<string, unknown> } = {}) {
  const showTip = vi.fn()
  const onSaved = vi.fn()
  const manager = {
    saveForm: vi.fn(async () => ({ id: 'f1', name: 'x' })),
    buildShareCodeAsync: vi.fn(async () => 'FD1.abc'),
    ...overrides.managerOverrides,
  }
  const host: DesignerSaveHost = {
    getNodes: () => [{ id: 'n1', key: 'a', type: 'input' } as DesignerNode],
    getMeta: () => ({ title: '我的表单' }),
    manager: manager as never,
    onSaved,
    showTip,
    ...overrides,
  }
  return { host, showTip, onSaved, manager }
}

beforeEach(() => {
  vi.clearAllMocks()
  copyTextMock.mockResolvedValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('保存弹窗（openSave / onConfirmSave）', () => {
  it('画布为空 → **提示且不开弹窗**', () => {
    const { host, showTip } = makeHost({ getNodes: () => [] })
    const s = useDesignerSave(host)
    s.openSave()
    expect(showTip, '空画布应提示').toHaveBeenCalledTimes(1)
    expect(s.saveVisible.value, '空画布不该打开保存弹窗').toBe(false)
  })

  it('有节点 → 打开弹窗，且**预填 meta.title**', () => {
    const { host } = makeHost({ getMeta: () => ({ title: '已有标题' }) })
    const s = useDesignerSave(host)
    s.openSave()
    expect(s.saveVisible.value).toBe(true)
    expect(s.saveName.value, '应预填当前表单标题').toBe('已有标题')
  })

  it('meta.title 为 undefined → 预填空串（不崩）', () => {
    const { host } = makeHost({ getMeta: () => ({}) })
    const s = useDesignerSave(host)
    s.openSave()
    expect(s.saveName.value).toBe('')
  })

  it('保存成功 → 关弹窗 + 调 onSaved()（作废草稿）', async () => {
    const { host, onSaved, manager } = makeHost()
    const s = useDesignerSave(host)
    s.openSave()
    s.saveName.value = '新名字'
    await s.onConfirmSave()

    expect(manager.saveForm, '应把输入的名字交给 manager').toHaveBeenCalledWith('新名字')
    expect(s.saveVisible.value, '成功应关弹窗').toBe(false)
    // ⚠️ 漏调 onSaved 就是"存了但草稿还在"，用户下次会看到旧草稿
    expect(onSaved, '成功必须调 onSaved 作废草稿').toHaveBeenCalledTimes(1)
  })

  it('保存失败（返回 null）→ **不关弹窗、不调 onSaved**（输入不能丢）', async () => {
    const { host, onSaved } = makeHost({
      managerOverrides: { saveForm: vi.fn(async () => null) },
    })
    const s = useDesignerSave(host)
    s.openSave()
    s.saveName.value = '会失败的名字'
    await s.onConfirmSave()

    expect(s.saveVisible.value, '失败时弹窗必须保持打开，否则用户输入丢了').toBe(true)
    expect(s.saveName.value, '失败时名字应保留').toBe('会失败的名字')
    expect(onSaved, '失败不该作废草稿').not.toHaveBeenCalled()
  })

  it('onSaved 未提供时不崩（可选回调）', async () => {
    const { host } = makeHost({ onSaved: undefined })
    const s = useDesignerSave(host)
    s.openSave()
    await expect(s.onConfirmSave()).resolves.toBeUndefined()
    expect(s.saveVisible.value).toBe(false)
  })
})

describe('分享弹窗（openShare）', () => {
  it('签名成功 → 设置 shareCode 并打开弹窗', async () => {
    const { host } = makeHost({
      managerOverrides: { buildShareCodeAsync: vi.fn(async () => 'FD2.signed') },
    })
    const s = useDesignerSave(host)
    await s.openShare()
    expect(s.shareCode.value).toBe('FD2.signed')
    expect(s.shareVisible.value).toBe(true)
  })

  it('**签名失败 → 显式提示，且不开弹窗**（不能静默退回未签名码）', async () => {
    const { host, showTip } = makeHost({
      managerOverrides: {
        buildShareCodeAsync: vi.fn(async () => {
          throw new Error('signer unavailable')
        }),
      },
    })
    const s = useDesignerSave(host)
    await s.openShare()

    expect(showTip, '签名失败必须提示（否则用户以为签了）').toHaveBeenCalledTimes(1)
    const msg = (showTip as unknown as { mock: { calls: [string][] } }).mock.calls[0][0]
    expect(msg, '提示里应带失败原因').toContain('signer unavailable')
    expect(s.shareVisible.value, '签名失败不该打开分享弹窗').toBe(false)
  })

  it('返回空码 → 提示且不开弹窗（画布为空）', async () => {
    const { host, showTip } = makeHost({
      managerOverrides: { buildShareCodeAsync: vi.fn(async () => '') },
    })
    const s = useDesignerSave(host)
    await s.openShare()
    expect(showTip).toHaveBeenCalledTimes(1)
    expect(s.shareVisible.value).toBe(false)
  })
})

describe('复制（copyShare / copyShareLink）', () => {
  it('复制分享码成功 → 提示成功', async () => {
    const { host, showTip } = makeHost()
    const s = useDesignerSave(host)
    s.shareCode.value = 'FD1.xyz'
    await s.copyShare()
    expect(copyTextMock).toHaveBeenCalledWith('FD1.xyz')
    expect(showTip).toHaveBeenCalledTimes(1)
  })

  it('复制分享码失败 → 提示失败（不是成功）', async () => {
    copyTextMock.mockResolvedValue(false)
    const { host, showTip } = makeHost()
    const s = useDesignerSave(host)
    s.shareCode.value = 'FD1.xyz'
    await s.copyShare()
    // 两次提示的文案应不同：成功/失败
    const calls = (showTip as unknown as { mock: { calls: [string][] } }).mock.calls
    expect(calls[0][0], '失败文案不该与成功相同').toBeTruthy()
    expect(copyTextMock).toHaveBeenCalled()
  })

  it('复制发布链接 → 复制的是 buildShareUrl() 的结果', async () => {
    const { host } = makeHost()
    const s = useDesignerSave(host)
    s.shareCode.value = 'FD1.abc'
    const url = s.buildShareUrl()
    await s.copyShareLink()
    expect(copyTextMock).toHaveBeenCalledWith(url)
  })
})

describe('buildShareUrl', () => {
  it('有 location 时 → origin + pathname + #/form/<code>', () => {
    const { host } = makeHost()
    const s = useDesignerSave(host)
    s.shareCode.value = 'CODE123'
    const url = s.buildShareUrl()
    expect(url).toContain('#/form/CODE123')
    expect(url.startsWith('http'), '有 location 时应是绝对链接').toBe(true)
  })

  it('**SSR 无 location 时 → 回落相对链接**（不崩）', () => {
    const { host } = makeHost()
    const s = useDesignerSave(host)
    s.shareCode.value = 'CODE123'

    const savedLocation = globalThis.location
    try {
      // 模拟 SSR：删掉 location
      Object.defineProperty(globalThis, 'location', { value: undefined, configurable: true })
      const url = s.buildShareUrl()
      expect(url, 'SSR 下应是相对链接').toBe('#/form/CODE123')
      expect(url.startsWith('http'), 'SSR 下不该有 origin').toBe(false)
    } finally {
      Object.defineProperty(globalThis, 'location', { value: savedLocation, configurable: true })
    }
  })
})
