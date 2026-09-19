// 修复锁定：ProgressBar 交互滑块 thumb 按下不再重复 emit
// 背景：thumb 与 track 均绑定 @pointerdown，thumb 事件冒泡到 track 导致一次按下 emit 两次
// 修复：thumb 的 @pointerdown 加 .stop
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'
import ProgressBar from '@/components/data/ProgressBar.vue'

beforeAll(() => {
  // happy-dom 无 setPointerCapture，打桩避免 onPointerDown 抛错
  if (typeof HTMLElement.prototype.setPointerCapture !== 'function') {
    HTMLElement.prototype.setPointerCapture = vi.fn()
  }
  if (typeof HTMLElement.prototype.releasePointerCapture !== 'function') {
    HTMLElement.prototype.releasePointerCapture = vi.fn()
  }
})

describe('ProgressBar · 交互滑块', () => {
  it('thumb 按下：update:modelValue 只 emit 一次（不冒泡到 track 重复触发）', async () => {
    const w = mount(ProgressBar, {
      props: { interactive: true, modelValue: 50, min: 0, max: 100 },
      attachTo: document.body,
    })
    await w.find('.slider-thumb').trigger('pointerdown', { clientX: 60 })

    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted!.length).toBe(1)
  })

  it('track 按下：update:modelValue 正常 emit 一次', async () => {
    const w = mount(ProgressBar, {
      props: { interactive: true, modelValue: 20, min: 0, max: 100 },
      attachTo: document.body,
    })
    await w.find('.slider-track').trigger('pointerdown', { clientX: 80 })

    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted!.length).toBe(1)
  })

  it('disabled 时按下不 emit', async () => {
    const w = mount(ProgressBar, {
      props: { interactive: true, modelValue: 20, min: 0, max: 100, disabled: true },
    })
    await w.find('.slider-thumb').trigger('pointerdown', { clientX: 60 })
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })
})
