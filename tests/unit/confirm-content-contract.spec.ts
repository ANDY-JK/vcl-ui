/**
 * ConfirmContent · 文案与变体的**契约**（#487）
 *
 * 两处"文档承诺 vs 实现"：
 *
 *  ① prop 文档写「确认按钮文字（**空串**用内置 i18n）」/「取消按钮文字（**空串**用内置 i18n）」，
 *    实现是 `props.confirmText ?? t(...)` —— `??` 只兜 `null/undefined`。宿主把配置项留空
 *    （`confirmText=""`、或 v-bind 一个空表单值）就渲染出**空白按钮**：用户看不出这一下要干什么，
 *    读屏念出来也是个无名按钮。
 *
 *  ② `variantMeta = map[props.variant]`：宿主传非法值（`'info'`/`'Info'` 拼错、JS 侧动态值）
 *    得到 `undefined`，模板再取 `.bg` → **整块内容区抛错**，弹窗直接白掉。变体是"外观档位"，
 *    没有理由因为档位不认识就让确认框不可用。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmContent from '@/components/layout/ConfirmContent.vue'

const mountC = (props: Record<string, unknown> = {}) =>
  mount(ConfirmContent, { props: { message: '删除这条记录？', ...props } as never })

const cancelBtn = (w: ReturnType<typeof mountC>) => w.find('.confirm-btn.cancel')
const okBtn = (w: ReturnType<typeof mountC>) => w.find('.confirm-btn.btn-danger, .confirm-btn.btn-warning, .confirm-btn.btn-primary')

describe('ConfirmContent · 空串/空白文案回退 i18n（#487）', () => {
  it('confirmText="" → 回退内置文案（旧实现渲染空白按钮）', () => {
    const w = mountC({ confirmText: '' })
    expect(okBtn(w).text().trim()).toBe('确定')
    w.unmount()
  })

  it('cancelText="" → 回退内置文案', () => {
    const w = mountC({ cancelText: '' })
    expect(cancelBtn(w).text().trim()).toBe('取消')
    w.unmount()
  })

  it('纯空白也算"没给"（`"   "` 与空串同样不可见，不该发出去）', () => {
    const w = mountC({ confirmText: '   ', cancelText: '\t ' })
    expect(okBtn(w).text().trim()).toBe('确定')
    expect(cancelBtn(w).text().trim()).toBe('取消')
    w.unmount()
  })

  it('显式文案保留、不被回退覆盖', () => {
    const w = mountC({ confirmText: ' 继续 ', cancelText: ' 算了' })
    expect(okBtn(w).text().trim()).toBe('继续')
    expect(cancelBtn(w).text().trim()).toBe('算了')
    w.unmount()
  })
})

describe('ConfirmContent · 变体档位', () => {
  it('三种合法 variant 各给自己的按钮类', () => {
    for (const [v, cls] of [
      ['danger', 'btn-danger'],
      ['warning', 'btn-warning'],
      ['primary', 'btn-primary'],
    ] as const) {
      const w = mountC({ variant: v })
      expect(w.find(`.confirm-btn.${cls}`).exists(), `${v} → ${cls}`).toBe(true)
      w.unmount()
    }
  })

  it('未知 variant → 回退 danger 而不是崩掉（旧实现整块抛错）', () => {
    const w = mountC({ variant: 'info' })
    expect(w.find('.confirm-btn.btn-danger').exists()).toBe(true)
    expect(w.find('.confirm-body').attributes('style')).toContain('--vcl-color-danger-bg')
    w.unmount()
  })

  it('不传 variant：默认 danger', () => {
    const w = mountC()
    expect(w.find('.confirm-btn.btn-danger').exists()).toBe(true)
    w.unmount()
  })
})

describe('ConfirmContent · loading 语义', () => {
  it('loading：确认按钮 disabled、点它不 emit confirm', async () => {
    const w = mountC({ loading: true })
    const ok = w.find('.confirm-btn.btn-danger')
    expect(ok.attributes('disabled')).toBeDefined()
    await ok.trigger('click')
    expect(w.emitted('confirm')).toBeUndefined()
    w.unmount()
  })

  it('loading：取消也不 emit（异步确认中不许半途撤销）', async () => {
    const w = mountC({ loading: true })
    await cancelBtn(w).trigger('click')
    expect(w.emitted('cancel')).toBeUndefined()
    w.unmount()
  })

  it('非 loading：两个按钮各自 emit 一次', async () => {
    const w = mountC()
    await okBtn(w).trigger('click')
    await cancelBtn(w).trigger('click')
    expect(w.emitted('confirm')).toHaveLength(1)
    expect(w.emitted('cancel')).toHaveLength(1)
    w.unmount()
  })
})