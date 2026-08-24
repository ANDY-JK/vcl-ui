// ==================== DataTable 状态持久化（sync-first：localStorage 同步恢复，async 适配器异步兜底） ====================
// H13 重构：7 个持久化特性收敛为注册表驱动（恢复 + 流式恢复 + 持久化 watch 三段样板统一），键名唯一出处 _key()
// ⛔ 保护 — 禁止修改持久化键名/格式（localStorage 存量数据依赖），禁止删除旧格式键清理
import { watch, computed, type Ref, type ComputedRef, type WatchSource } from 'vue'
import type { Column, TableStorage } from './types'
import { createLocalStorage } from './types'

/** 列结构简单 hash，生成稳定的 auto namespace（页面刷新不丢映射） */
function _colHash(columns: Column[]): string {
  const s = columns.map((c) => c.key).join('|')
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

/** 持久化支持的七种特征（clearAllPersisted / 旧格式键清理遍历用，静态清单） */
const FEATURE_KEYS = ['sort', 'filter', 'colorder', 'colwidth', 'dense', 'hiddenCols', 'fixedCols'] as const

/** 布局类持久化项：不受服务端模式影响，始终启用 */
const LAYOUT_FEATURES = new Set<string>(['colorder', 'colwidth', 'dense', 'hiddenCols', 'fixedCols'])

/** 特性激活与存储键统一入口 */
type PersistKind = 'layout' | 'state'

export function useTablePersistence(
  namespace: string | undefined,
  columns: Column[],
  opts: {
    sortState?: Ref<{ key: string; order: 'asc' | 'desc' }>
    sortHistory?: Ref<Record<string, 'asc' | 'desc'>>
    sortKey?: string
    filterState: Ref<Record<string, { searchText: string; selectedValues: string[] }>>
    _columnOrder?: Ref<string[]>
    columnWidths?: Ref<Record<string, number>>
    _userResizedCols?: Ref<Set<string>>
    _dense?: Ref<boolean>
    dynamicFixedLeft?: Ref<Set<string>>
    dynamicFixedRight?: Ref<Set<string>>
    denseProp?: boolean
    hiddenColumns?: Ref<Set<string>>
    persistence?: 'auto' | 'none'
    searchMode?: 'client' | 'server'
    filterMode?: 'client' | 'server'
    /** 外部存储适配器，不传则用 localStorage（saas_dt- 前缀） */
    storage?: TableStorage
  },
): {
  _ns: ComputedRef<string>
  _colKey: ComputedRef<string>
  _clearPersisted: (key: string) => void
  restoreColWidths: () => void
  clearAllPersisted: () => void
  flushWidths: () => void
} {
  // ---- 存储后端 ----
  const _store: TableStorage = opts.storage ?? createLocalStorage('')

  // ---- 键名空间 ----
  const _autoId = `-i${_colHash(columns)}`
  const _ns = computed(() => (namespace ? `-${namespace}` : _autoId))
  const _colKey = computed(() => columns.map((c) => c.key).join('|'))

  /** 持久化键名唯一出处（勿在别处拼 dt 前缀） */
  const _key = (feat: string): string => `dt${_ns.value}-${feat}`

  /** 同步加载并应用：检测 _store.get 是否返回 Promise，同步 store（localStorage）即时应用，避免异步竞态 */
  function _loadAndApply<T>(key: string, apply: (cached: T | null) => void): void {
    try {
      const result = _store.get(_key(key))
      if (result instanceof Promise) {
        // 异步存储适配器：保持 .then() 回调模式
        result
          .then((raw) => {
            if (!raw) {
              apply(null)
              return
            }
            try {
              apply(JSON.parse(raw) as T)
            } catch {
              apply(null)
            }
          })
          .catch(() => apply(null))
      } else {
        // 同步存储（localStorage 默认）：立即应用，无竞态
        if (!result) {
          apply(null)
          return
        }
        apply(JSON.parse(result) as T)
      }
    } catch {
      apply(null)
    }
  }

  /** 内置 storageSet：typed → JSON.stringify → write */
  async function _persist(key: string, value: unknown): Promise<void> {
    try {
      await _store.set(_key(key), JSON.stringify(value))
    } catch {
      /* quota / network 静默 */
    }
  }

  /** 内置 remove */
  async function _removePersist(key: string): Promise<void> {
    try {
      await _store.remove(_key(key))
    } catch {
      /* 静默 */
    }
  }

  // ---- 旧格式键清理（一次性，dt{ns}-{colKey}-{feat} 遗留） ----
  let _oldKeysCleaned = false
  async function _cleanOldFormatKeys(): Promise<void> {
    if (_oldKeysCleaned) return
    _oldKeysCleaned = true
    for (const feat of FEATURE_KEYS) {
      try {
        await _store.remove(`dt${_ns.value}-${_colKey.value}-${feat}`)
      } catch {
        /* 忽略 */
      }
    }
  }

  // ---- 启用判断 ----
  const _globalDisabled = opts.persistence === 'none'
  const _layoutActive = !_globalDisabled
  const _stateActive = !_globalDisabled

  function _isActive(kind: PersistKind): boolean {
    return kind === 'layout' ? _layoutActive : _stateActive
  }

  // ========== 特性注册表 ==========
  // 每个特性声明：存储键、激活依赖、恢复逻辑（同步执行一次 + 列结构变化补执行）、持久化 watch 源与写值。
  // 新增/删除特性只需改这里一处，DataTable/useTableExtras 无需感知。
  interface FeatureDef<T> {
    key: string
    kind: PersistKind
    /** 依赖的 opts 全部存在才注册 */
    deps: () => boolean
    /** 恢复：同步执行 + 列结构变化时补执行（幂等由实现保证） */
    restore: (cached: T | null) => void
    /** 状态变化 → 写值；返回 undefined 表示清除持久化 */
    serialize: () => T | undefined
    /** watch 源（注册时取 ref，后续只变 .value） */
    sources: () => WatchSource[]
    deep?: boolean
  }

  /** 注册一个特性：统一接管 恢复 + 流式恢复 + 持久化 watch 三段样板 */
  function register<T>(def: FeatureDef<T>): void {
    if (!_isActive(def.kind) || !def.deps()) return
    // 同步恢复
    _loadAndApply<T>(def.key, (cached) => def.restore(cached))
    // 流式恢复：列可能在数据到达后才逐步出现，列变化时补恢复
    watch(
      () => columns.map((c) => c.key).join(','),
      () => {
        _loadAndApply<T>(def.key, (cached) => def.restore(cached))
      },
    )
    // 持久化：状态变化 → serialize；undefined 表示清空
    const srcs = def.sources()
    watch(
      srcs,
      () => {
        _cleanOldFormatKeys()
        const value = def.serialize()
        if (value === undefined) _removePersist(def.key)
        else _persist(def.key, value)
      },
      { deep: def.deep },
    )
  }

  // ---------- 排序持久化（state 类） ----------
  let _sortRestored = false
  register<{ key: string; order: string; history?: Record<string, 'asc' | 'desc'> }>({
    key: 'sort',
    kind: 'state',
    deps: () => !!opts.sortState && !!opts.sortHistory,
    restore: (cached) => {
      if (_sortRestored && opts.sortState!.value.key) return // 已成功恢复且当前有排序，不覆盖
      if (cached?.key && columns.some((c) => c.key === cached.key)) {
        _cleanOldFormatKeys()
        opts.sortState!.value = { key: cached.key, order: cached.order === 'desc' ? 'desc' : 'asc' }
        if (cached.history) opts.sortHistory!.value = cached.history
        _sortRestored = true
      }
    },
    sources: () => [opts.sortState!, opts.sortHistory!],
    serialize: () => {
      const s = opts.sortState!
      return s.value.key ? { key: s.value.key, order: s.value.order, history: opts.sortHistory!.value } : undefined
    },
    deep: true,
  })

  // ---------- 筛选持久化（state 类） ----------
  register<Record<string, string[]>>({
    key: 'filter',
    kind: 'state',
    deps: () => !!opts.filterState,
    restore: (cached) => {
      if (cached) {
        _cleanOldFormatKeys()
        const restored: Record<string, { searchText: string; selectedValues: string[] }> = {}
        for (const [key, vals] of Object.entries(cached)) {
          if (vals.length > 0 && columns.some((c) => c.key === key)) {
            restored[key] = { searchText: '', selectedValues: vals }
          }
        }
        if (Object.keys(restored).length > 0) {
          opts.filterState.value = restored
        }
      }
    },
    sources: () => [opts.filterState],
    serialize: () => {
      const slim: Record<string, string[]> = {}
      for (const [key, s] of Object.entries(opts.filterState.value)) {
        if (s.selectedValues.length > 0) slim[key] = [...s.selectedValues]
      }
      return Object.keys(slim).length > 0 ? slim : undefined
    },
    deep: true,
  })

  // ---------- 列顺序持久化（layout 类） ----------
  register<string[]>({
    key: 'colorder',
    kind: 'layout',
    deps: () => !!opts._columnOrder,
    restore: (cached) => {
      if (cached && Array.isArray(cached) && cached.length > 0) {
        _cleanOldFormatKeys()
        const curKeys = new Set(opts._columnOrder!.value)
        const restored: string[] = []
        for (const k of cached) {
          if (curKeys.has(k) && !restored.includes(k)) restored.push(k)
        }
        for (const k of opts._columnOrder!.value) {
          if (!restored.includes(k)) restored.push(k)
        }
        opts._columnOrder!.value = restored
      }
    },
    sources: () => [opts._columnOrder!],
    serialize: () => [...opts._columnOrder!.value],
  })

  // ---------- 密度持久化（layout 类；denseProp 受控时跳过恢复，持久化 watch 仍生效） ----------
  register<string>({
    key: 'dense',
    kind: 'layout',
    deps: () => !!opts._dense,
    restore: (cached) => {
      if (opts.denseProp) return
      if (cached === '1') {
        _cleanOldFormatKeys()
        opts._dense!.value = true
      } else if (cached === '0') {
        _cleanOldFormatKeys()
        opts._dense!.value = false
      }
    },
    sources: () => [opts._dense!],
    serialize: () => (opts._dense!.value ? '1' : '0'),
  })

  // ---------- 列显隐持久化（layout 类） ----------
  register<string[]>({
    key: 'hiddenCols',
    kind: 'layout',
    deps: () => !!opts.hiddenColumns,
    restore: (cached) => {
      if (cached && Array.isArray(cached) && cached.length > 0) {
        _cleanOldFormatKeys()
        const validKeys = new Set(columns.map((c) => c.key))
        for (const k of cached) {
          if (validKeys.has(k)) opts.hiddenColumns!.value.add(k)
        }
      }
    },
    sources: () => [opts.hiddenColumns!],
    serialize: () => {
      const arr = Array.from(opts.hiddenColumns!.value).filter((k) => columns.some((c) => c.key === k))
      return arr.length > 0 ? arr : undefined
    },
    deep: true,
  })

  // ---------- 固定列持久化（layout 类；左右互斥，随布局恢复） ----------
  register<{ left: string[]; right: string[]; userSet?: boolean }>({
    key: 'fixedCols',
    kind: 'layout',
    deps: () => !!opts.dynamicFixedLeft && !!opts.dynamicFixedRight,
    restore: (cached) => {
      if (!cached || !Array.isArray(cached.left) || !Array.isArray(cached.right)) return
      _cleanOldFormatKeys()
      const validKeys = new Set(columns.map((c) => c.key))
      const left = new Set<string>()
      const right = new Set<string>()
      for (const k of cached.left) if (validKeys.has(k)) left.add(k)
      for (const k of cached.right) if (validKeys.has(k)) right.add(k)
      // 新格式 userSet=true：用户明确管理过固定状态（含「全部取消」），缓存为准
      if (cached.userSet === true) {
        opts.dynamicFixedLeft!.value = left
        opts.dynamicFixedRight!.value = right
        return
      }
      // 旧格式缓存：与静态 fixed prop 默认合并（静态列继续生效，动态列叠加）
      for (const c of columns) {
        if (c.fixed === 'left') left.add(c.key)
        else if (c.fixed === 'right') right.add(c.key)
      }
      if (left.size || right.size) {
        opts.dynamicFixedLeft!.value = left
        opts.dynamicFixedRight!.value = right
      }
    },
    sources: () => [opts.dynamicFixedLeft!, opts.dynamicFixedRight!],
    serialize: () => ({
      left: [...opts.dynamicFixedLeft!.value].filter((k) => columns.some((c) => c.key === k)),
      right: [...opts.dynamicFixedRight!.value].filter((k) => columns.some((c) => c.key === k)),
      // 显式记录用户已接管固定状态：即使全部取消也要记住，防止静态 fixed 重新生效
      userSet: true,
    }),
    deep: true,
  })

  // ========== 列宽持久化（layout 类，独立链路：无恢复/无标准 watch，防抖 200ms 只在松手后写） ==========
  let _widthTimer: ReturnType<typeof setTimeout> | null = null
  function persistWidths(widths: Record<string, number>): void {
    const resized = opts._userResizedCols?.value
    if (!resized || resized.size === 0) return
    _cleanOldFormatKeys()
    const userWidths: Record<string, number> = {}
    for (const key of resized) {
      if (widths[key] && widths[key] > 0) userWidths[key] = widths[key]
    }
    if (Object.keys(userWidths).length > 0) _persist('colwidth', userWidths)
    else _removePersist('colwidth')
  }
  if (_isActive('layout') && opts.columnWidths) {
    // 拖拽列宽时 mousemove 高频触发 columnWidths 变化，防抖 200ms 只在松手后写一次
    watch(
      opts.columnWidths,
      (widths) => {
        if (_widthTimer) clearTimeout(_widthTimer)
        _widthTimer = setTimeout(() => {
          _widthTimer = null
          persistWidths(widths)
        }, 200)
      },
      { deep: true },
    )
  }

  // ========== 列宽恢复（供 DataTable 数据到达后调用） ==========
  function restoreColWidths(): void {
    if (!_isActive('layout') || !opts.columnWidths) return
    _loadAndApply<Record<string, number>>('colwidth', (widths) => {
      if (!widths || typeof widths !== 'object' || Array.isArray(widths)) return
      for (const [key, w] of Object.entries(widths)) {
        if (typeof w === 'number' && w > 0) {
          opts.columnWidths!.value[key] = w
          opts._userResizedCols?.value.add(key)
        }
      }
    })
  }

  // ========== 统一清除 API ==========
  function clearAllPersisted(): void {
    for (const feat of FEATURE_KEYS) {
      _removePersist(feat)
      Promise.resolve(_store.remove(`dt${_ns.value}-${_colKey.value}-${feat}`)).catch(() => {})
    }
  }

  function _clearPersisted(key: string): void {
    if (LAYOUT_FEATURES.has(key) ? _layoutActive : _stateActive) _removePersist(key)
  }

  /** 组件卸载前调用：把防抖窗口内未落盘的列宽立即写入 */
  function flushWidths(): void {
    if (_isActive('layout') && opts.columnWidths) {
      if (_widthTimer) clearTimeout(_widthTimer)
      persistWidths(opts.columnWidths.value)
    }
  }

  return { _ns, _colKey, _clearPersisted, restoreColWidths, clearAllPersisted, flushWidths }
}
