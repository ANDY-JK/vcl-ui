/**
 * DesignerPanel · 左侧字段面板的组件级契约（#502）
 *
 * 该组件此前只有 `designer-panels-resize.spec.ts`（面板**宽度**）与
 * `designer-a11y.spec.ts`（画布树）碰过，**面板自身**的搜索 / 分组 / 添加 / 拖拽
 * 一次都没有组件级断言（脚本段 76.2%）。
 *
 * 本文件同时钉两件在写用例时暴露出来的事：
 *
 * ## 一、`FieldTypeMeta.group` 的类型在撒谎（#502）
 *
 * ```ts
 * group: '基础' | '选择' | '高级' | '高级字段' | '布局容器' | '布局'   // ← 声明
 * group: t(r.group) as FieldTypeMeta['group'],                          // ← 运行时：翻译后的字符串
 * ```
 *
 * 注册表里 `group` 存的是 **i18n key**（`fbGroup.advancedFields` / `fbGroup.display` …），
 * `getFieldTypes()` 把它翻成**当前语言的标题**。于是：
 *   · 声明的联合类型是**中文字面量**，运行时却是「翻译后的标题」——
 *     切到 en-US 就是 'Advanced fields' / 'Display'，跟联合类型里的任何一个都不相等；
 *   · 联合类型**少了 '展示'（fbGroup.display）这一组**（注册表里有 7 个 key，声明只有 6 个）；
 *   · `as` 断言把这个不符按进了类型系统 —— 写 `meta.group === '展示'` 会**报类型错**，
 *     可在 zh-CN 运行时它本来是成立的（这是最坑的一种"类型错 + 运行时对"）。
 *
 * 修法：声明成 `string` 并写清"是翻译后的分组标题"，去掉 `as` 断言 ——
 * 类型系统不该替调用方编一个假的封闭集合。
 *
 * ## 二、组件头注释里的「dataTransfer 携带 isContainer」是**过时的**（#502）
 *
 * 落点侧 `useCanvasDnd` 是**按类型查注册表**判断容器身份的，从不读 `isContainer` 标记；
 * `onDragStart` 也从来没设置过它。这条注释会让人以为少传了什么。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import DesignerPanel from '@/components/form-builder/designer/DesignerPanel.vue'
import { getFieldTypes } from '@/components/form-builder/designer/types/domain'
import { setLocale } from '@/components/_internal/i18n'

const mounted: VueWrapper[] = []
function mountPanel(): VueWrapper {
  const w = mount(DesignerPanel, { attachTo: document.body })
  mounted.push(w)
  return w
}

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  setLocale('zh-CN')
})

const items = (w: VueWrapper) => w.findAll('.ldp-field-item')
const groups = (w: VueWrapper) => w.findAll('.ldp-group')
const searchInput = (w: VueWrapper) => w.find('.ldp-search-input')

async function search(w: VueWrapper, text: string) {
  await searchInput(w).setValue(text)
  await nextTick()
}

describe('DesignerPanel · 分组与字段项', () => {
  it('渲染的分组数与条目数与注册表一致（不多不少）', () => {
    const w = mountPanel()
    const meta = getFieldTypes()
    expect(groups(w).length).toBe(new Set(meta.map((m) => m.group)).size)
    expect(items(w).length).toBe(meta.length)
  })

  it('每个字段项的标签都能在注册表里找到（不是孤儿项）', () => {
    const w = mountPanel()
    const labels = new Set(getFieldTypes().map((m) => m.label))
    const shown = w.findAll('.ldp-field-label').map((n) => n.text())
    for (const t of shown) expect(labels.has(t), `${t} 应当来自注册表`).toBe(true)
  })

  it('**分组标题是翻译后的文本（不是 i18n key）**', async () => {
    setLocale('zh-CN')
    const w = mountPanel()
    const zhTitles = groups(w).map((g) => g.find('.ldp-group-title').text().replace(/\d+$/, '').trim())
    expect(zhTitles.some((t) => t.includes('fbGroup.')), '不能把 key 直接显示给用户').toBe(false)
    expect(zhTitles.length).toBeGreaterThan(0)

    setLocale('en-US')
    await nextTick()
    const enTitles = groups(w).map((g) => g.find('.ldp-group-title').text().replace(/\d+$/, '').trim())
    expect(enTitles, '切语言后分组标题要跟着变（证明存的是翻译结果）').not.toEqual(zhTitles)
  })

  it('容器类型项带 ldp-field-item-container 类', () => {
    const w = mountPanel()
    const containers = getFieldTypes().filter((m) => m.isContainer).map((m) => m.type)
    expect(containers.length, '注册表里应有容器类型').toBeGreaterThan(0)
    const withCls = items(w).filter((b) => b.classes().includes('ldp-field-item-container'))
    expect(withCls.length).toBe(containers.length)
  })
})

describe('DesignerPanel · 搜索过滤', () => {
  it('按标签过滤（中文）', async () => {
    const w = mountPanel()
    const first = getFieldTypes()[0]
    await search(w, first.label)
    expect(items(w).length).toBe(1)
    expect(w.find('.ldp-field-label').text()).toBe(first.label)
  })

  it('按类型名过滤（英文 type 也认）', async () => {
    const w = mountPanel()
    await search(w, 'text')
    expect(items(w).length).toBeGreaterThan(0)
  })

  it('大小写不敏感', async () => {
    const w = mountPanel()
    await search(w, 'TEXT')
    expect(items(w).length).toBeGreaterThan(0)
  })

  it('**搜索词只有空格 → 视为没搜（不该把面板清空）**', async () => {
    const w = mountPanel()
    const total = items(w).length
    await search(w, '   ')
    expect(items(w).length).toBe(total)
  })

  it('无匹配 → 显示空态提示、且没有字段项', async () => {
    const w = mountPanel()
    await search(w, 'zzz-不存在的字段')
    expect(items(w).length).toBe(0)
    expect(w.find('.ldp-search-empty').exists()).toBe(true)
  })

  it('清空搜索 → 全部字段回来、空态消失', async () => {
    const w = mountPanel()
    const total = items(w).length
    await search(w, 'zzz')
    expect(items(w).length).toBe(0)
    await search(w, '')
    expect(items(w).length).toBe(total)
    expect(w.find('.ldp-search-empty').exists()).toBe(false)
  })

  it('清除按钮：仅在有搜索词时出现，点击清空输入', async () => {
    const w = mountPanel()
    expect(w.find('.ldp-search-clear').exists(), '没搜索时不该有清除按钮').toBe(false)
    await search(w, 'a')
    const btn = w.find('.ldp-search-clear')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect((searchInput(w).element as HTMLInputElement).value).toBe('')
  })
})

describe('DesignerPanel · 添加与拖拽', () => {
  it('点字段项 → emit add 且带的是**类型**不是标签', async () => {
    const w = mountPanel()
    const meta = getFieldTypes()[0]
    const idx = getFieldTypes().findIndex((m) => m.type === meta.type)
    await items(w)[idx].trigger('click')
    const ev = w.emitted('add')
    expect(ev).toHaveLength(1)
    expect(ev?.[0]).toEqual([meta.type])
  })

  it('拖拽 → dataTransfer 带 application/x-field-type 与 text/plain，effectAllowed=copy', async () => {
    const w = mountPanel()
    const meta = getFieldTypes()[0]
    const setData = vi.fn()
    const dt = { setData, effectAllowed: '' } as unknown as DataTransfer
    await items(w)[0].trigger('dragstart', { dataTransfer: dt })
    expect(setData).toHaveBeenCalledWith('application/x-field-type', meta.type)
    expect(setData).toHaveBeenCalledWith('text/plain', meta.type)
    expect(dt.effectAllowed).toBe('copy')
  })
})

/** 占位类型出口 */
type PanelMeta = ReturnType<typeof getFieldTypes>[number]
it('（占位）group 已是 string（#502：不再谎称中文联合类型）', () => {
  const m: PanelMeta = getFieldTypes()[0]
  expect(typeof m.group).toBe('string')
})
