/**
 * useSelectFiltering — Select 面板的输入过滤 + 下拉虚拟化（自 Select.vue 下沉，M3 持续拆分）
 *
 * 承接两块强耦合逻辑：
 *   1. 拼音过滤：共享拼音匹配器（全拼/首字母子串匹配）+ 选项 watch 清缓存
 *   2. 防抖搜索：200ms 防抖后再生效（千级选项打字不卡顿），空值立即生效
 *   3. 虚拟滚动：行高实测 + useListVirtual 窗口化（可视窗 ± OVERSCAN），
 *      首尾占位撑滚动区；行高不一致（desc/自定义插槽）时禁用（宁可全渲染）
 * 键盘高亮/焦点管理留在宿主（highlightIdx 经注入回写）。
 * measureOptionRow 同时供 useSelectDatePanel 在面板打开时调用。
 */
import { ref, computed, watch, nextTick, useSlots } from 'vue'
import type { Ref } from 'vue'
import { createPinyinMatcher } from '@/components/_internal/usePinyinSearch'
import { useDebounceFn } from '@/components/_internal/useDebounce'
import { useListVirtual } from './utils/useListVirtual'
import type { Option } from '@/components/shared/types'

export function useSelectFiltering(o: {
  options: () => Option[] | undefined
  pinyinEnabled: () => boolean
  /** 可输入型（select/combobox）用 comboText，树选/菜单用面板搜索框 searchText */
  isInputable: () => boolean
  comboText: Ref<string>
  searchText: Ref<string>
  /** 键盘高亮索引（过滤变化时宿主复位为 -1，宿主负责 scrollToIndex） */
  highlightIdx: Ref<number>
}) {
  const _slots = useSlots()

  /** 复用共享拼音匹配器（usePinyinSearch.createPinyinMatcher，原 Select 本地实现已迁移并去空格修复） */
  const _pinyinMatcher = createPinyinMatcher(() => o.pinyinEnabled())

  /** 选项变化时清理过期缓存项（防止内存泄漏） */
  watch(
    o.options,
    (opts) => {
      // 选项列表变化时，清理不在新选项中的缓存项
      if (!opts || opts.length === 0) {
        _pinyinMatcher.clearCache()
        return
      }
      _pinyinMatcher.pruneCache(new Set(opts.map((item) => item.label)))
    },
    { immediate: true },
  )

  // select/combobox：comboText 只在有用户输入时非空 → 打开面板（comboText 为空）恒展示全部选项，
  // 选中内容不会把面板过滤成只剩匹配项；tree-select 用面板内搜索框的 searchText
  const filterKeyword = computed(() => (o.isInputable() ? o.comboText.value : o.searchText.value))

  /** 同步匹配：按关键词过滤选项（不走防抖），供 Enter 提交等需要"即时结果"的路径使用 */
  function matchOptions(kw: string): Option[] {
    const opts = o.options()
    if (!opts) return []
    if (!kw) return opts
    return opts.filter(
      (item) =>
        _pinyinMatcher.match(item.label, kw) ||
        _pinyinMatcher.match(String(item.value), kw) ||
        (item._search ? _pinyinMatcher.match(item._search, kw) : false),
    )
  }

  /** Debounced 搜索关键词：200ms 防抖后再生效，避免 1000+ 选项时每次按键全量过滤卡顿 */
  const _debouncedKeyword = ref(filterKeyword.value)
  const { run: _debounceSearch } = useDebounceFn((val: string) => {
    _debouncedKeyword.value = val
  }, 200)
  watch(filterKeyword, (val) => {
    // 空值立即生效（清除搜索时无需等待）
    if (!val) {
      _debouncedKeyword.value = val
      return
    }
    _debounceSearch(val)
  })

  const filteredOptions = computed(() => matchOptions(_debouncedKeyword.value))

  /* ── 下拉窗口化（虚拟化）──────────────────────────────
     .panel-list 只有 200px 可视高，但过去把 filteredOptions 全量渲染成 <button>，
     1 万选项就是 1 万个看不见的节点。这里只渲染可视窗口 ± overscan。
     行高必须一致才能用等系数学：带 desc 或用了 #option 插槽的行更高，
     那种列表直接不启用（宁可全渲染，也不能滚到后面错行）。 */
  const panelListRef = ref<HTMLElement | null>(null)
  /** 实测出的单行高度；0 = 还没测到，此时不启用 */
  const optRowH = ref(0)
  const uniformOptionRows = computed(() => !_slots.option && !filteredOptions.value.some((opt) => !!opt.desc))
  const optVirtual = useListVirtual({
    container: () => panelListRef.value,
    itemCount: () => filteredOptions.value.length,
    rowHeight: () => (uniformOptionRows.value ? optRowH.value : 0),
  })
  /** 窗口内的切片 —— 保留**绝对下标**，因为 option 的 id 与 aria-activedescendant 都按下标对应 */
  const windowedOptions = computed(() => {
    const all = filteredOptions.value
    if (!optVirtual.enabled.value) return all.map((opt, index) => ({ opt, index }))
    return all.slice(optVirtual.start.value, optVirtual.end.value).map((opt, i) => ({
      opt,
      index: optVirtual.start.value + i,
    }))
  })

  /** 面板打开、行渲染出来后测一次行高（有界容器才有 clientHeight 可读） */
  async function measureOptionRow() {
    await nextTick()
    const el = panelListRef.value?.querySelector('.panel-item') as HTMLElement | null
    if (el) {
      const h = el.offsetHeight
      if (h > 0) {
        optRowH.value = h
        // 顺便把可视高取准，首帧就能算出正确窗口
        if (panelListRef.value) optVirtual.onScroll({ target: panelListRef.value } as unknown as Event)
      }
    }
  }

  watch(filteredOptions, () => {
    o.highlightIdx.value = -1
    optVirtual.reset()
  })

  // 键盘上下键走出窗口时把那一行滚进可视区
  watch(o.highlightIdx, (i) => {
    if (i >= 0) optVirtual.scrollToIndex(i)
  })

  return {
    filteredOptions,
    matchOptions,
    panelListRef,
    optVirtual,
    windowedOptions,
    measureOptionRow,
  }
}
