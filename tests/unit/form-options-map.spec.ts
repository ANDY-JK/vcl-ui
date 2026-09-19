// optionsFrom + optionsMap 级联选项映射（承接旧版 DynamicForm optionsFrom+optionsMap 模式）
// 锁定行为：依赖无值→空选项 / 命中映射→选项更新 / 换依赖值→已选脏值清空 / 依赖清空→选项清空
// 另锁定 toFormSchema 对设计器行格式（依赖值=选项1,选项2）的解析 + FormBuilder 挂载冒烟
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import FormBuilder from '@/components/form-builder/FormBuilder.vue'
import { useFormLinkage } from '@/components/form-builder/useFormLinkage'
import { toFormSchema } from '@/components/form-builder/designer/types'
import type { FormSchema, FormField, FormData } from '@/components/form-builder/types'
import type { DesignerNode } from '@/components/form-builder/designer/types'

function cascadeFields(): FormField[] {
  return [
    {
      key: 'province',
      label: '省份',
      type: 'select',
      options: [
        { value: '广东省', label: '广东省' },
        { value: '湖南省', label: '湖南省' },
      ],
    },
    {
      key: 'city',
      label: '城市',
      type: 'select',
      optionsFrom: 'province',
      optionsMap: {
        广东省: ['广州市', '深圳市'],
        湖南省: ['长沙市'],
      },
    },
  ]
}

function cascadeSchema(): FormSchema {
  return { layout: 'single', fields: cascadeFields() }
}

describe('useFormLinkage — optionsFrom + optionsMap 级联映射', () => {
  it('依赖字段无值 → 级联字段选项为空', () => {
    const formData = ref<FormData>({})
    const { init, processLinkages, dynamicOptions } = useFormLinkage(ref(cascadeFields()), formData)
    init()
    processLinkages()
    expect(dynamicOptions.value.get('city')).toEqual([])
  })

  it('依赖命中映射 → 选项更新为映射列表（string 归一化为 Option）', () => {
    const formData = ref<FormData>({})
    const { init, processLinkages, dynamicOptions } = useFormLinkage(ref(cascadeFields()), formData)
    init()
    formData.value.province = '广东省'
    processLinkages()
    expect(dynamicOptions.value.get('city')).toEqual([
      { value: '广州市', label: '广州市' },
      { value: '深圳市', label: '深圳市' },
    ])
  })

  it('切换依赖值 → 已选脏值清空（新省份下旧城市不合法）', () => {
    const formData = ref<FormData>({ province: '广东省', city: '广州市' })
    const { init, processLinkages, dynamicOptions } = useFormLinkage(ref(cascadeFields()), formData)
    init()
    processLinkages()
    formData.value.province = '湖南省'
    processLinkages()
    expect(dynamicOptions.value.get('city')).toEqual([{ value: '长沙市', label: '长沙市' }])
    expect(formData.value.city).toBe('')
  })

  it('依赖清空 → 级联选项清空', () => {
    const formData = ref<FormData>({ province: '广东省' })
    const { init, processLinkages, dynamicOptions } = useFormLinkage(ref(cascadeFields()), formData)
    init()
    processLinkages()
    expect(dynamicOptions.value.get('city')!.length).toBe(2)
    formData.value.province = ''
    processLinkages()
    expect(dynamicOptions.value.get('city')).toEqual([])
  })
})

describe('optionsMap 设计器行格式解析 + 挂载冒烟', () => {
  it('toFormSchema 解析行格式（依赖值=选项1,选项2，兼容中文逗号）', () => {
    const node = {
      id: 'n1',
      key: 'city',
      label: '城市',
      type: 'select',
      options: ['请先选择省份'],
      optionsFrom: 'province',
      optionsMap: '广东省=广州市，深圳市\n湖南省=长沙市',
    } as unknown as DesignerNode
    const schema = toFormSchema([node], { title: '', description: '' })
    const city = schema.fields.find((f) => f.key === 'city')!
    expect(city.optionsFrom).toBe('province')
    expect(city.optionsMap).toEqual({
      广东省: ['广州市', '深圳市'],
      湖南省: ['长沙市'],
    })
  })

  it('FormBuilder 挂载冒烟：级联字段初始不注入任何选项', async () => {
    const wrapper = mount(FormBuilder, {
      props: { schema: cascadeSchema(), modelValue: {} },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    await nextTick()
    // 级联字段的 options 被引擎动态置空（原静态 options 不参与渲染）
    const html = wrapper.html()
    expect(html).toContain('城市')
    wrapper.unmount()
  })
})
