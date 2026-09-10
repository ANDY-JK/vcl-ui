/**
 * Tabs ↔ TabPanel 关联
 *
 * 关键约束：TabPanel 与 Tabs 是「兄弟节点」书写（<Tabs/><TabPanel/>），
 * provide/inject 只沿组件树传播，兄弟拿不到 — 因此不用 inject，
 * 改为「消费方父组件挂登记表，两个组件各自向上找」：
 * Tabs 在 setup 时把 context 登记到「父组件实例 uid」，TabPanel 沿 parent 链
 * 向上查找该登记（同父即命中，不同父不串扰）。
 */
import type { ComponentInternalInstance, Ref } from 'vue'

export interface TabsContext {
  /** 实例级 id 前缀（与 Tabs 内 tabId 同源） */
  idPrefix: string
  /** 当前激活的 tab 值（Tabs 的 modelValue 的响应式映射） */
  activeValue: Ref<string | number>
  /** 已注册面板的 tab 值集合（响应式替换，Tabs 模板据此决定 aria-controls） */
  registered: Ref<Set<string | number>>
}

/** 父组件 uid → context：Tabs 挂，TabPanel 找 */
const contextByParentUid = new Map<number, TabsContext>()

/** Tabs 调用：在「消费方父组件实例」上登记 context */
export function registerTabsHost(parent: ComponentInternalInstance | null, ctx: TabsContext): void {
  if (!parent) return
  contextByParentUid.set(parent.uid, ctx)
}

/** Tabs 卸载时清理登记，防 Map 无限增长 */
export function unregisterTabsHost(parent: ComponentInternalInstance | null): void {
  if (!parent) return
  contextByParentUid.delete(parent.uid)
}

/** TabPanel 调用：沿 parent 链向上找登记过的 context */
export function findTabsContext(instance: ComponentInternalInstance | null): TabsContext | null {
  let cur = instance?.parent
  while (cur) {
    const hit = contextByParentUid.get(cur.uid)
    if (hit) return hit
    cur = cur.parent
  }
  return null
}

/** tab 按钮 id（Tabs 与 TabPanel 共用的拼接规则） */
export function tabIdOf(prefix: string, value: string | number): string {
  return `tab-${prefix}-${String(value)}`
}

/** 面板 id（同一前缀派生，一一对应） */
export function panelIdOf(prefix: string, value: string | number): string {
  return `tabpanel-${prefix}-${String(value)}`
}
