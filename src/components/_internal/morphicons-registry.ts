/**
 * Morphicons 形变图标注册模块
 *
 * morphicons 接受「图标数据」（IconNode）而非图标组件，数据由
 * scripts/gen-morphicons-data.mjs 从 @lucide/vue 的 __iconNode 具名导出抽取。
 *
 * 数据结构（见生成脚本注释）：
 *   规范名 → IconNode          （1737 个真实几何）
 *   别名   → '规范名字符串'     （2319 个同义名，存引用不复制几何）
 * 因此查找时需跟随一次字符串引用；对外列名单只返回规范名，避免同义项重复展示。
 *
 * ⚠️ 性能：组件与数据都走动态 import，仅 provider='morphicons' 时加载，
 *    不随 IconSvg（默认 lucide）打入主包。数据 557KB（gzip ~127KB）。
 */
import type { Component } from 'vue'

/** 与 morphicons 的 IconNode 结构对齐（本地声明，避免为此引入类型依赖） */
export type MorphIconNode = ReadonlyArray<readonly [string, Record<string, string | number | undefined>]>

/** 数据文件里每个键要么是几何，要么是指向规范名的字符串引用 */
type MorphDataValue = MorphIconNode | string

let morphComponent: Component | null = null
let iconData: Record<string, MorphDataValue> | null = null
let registered = false
let pending: Promise<void> | null = null

/**
 * 加载 MorphIcon 组件与图标数据（幂等）。
 * 失败时清空 pending，让后续渲染可重试，而不是永久返回同一个 rejected promise。
 */
export function ensureMorphicons(): Promise<void> {
  if (registered) return Promise.resolve()
  if (pending) return pending
  pending = Promise.all([import('morphicons/vue'), import('./morphicons-icons-data.json')])
    .then(([vueMod, dataMod]) => {
      morphComponent = (vueMod as { MorphIcon: Component }).MorphIcon
      iconData = ((dataMod as { default?: unknown }).default ?? dataMod) as Record<string, MorphDataValue>
      registered = true
    })
    .catch((e) => {
      pending = null
      throw e
    })
  return pending
}

/** 组件与数据是否已就绪（同步判断，供渲染降级用） */
export function isMorphiconsReady(): boolean {
  return registered
}

export function getMorphIconComponent(): Component | null {
  return morphComponent
}

/**
 * 取某图标的形变几何数据。
 * 支持别名：跟随一次字符串引用（引用只指向规范名，不会成链）。
 * 未收录返回 null（调用方渲染兜底）。
 */
export function getMorphIconNode(name: string): MorphIconNode | null {
  const v = iconData?.[name]
  if (v === undefined) return null
  if (typeof v === 'string') {
    const target = iconData?.[v]
    return typeof target === 'string' ? null : (target ?? null)
  }
  return v
}

/** 已收录的全部规范名（需先 ensure；别名不列出，避免同义项重复；供选择器列表面板用） */
export function getMorphIconNames(): string[] {
  if (!iconData) return []
  return Object.keys(iconData).filter((k) => typeof iconData![k] !== 'string')
}
