/**
 * canWrite —— 可写判据的唯一实现（TD-90 收口）
 *
 * 判据收敛前散落三处且写法不同（`clearable && !readonly && !disabled` /
 * `!disabled` / 模板内联 `!disabled`），TD-90 因此被踩了三次。
 * 这个文件锁住"唯一语义"，防止将来又出现第四种写法。
 */
import { describe, it, expect } from 'vitest'
import { canWrite } from '@/components/_internal/writable'

describe('canWrite 可写判据', () => {
  it('两个字段都未声明 → 可写（默认开放）', () => {
    expect(canWrite({})).toBe(true)
  })

  it('disabled=true → 不可写', () => {
    expect(canWrite({ disabled: true })).toBe(false)
  })

  it('readonly=true → 不可写', () => {
    expect(canWrite({ readonly: true })).toBe(false)
  })

  it('两者都为 true → 不可写（or 语义，不是 and）', () => {
    expect(canWrite({ disabled: true, readonly: true })).toBe(false)
  })

  it('显式 false → 可写（不能把 false 当"未声明"处理）', () => {
    expect(canWrite({ disabled: false, readonly: false })).toBe(true)
  })

  it('**看当下状态**：同一对象改字段后结果随之变化（面板打开后 disabled 翻真的场景）', () => {
    const p = { disabled: false }
    expect(canWrite(p)).toBe(true)
    p.disabled = true // 宿主在控件已渲染后禁用
    expect(canWrite(p), '写入口必须按调用时的状态判，不能缓存渲染分支的结论').toBe(false)
  })
})
