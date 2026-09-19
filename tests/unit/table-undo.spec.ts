// useTableUndo 撤销栈行为锁定
// 关键不变量：一条记录 = 一次用户动作（矩阵粘贴/填充/选区清空必须整批合成一条，
// 否则撤销一次只回退一格）；新写入清空重做栈；容量上限丢最旧。
import { describe, it, expect } from 'vitest'
import { createUndoStack } from '@/components/data/composables/useTableUndo'

function rec(rowKey: string, colKey: string, before: string | undefined, after: string) {
  return { changes: [{ rowKey, colKey, before, after }] }
}

describe('useTableUndo · 基本栈行为', () => {
  it('空栈不可撤销/重做，undo/redo 返回 null', () => {
    const s = createUndoStack()
    expect(s.canUndo()).toBe(false)
    expect(s.canRedo()).toBe(false)
    expect(s.undo()).toBeNull()
    expect(s.redo()).toBeNull()
  })

  it('push 后取出待撤销记录（后进先出）', () => {
    const s = createUndoStack()
    s.push(rec('r1', 'a', undefined, 'x'))
    s.push(rec('r2', 'a', undefined, 'y'))
    expect(s.size()).toBe(2)
    expect(s.undo()?.changes[0].rowKey).toBe('r2')
    expect(s.undo()?.changes[0].rowKey).toBe('r1')
    expect(s.canUndo()).toBe(false)
  })

  it('撤销后进入重做栈，redo 取回', () => {
    const s = createUndoStack()
    s.push(rec('r1', 'a', undefined, 'x'))
    s.undo()
    expect(s.canRedo()).toBe(true)
    expect(s.redo()?.changes[0].rowKey).toBe('r1')
    expect(s.canRedo()).toBe(false)
    expect(s.canUndo()).toBe(true)
  })

  it('新写入清空重做栈（与 Excel 一致）', () => {
    const s = createUndoStack()
    s.push(rec('r1', 'a', undefined, 'x'))
    s.undo()
    expect(s.canRedo()).toBe(true)
    s.push(rec('r2', 'a', undefined, 'z'))
    expect(s.canRedo()).toBe(false)
  })

  it('空记录（无 changes）不入栈', () => {
    const s = createUndoStack()
    s.push({ changes: [] })
    expect(s.canUndo()).toBe(false)
    expect(s.size()).toBe(0)
  })

  it('容量上限：超限丢最旧记录', () => {
    const s = createUndoStack(3)
    for (let i = 0; i < 5; i++) s.push(rec(`r${i}`, 'a', undefined, String(i)))
    expect(s.size()).toBe(3)
    // 最旧的 r0、r1 已被丢弃 → 连续撤销只能拿到 r4、r3、r2
    expect(s.undo()?.changes[0].rowKey).toBe('r4')
    expect(s.undo()?.changes[0].rowKey).toBe('r3')
    expect(s.undo()?.changes[0].rowKey).toBe('r2')
    expect(s.canUndo()).toBe(false)
  })

  it('clear 清空两个栈', () => {
    const s = createUndoStack()
    s.push(rec('r1', 'a', undefined, 'x'))
    s.undo()
    s.clear()
    expect(s.canUndo()).toBe(false)
    expect(s.canRedo()).toBe(false)
  })
})

describe('useTableUndo · 批量记录（一次动作多格）', () => {
  it('多格合成一条：一次 undo 取回全部格', () => {
    const s = createUndoStack()
    s.push({
      changes: [
        { rowKey: 'r1', colKey: 'a', before: undefined, after: '1' },
        { rowKey: 'r2', colKey: 'a', before: undefined, after: '2' },
        { rowKey: 'r3', colKey: 'a', before: undefined, after: '3' },
      ],
    })
    const got = s.undo()
    expect(got?.changes).toHaveLength(3)
    expect(s.canUndo()).toBe(false)
  })

  it('before 为 undefined 表示该格此前无 override（撤销需删键还原「未修改」）', () => {
    const s = createUndoStack()
    s.push(rec('r1', 'a', undefined, 'x'))
    expect(s.undo()?.changes[0].before).toBeUndefined()
  })
})
