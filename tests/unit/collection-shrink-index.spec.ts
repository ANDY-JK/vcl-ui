/**
 * 第 163 轮 · 同类缺陷全仓收口（一）：集合变短后，受控索引不重夹
 *
 * 前两轮修的是「页码越界」（nav/Pagination、DataTable 页脚）。这轮把同一形状一次扫完：
 * 任何"当前项索引"状态，在**容器变短**后都必须重夹，否则索引指向不存在的项。
 *
 * 两个真实场景：
 *   A. `ImagePreview`：用户正看第 3 张，宿主把 `src` 换成只剩 1 张 →
 *      `currentUrl` 变空 → `v-if="currentUrl"` 把整个预览层卸载，看起来"自己关了"，
 *      但 `close` 从未 emit —— 宿主仍以为它是打开态，再点也打不开（状态卡死）。
 *   B. `useFormSteps`：用户在第 3 步，设计器把步骤删到只剩 1 步 →
 *      `stepFields` 取不到 step 返回 `[]` → 表单**一个字段都不显示**，而步骤头还写着"第 3 步"。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, computed, ref } from 'vue'
import ImagePreview from '@/components/data/ImagePreview.vue'
import { useFormSteps } from '@/components/form-builder/useFormSteps'
import type { FormSchema, FormField } from '@/components/form-builder/types'

const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://cdn.test/p${i}.png`)

describe('ImagePreview · 图片变少后索引必须重夹', () => {
  it('正看第 3 张时宿主换成只剩 1 张 → 预览层不能消失（必须显示剩下那张）', async () => {
    const w = mount(ImagePreview, {
      props: { src: urls(3), initialIndex: 2, visible: true },
    })
    await nextTick()
    expect(w.find('.ip-backdrop').exists(), '前置：3 张图应正常渲染').toBe(true)

    await w.setProps({ src: urls(1) })
    await nextTick()
    expect(w.find('.ip-backdrop').exists(), '图变少后预览层被整块卸载了（用户看到"自己关了"）').toBe(true)
    const img = w.find('.ip-backdrop img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe(urls(1)[0])
    w.unmount()
  })

  it('变少后 emit change，把新的当前索引告诉宿主（宿主可能用它渲染标题/URL）', async () => {
    const w = mount(ImagePreview, { props: { src: urls(5), initialIndex: 4, visible: true } })
    await nextTick()
    await w.setProps({ src: urls(2) })
    await nextTick()
    const changes = (w.emitted('change') as [number][] | undefined) ?? []
    expect(changes.at(-1)?.[0], '变少后当前图变了，必须回传新索引').toBe(1)
    w.unmount()
  })

  it('变少后索引落在最后一张（而不是继续指向前第 3 张）', async () => {
    const w = mount(ImagePreview, { props: { src: urls(5), initialIndex: 4, visible: true } })
    await nextTick()
    await w.setProps({ src: urls(2) })
    await nextTick()
    const counter = w.find('.ip-counter, .ip-counter-header')
    expect(counter.text(), '计数器必须回到 2 / 2').toContain('2 / 2')
    w.unmount()
  })
})

describe('useFormSteps · 步骤变少后 currentStep 必须重夹', () => {
  const field = (key: string): FormField => ({ key, type: 'input', label: key }) as FormField

  /** 同一实例 + **可变** schema：模拟设计器删步骤（totalSteps 3 → 1） */
  function makeSteps(initial: string[][]) {
    const stepsRef = ref<string[][]>(initial)
    const normalized = computed<FormSchema>(
      () =>
        ({
          layout: 'steps',
          fields: stepsRef.value.flat().map(field),
          steps: stepsRef.value.map((keys, i) => ({ title: `S${i + 1}`, fields: keys })),
        }) as unknown as FormSchema,
    )
    const effectiveFields = computed<FormField[]>(() => stepsRef.value.flat().map(field))
    const formData = ref({}) as never
    const api = useFormSteps(normalized, effectiveFields, formData, () => true, () => true)
    return { api, stepsRef }
  }

  it('在第 3 步时步骤删到只剩 1 步 → 回落到合法步（不能一个字段都不显示）', async () => {
    const { api, stepsRef } = makeSteps([['a'], ['b'], ['c']])
    api.currentStep.value = 2
    expect(api.stepFields.value.map((f) => f.key)).toEqual(['c'])

    stepsRef.value = [['a']] // 设计器删掉两步
    await nextTick()

    expect(api.currentStep.value, '步骤数变了必须回落').toBe(0)
    expect(api.stepFields.value.map((f) => f.key), '表单不能变成零字段').toEqual(['a'])
    expect(api.isLastStep.value, '只剩一步时它就是最后一步').toBe(true)
  })

  it('外部直接写越界值 → 读出来仍是合法步骤（读写双向夹紧）', async () => {
    const { api } = makeSteps([['a'], ['b']])
    api.currentStep.value = 99
    await nextTick()
    expect(api.currentStep.value).toBe(1)
    expect(api.stepFields.value.map((f) => f.key)).toEqual(['b'])

    api.currentStep.value = -5
    await nextTick()
    expect(api.currentStep.value).toBe(0)
    expect(api.stepFields.value.map((f) => f.key)).toEqual(['a'])
  })

  it('**写入时就夹紧**：steps 之后再增加，也不会跳到别处（存的是夹紧后的值）', async () => {
    const { api, stepsRef } = makeSteps([['a'], ['b']])
    api.currentStep.value = 99 // 只有 2 步 → 应存成 1，而不是存 99
    await nextTick()
    expect(api.currentStep.value).toBe(1)

    stepsRef.value = [['a'], ['b'], ['c'], ['d']] // 步骤增加到 4
    await nextTick()
    expect(api.currentStep.value, '若写入没夹紧，这里会跟着 99 跳到最后一页').toBe(1)
  })

  it('正常的 nextStep / prevStep 仍然逐级推进（夹紧不破坏正常路径）', async () => {
    const { api } = makeSteps([['a'], ['b'], ['c']])
    api.nextStep()
    expect(api.currentStep.value).toBe(1)
    api.nextStep()
    expect(api.currentStep.value).toBe(2)
    api.nextStep() // 已在最后一步：不应越界
    expect(api.currentStep.value).toBe(2)
    api.prevStep()
    expect(api.currentStep.value).toBe(1)
  })
})
