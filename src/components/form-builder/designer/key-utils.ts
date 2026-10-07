/**
 * 字段 key 唯一性工具 — 拆分自 domain.ts（超 800 行约束整改）
 *
 * 设计器所有写 key 的路径（属性面板编辑 / 标签联动改名 / 复制 / 粘贴 / JSON 导入）
 * 共用同一套判定与去重口径，杜绝重复 key 进 schema（重复 key 会让 formData 互相覆盖）。
 */
import { flattenNodes, type DesignerNode } from './types'

/** 收集整棵树已占用的字段 key（含容器子字段）——key 唯一性判定的唯一口径 */
export function collectFieldKeys(nodes: DesignerNode[]): Set<string> {
  const used = new Set<string>()
  for (const node of flattenNodes(nodes)) {
    if (node.key) used.add(node.key)
  }
  return used
}

/**
 * 生成不与 used 冲突的 key：base 空闲则原样返回，被占用时追加 _2/_3… 直到空闲。
 * 复制/粘贴/导入的 key 去重统一走此口（曾出现连贴两次产生两个 key_copy 撞 key）。
 */
export function uniquifyFieldKey(base: string, used: Set<string>): string {
  if (!base || !used.has(base)) return base
  let i = 2
  while (used.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}
