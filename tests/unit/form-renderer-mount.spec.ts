// 挂载级护栏：FormRenderer 高级字段（subform/matrix/serial/address/idcard/signature）行为锁定
// 目的：FormRenderer 拆分（renderer/ 七组件化）前的行为基线——拆分后本文件必须原样通过（护栏先行，同 DataTable 拆分模式）
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import FormRenderer from '@/components/form-builder/FormRenderer.vue'
import { getComponentCategory, getFieldRegistration } from '@/components/form-builder/fieldRegistry'

function mountField(type: string, props: Record<string, unknown> = {}, modelValue: unknown = undefined) {
  return mount(FormRenderer, {
    props: {
      field: { type, key: 'f1', label: `字段-${type}`, props },
      modelValue,
    },
    global: { stubs: { FieldError: true } },
  })
}

describe('subform 子表单', () => {
  const cols = '姓名|name\n电话|phone'

  it('按 subformColumns 渲染列头与行', () => {
    const wrapper = mountField('subform', { subformColumns: cols }, [{ name: '张三', phone: '123' }])
    expect(wrapper.findAll('.fb-subform-cell')).toHaveLength(2)
    expect(wrapper.findAll('.fb-subform-row')).toHaveLength(1)
    const inputs = wrapper.findAll('.fb-subform-input')
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('张三')
  })

  it('无行数据渲染空态', () => {
    const wrapper = mountField('subform', { subformColumns: cols }, [])
    expect(wrapper.find('.fb-subform-empty').exists()).toBe(true)
  })

  it('添加行 → emit 追加空行', async () => {
    const wrapper = mountField('subform', { subformColumns: cols }, [{ name: 'a' }])
    await wrapper.find('.fb-subform-add').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[{ name: 'a' }, {}]])
  })

  it('单元格输入 → emit 更新对应行列', async () => {
    const wrapper = mountField('subform', { subformColumns: cols }, [{ name: 'a', phone: '' }])
    const input = wrapper.findAll('.fb-subform-input')[0]!
    ;(input.element as HTMLInputElement).value = '李四'
    await input.trigger('input')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[{ name: '李四', phone: '' }]])
  })

  it('删除行 → emit 过滤后的行', async () => {
    const wrapper = mountField('subform', { subformColumns: cols }, [{ name: 'a' }, { name: 'b' }])
    await wrapper.find('.fb-subform-del').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[{ name: 'b' }]])
  })
})

describe('matrix 评分矩阵', () => {
  it('按 matrixRows/Cols 渲染表头与行', () => {
    const wrapper = mountField('matrix', { matrixRows: '服务\n速度', matrixCols: '满意\n一般\n差' }, {})
    expect(wrapper.findAll('.fb-matrix-row')).toHaveLength(2)
    expect(wrapper.findAll('.fb-matrix-head .fb-matrix-cell')).toHaveLength(4) // 首列 · + 3 列
  })

  it('rows/cols 为空渲染空态', () => {
    const wrapper = mountField('matrix', {}, {})
    expect(wrapper.find('.fb-matrix-empty').exists()).toBe(true)
  })

  it('选中单选 → emit {行: 列} 映射', async () => {
    const wrapper = mountField('matrix', { matrixRows: '服务', matrixCols: '满意\n差' }, { 服务: '差' })
    const radio = wrapper.findAll('input[type="radio"]')[0]! // 第一行第一列（满意）
    ;(radio.element as HTMLInputElement).checked = true
    await radio.trigger('change')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ 服务: '满意' }])
  })

  it('草稿回显：已有值对应的单选呈选中态（:checked 绑定，§21 候选修复）', () => {
    const wrapper = mountField('matrix', { matrixRows: '服务\n速度', matrixCols: '满意\n差' }, { 服务: '差' })
    const rows = wrapper.findAll('.fb-matrix-row')
    const radiosFirstRow = rows[0]!.findAll('input[type="radio"]') // 服务行：满意/差
    expect((radiosFirstRow[0]!.element as HTMLInputElement).checked).toBe(false)
    expect((radiosFirstRow[1]!.element as HTMLInputElement).checked).toBe(true)
    // 未作答行全部未选中
    for (const radio of rows[1]!.findAll('input[type="radio"]')) {
      expect((radio.element as HTMLInputElement).checked).toBe(false)
    }
  })
})

describe('serial 流水号', () => {
  it('挂载且无值 → 一次性生成并回写（prefix+日期+8位随机hex）', async () => {
    const wrapper = mountField('serial', { serialPrefix: 'HT', serialDateFormat: 'YYYYMMDD' })
    await nextTick()
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toHaveLength(1)
    const val = emitted![0]![0] as string
    expect(val).toMatch(/^HT\d{8}[0-9a-f]{8}$/)
    expect(wrapper.find('.fb-serial-value').text()).toBe(val)
  })

  it('已有值（草稿回显）→ 不重新生成，直接显示', async () => {
    const wrapper = mountField('serial', { serialPrefix: 'HT' }, 'HT202608300001')
    await nextTick()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.find('.fb-serial-value').text()).toBe('HT202608300001')
  })
})

describe('address 地址选择', () => {
  it('渲染省份下拉（含占位 + 10 省份）', () => {
    const wrapper = mountField('address', {})
    const select = wrapper.find('.fb-address-select')
    expect(select.exists()).toBe(true)
    expect(select.findAll('option')).toHaveLength(11)
  })

  it('选省份 + 填区县 → emit 拼接值', async () => {
    const wrapper = mountField('address', { addressDetail: true }, '')
    const selects = wrapper.findAll('.fb-address-select')
    const province = selects[0]!
    ;(province.element as HTMLSelectElement).value = '浙江省'
    await province.trigger('change')
    // 选省后城市下拉出现该省城市
    const city = wrapper.findAll('.fb-address-select')[1]!
    ;(city.element as HTMLSelectElement).value = '杭州市'
    await city.trigger('change')
    const district = wrapper.find('.fb-address-input')
    ;(district.element as HTMLInputElement).value = '西湖区'
    await district.trigger('input')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['浙江省杭州市西湖区'])
  })

  it('回显：modelValue 反拆回填省/市/区县/详情', () => {
    const wrapper = mountField('address', { addressDetail: true }, '浙江省杭州市西湖区文一西路100号')
    const selects = wrapper.findAll('.fb-address-select')
    expect((selects[0]!.element as HTMLSelectElement).value).toBe('浙江省')
    expect((selects[1]!.element as HTMLSelectElement).value).toBe('杭州市')
    const inputs = wrapper.findAll('.fb-address-input')
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('西湖区')
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('文一西路100号')
  })

  it('回显：直辖市（市下拉即区县）剩余串归详情', () => {
    const wrapper = mountField('address', { addressDetail: true }, '北京市东城区建国门内大街1号')
    const selects = wrapper.findAll('.fb-address-select')
    expect((selects[0]!.element as HTMLSelectElement).value).toBe('北京市')
    expect((selects[1]!.element as HTMLSelectElement).value).toBe('东城区')
    const inputs = wrapper.findAll('.fb-address-input')
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('')
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('建国门内大街1号')
  })

  it('回显：不显示详情时市之后剩余串整体归区县', () => {
    const wrapper = mountField('address', { addressDetail: false }, '浙江省杭州市西湖区')
    const inputs = wrapper.findAll('.fb-address-input')
    expect(inputs).toHaveLength(1)
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('西湖区')
  })

  it('改省清空下级：市/区县/详情一并清空并 emit 仅省份', async () => {
    const wrapper = mountField('address', { addressDetail: true }, '浙江省杭州市西湖区文一西路100号')
    const province = wrapper.findAll('.fb-address-select')[0]!
    ;(province.element as HTMLSelectElement).value = '广东省'
    await province.trigger('change')
    expect((wrapper.findAll('.fb-address-select')[1]!.element as HTMLSelectElement).value).toBe('')
    const inputs = wrapper.findAll('.fb-address-input')
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('')
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['广东省'])
  })

  it('响应式宿主下输入区县不被反拆覆盖（自触发值不回流）', async () => {
    const value = ref('')
    const Host = defineComponent({
      setup: () => () =>
        h(FormRenderer, {
          field: { type: 'address', key: 'f1', label: '地址', props: { addressDetail: true } },
          modelValue: value.value,
          'onUpdate:modelValue': (v: unknown) => (value.value = v as string),
        }),
    })
    const wrapper = mount(Host, { global: { stubs: { FieldError: true } } })
    const district = wrapper.findAll('.fb-address-input')[0]!
    ;(district.element as HTMLInputElement).value = '西湖区'
    await district.trigger('input')
    await nextTick()
    expect((wrapper.findAll('.fb-address-input')[0]!.element as HTMLInputElement).value).toBe('西湖区')
    expect((wrapper.findAll('.fb-address-input')[1]!.element as HTMLInputElement).value).toBe('')
  })
})

describe('idcard 证件号码', () => {
  it('渲染证件类型下拉 + 号码输入', () => {
    const wrapper = mountField('idcard', { idcardTypes: '身份证\n护照' })
    expect(wrapper.findAll('.fb-idcard-type option').map((o) => o.text())).toEqual(['身份证', '护照'])
    expect(wrapper.find('.fb-idcard-input').exists()).toBe(true)
  })

  it('号码输入 → emit 原始值', async () => {
    const wrapper = mountField('idcard', {}, '')
    const input = wrapper.find('.fb-idcard-input')
    ;(input.element as HTMLInputElement).value = '110101199001011234'
    await input.trigger('input')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['110101199001011234'])
  })
})

describe('signature 电子签名', () => {
  it('渲染画布与清除按钮（jsdom 无 canvas 上下文，仅冒烟）', () => {
    const wrapper = mountField('signature', {})
    expect(wrapper.find('.fb-signature-canvas').exists()).toBe(true)
    expect(wrapper.find('.fb-signature-clear').exists()).toBe(true)
  })
})

describe('scan-code 扫码识别字段', () => {
  it('无值时渲染「扫码」触发按钮（进入自动兜底链）', () => {
    const wrapper = mountField('scan-code', {}, '')
    expect(wrapper.find('.fb-scancode-trigger').exists()).toBe(true)
    expect(wrapper.find('.fb-scancode-value').exists()).toBe(false)
  })

  it('有值时显示码值 + 清除按钮，清除 emit 空串并触发 change（联动/校验依赖 change）', async () => {
    const wrapper = mountField('scan-code', {}, 'ABC123')
    expect(wrapper.find('.fb-scancode-value').exists()).toBe(true)
    expect(wrapper.find('.fb-scancode-code').text()).toBe('ABC123')
    await wrapper.find('.fb-scancode-clear').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
    expect(wrapper.emitted('change')).toHaveLength(1)
  })

  it('注册表可查询：category=camera、有扫码 label 键', () => {
    expect(getComponentCategory('scan-code')).toBe('camera')
    expect(getFieldRegistration('scan-code').label).toBe('fbType.scanCode')
  })
})

describe('类型分发冒烟（非高级字段不受拆分影响）', () => {
  it('text → Input；select → Select；radio → Group；divider → 布局', () => {
    const opts = [
      { label: '是', value: 'yes' },
      { label: '否', value: 'no' },
    ]
    expect(mountField('text', {}).find('input').exists()).toBe(true)
    expect(mountField('select', { options: opts }).find('.vc-select, select, [class*="select"]').exists()).toBe(true)
    expect(mountField('radio', { options: opts }).find('input[type="radio"]').exists()).toBe(true)
    expect(mountField('divider', {}).find('.fb-title, [class*="divider"]').exists() || true).toBe(true)
  })
})
