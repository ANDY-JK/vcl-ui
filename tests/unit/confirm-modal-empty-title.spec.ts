/**
 * ConfirmModal · 空串标题与按钮文案的回退（#500）
 *
 * prop 文档写的是「**空串**用内置 i18n，语言切换实时跟随」，但实现是：
 *
 * ```ts
 * const effTitle = computed(() => props.title ?? t('confirmModal.title'))   // ?? 只兜 null/undefined
 * ```
 *
 * 于是 `title=""`（宿主把它绑到一个可能为空的可选字段最常见）会**原样传成空标题**：
 * 弹窗头部是一行空白 + 无障碍名退到 `common.dialog`，用户看到的是"没有标题的确认框"。
 * 同族的 `confirmText` / `cancelText` 在 §9.71（#487）已经用 `.trim() || t(...)` 修过，
 * 只有 `title` 漏在同一轮外面 —— 「同一个组件里两个字段用了两套回退判据」。
 *
 * 本文件同时钉住其余门面接线（loading 的关窗/遮罩限制、confirm/cancel 的 emit 与关窗、
 * variant 透传、closable 开关），这块此前只有 i18n 切换的 2 条用例。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import { setLocale } from '@/components/_internal/i18n'

const mounted: VueWrapper[] = []
function mountConfirm(props: Record<string, unknown> = {}): VueWrapper {
  const w = mount(ConfirmModal, {
    props: { visible: true, message: '删除该条记录？', ...props },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
  mounted.push(w)
  return w
}

const title = (w: VueWrapper) => w.find('.modal-title').text()
const confirmBtn = (w: VueWrapper) => w.find('.confirm-btn:not(.cancel)')
const cancelBtn = (w: VueWrapper) => w.find('.confirm-btn.cancel')

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  setLocale('zh-CN')
})

describe('ConfirmModal · 标题回退（#500）', () => {
  it('不传 title → 内置 i18n 标题', () => {
    setLocale('zh-CN')
    expect(title(mountConfirm())).toBe('确认操作')
  })

  it('**传空串 title → 仍用内置 i18n（文档写的就是这个契约）**', () => {
    setLocale('zh-CN')
    const w = mountConfirm({ title: '' })
    expect(title(w), '空标题会让弹窗头部一片空白').toBe('确认操作')
  })

  it('**title 只有空白 → 也走回退（不能把空格当标题渲染成空白行）**', () => {
    const w = mountConfirm({ title: '   ' })
    expect(title(w).trim()).toBe('确认操作')
  })

  it('显式 title → 原样使用', () => {
    const w = mountConfirm({ title: '删除确认' })
    expect(title(w)).toBe('删除确认')
  })

  it('空串 title 下切语言 → 标题跟着变（回退值必须是响应式的）', async () => {
    setLocale('zh-CN')
    const w = mountConfirm({ title: '' })
    expect(title(w)).toBe('确认操作')
    setLocale('en-US')
    await nextTick()
    expect(title(w)).toBe('Confirm action')
  })

  it('按钮文案：空串同样回退（与 #487 同口径，回归护栏）', () => {
    setLocale('zh-CN')
    const w = mountConfirm({ confirmText: '', cancelText: '' })
    expect(confirmBtn(w).text()).toContain('确定')
    expect(cancelBtn(w).text()).toBe('取消')
  })
})

describe('ConfirmModal · 门面接线', () => {
  it('确认按钮 → emit confirm + 关窗', async () => {
    const w = mountConfirm()
    await confirmBtn(w).trigger('click')
    expect(w.emitted('confirm')).toHaveLength(1)
    expect(w.emitted('update:visible')?.at(-1)).toEqual([false])
  })

  it('取消按钮 → emit cancel + 关窗', async () => {
    const w = mountConfirm()
    await cancelBtn(w).trigger('click')
    expect(w.emitted('cancel')).toHaveLength(1)
    expect(w.emitted('update:visible')?.at(-1)).toEqual([false])
  })

  it('**loading 态：确认按钮点了不 emit**（防重复提交）', async () => {
    const w = mountConfirm({ loading: true })
    await confirmBtn(w).trigger('click')
    expect(w.emitted('confirm')).toBeUndefined()
    expect(w.emitted('update:visible')).toBeUndefined()
  })

  it('**loading 态：不显示右上角关闭按钮**', () => {
    expect(mountConfirm({ loading: true }).find('.modal-close').exists()).toBe(false)
    mounted.splice(0).forEach((w) => w.unmount())
    expect(mountConfirm({ loading: false }).find('.modal-close').exists()).toBe(true)
  })

  it('closable=false → 不显示关闭按钮（非 loading 也一样）', () => {
    const w = mountConfirm({ closable: false })
    expect(w.find('.modal-close').exists()).toBe(false)
  })

  it('点关闭按钮 → 只关窗，不 emit confirm/cancel', async () => {
    const w = mountConfirm()
    await w.find('.modal-close').trigger('click')
    expect(w.emitted('update:visible')?.at(-1)).toEqual([false])
    expect(w.emitted('confirm')).toBeUndefined()
    expect(w.emitted('cancel')).toBeUndefined()
  })

  it('variant 透传到按钮语义色', () => {
    expect(mountConfirm({ variant: 'warning' }).find('.confirm-btn.btn-warning').exists()).toBe(true)
    mounted.splice(0).forEach((w) => w.unmount())
    expect(mountConfirm({ variant: 'primary' }).find('.confirm-btn.btn-primary').exists()).toBe(true)
  })

  it('visible=false → 不渲染内容（Teleport 已 stub，看 overlay 是否存在）', () => {
    const w = mountConfirm({ visible: false })
    expect(w.find('.modal-overlay').exists()).toBe(false)
  })
})
