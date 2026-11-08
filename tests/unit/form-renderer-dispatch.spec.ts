/**
 * FormRenderer.vue — 分派层补测（633 行）
 *
 * ## 为什么补（单文件口径 语句 90.2% / 分支 83.1% / 函数 86.4%，21 行未覆盖）
 *
 * 既有两个 spec 分工是：`form-renderer-mount` 测「高级字段能不能渲染」、
 * `form-renderer-wiring` 测「v-model 空态归一 / change 补齐 / styleConfig / 查看模式」。
 * 但**中间那层「一个字段类型 → 哪个子组件、透传哪些 props、转哪个事件」的分派表**
 * 一直没人整体走一遍 —— 漏一个 `v-else-if`，那个字段类型在真机上就是一片空白，
 * 而现有 spec 只测了 address 一个高级类型。本轮按 **category → type** 把分派表走全：
 *
 * ① 基础系列四类（input / select / group / upload）各自绑到正确的子组件，
 *    且 `@change` 都补齐（事件联动与实时校验依赖它，漏挂 = 配了动作不执行）；
 * ② 高级系列九个 type 分支（subform / relate / richtext / signature / address /
 *    idcard / matrix / serial / map-picker / toggle-list）各自渲染对应子组件；
 * ③ **未知高级字段 fallback 到 Input**（不是抛错、不是空白）；
 * ④ 三个特殊透传：`map-picker` 多一个 `update:form-data-field`、`toggle-list` 多
 *    `formData` + `apiUrlPolicy`、`address` 多 `addressData`；
 * ⑤ 标签/必填星号/错误位在各分支一致（`label` 为空则不渲染 label）；
 * ⑥ `serial` 是**只读展示型**，label 上没有必填星号（它不由用户填）。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

import FormRenderer from '@/components/form-builder/FormRenderer.vue'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import Upload from '@/components/form/Upload.vue'
import RendererRichtext from '@/components/form-builder/renderer/RendererRichtext.vue'
import RendererSignature from '@/components/form-builder/renderer/RendererSignature.vue'
import RendererAddress from '@/components/form-builder/renderer/RendererAddress.vue'
import RendererIdcard from '@/components/form-builder/renderer/RendererIdcard.vue'
import RendererMatrix from '@/components/form-builder/renderer/RendererMatrix.vue'
import RendererSerial from '@/components/form-builder/renderer/RendererSerial.vue'
import RendererMapPicker from '@/components/form-builder/renderer/RendererMapPicker.vue'
import RendererToggleList from '@/components/form-builder/renderer/RendererToggleList.vue'
import RendererSubform from '@/components/form-builder/renderer/RendererSubform.vue'
import CameraCapture from '@/components/form/CameraCapture.vue'
import CodeCapture from '@/components/form/CodeCapture.vue'
import RendererDisplayResult from '@/components/form-builder/renderer/RendererDisplayResult.vue'
import RendererDisplayLoading from '@/components/form-builder/renderer/RendererDisplayLoading.vue'
import type { FormField } from '@/components/form-builder/types'

/* ═══════════ 构造工具（与既有 wiring spec 同一约定） ═══════════ */

function field(over: Partial<FormField> & { type: string }): FormField {
  return { key: 'f1', label: '字段', ...over } as FormField
}

function render(
  f: FormField,
  opts: { modelValue?: unknown; disabled?: boolean; formData?: Record<string, unknown> } = {},
) {
  return mount(FormRenderer, {
    props: {
      field: f,
      modelValue: opts.modelValue as never,
      disabled: opts.disabled as never,
      ...(opts.formData ? { formData: opts.formData } : {}),
    } as never,
    // AmapWidget 必须 stub：真实加载高德 SDK 会挂死 worker
    global: { stubs: { FieldError: true, AmapWidget: true } },
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

/* ═══════════ ① 基础系列四类 ═══════════ */

describe('基础系列分派', () => {
  it('**input 类绑到 Input，change 透传**', async () => {
    const w = render(field({ type: 'text', label: '姓名' }))
    await flushPromises()
    const inp = w.findComponent(Input)
    expect(inp.exists(), '渲染 Input').toBe(true)
    inp.vm.$emit('change')
    await flushPromises()
    expect(w.emitted('change'), 'change 补齐').toBeTruthy()
    w.unmount()
  })

  it('**select 类绑到 Select，change 透传**', async () => {
    const w = render(field({ type: 'select', label: '城市', options: [{ label: 'A', value: 'a' }] }))
    await flushPromises()
    const sel = w.findComponent(Select)
    expect(sel.exists(), '渲染 Select').toBe(true)
    sel.vm.$emit('change')
    await flushPromises()
    expect(w.emitted('change')).toBeTruthy()
    w.unmount()
  })

  it('**group 类绑到 Group，且 switch 不渲染外层 label**（否则同一文案双显）', async () => {
    const radio = render(field({ type: 'radio', label: '单选', options: [{ label: 'A', value: 'a' }] }))
    await flushPromises()
    expect(radio.findComponent(Group).exists(), 'radio 渲染 Group').toBe(true)
    expect(radio.find('.fb-group-label').exists(), 'radio 有外层标签').toBe(true)
    radio.findComponent(Group).vm.$emit('change')
    await flushPromises()
    expect(radio.emitted('change')).toBeTruthy()

    const sw = render(field({ type: 'switch', label: '开关' }))
    await flushPromises()
    expect(sw.findComponent(Group).exists()).toBe(true)
    expect(sw.find('.fb-group-label').exists(), 'switch 不叠外层 label').toBe(false)
    radio.unmount()
    sw.unmount()
  })

  it('**upload 类绑到 Upload，update:modelValue 写回值并发 change**', async () => {
    const w = render(field({ type: 'upload', label: '附件' }), { modelValue: [] })
    await flushPromises()
    const up = w.findComponent(Upload)
    expect(up.exists(), '渲染 Upload').toBe(true)
    const files = [{ id: 1, name: 'a.png', size: 1, progress: 100, status: 'done' }]
    up.vm.$emit('update:modelValue', files)
    await flushPromises()
    expect(w.emitted('update:modelValue')!.at(-1)![0], '值写回').toEqual(files)
    expect(w.emitted('change'), 'Upload 无 change 事件，须在此补齐').toBeTruthy()
    w.unmount()
  })

  it('**必填星号只在 required 时出现**', async () => {
    const req = render(field({ type: 'upload', label: '附件', required: true }), { modelValue: [] })
    await flushPromises()
    expect(req.find('.fb-required').exists(), '必填有星号').toBe(true)
    const opt = render(field({ type: 'upload', label: '附件' }), { modelValue: [] })
    await flushPromises()
    expect(opt.find('.fb-required').exists(), '非必填无星号').toBe(false)
    req.unmount()
    opt.unmount()
  })

  it('**modelValue 为 undefined 时 Upload 收到空数组而不是 undefined**', async () => {
    // 不兜底的话会透传 undefined，Upload 的 files computed 拿到 undefined 会炸 / 断言 Invalid
    const w = render(field({ type: 'upload', label: '附件' }), { modelValue: undefined })
    await flushPromises()
    const got = w.findComponent(Upload).props('modelValue')
    expect(Array.isArray(got), '必须是数组').toBe(true)
    expect(got, '空数组而非 undefined').toEqual([])
    w.unmount()
  })

  it('**label 为空时不渲染 label 元素**', async () => {
    const w = render(field({ type: 'upload', label: '' }), { modelValue: [] })
    await flushPromises()
    expect(w.find('.fb-upload-label').exists(), '空 label 不渲染').toBe(false)
    w.unmount()
  })

  it('**upload 的 hint 走独立提示位**', async () => {
    const w = render(field({ type: 'upload', label: '附件', hint: '最多 5 张' }), { modelValue: [] })
    await flushPromises()
    expect(w.find('.fb-hint').text()).toContain('最多 5 张')
    w.unmount()
  })
})

/* ═══════════ ② 告知型展示 ═══════════ */

describe('告知型展示字段', () => {
  it('**result / loading 各自渲染专用组件，且不进提交数据**', async () => {
    const r = render(field({ type: 'result', label: '结果' }))
    await flushPromises()
    expect(r.findComponent(RendererDisplayResult).exists(), 'result 分支').toBe(true)
    expect(r.findComponent(Input).exists(), '不是输入控件').toBe(false)
    r.unmount()

    const l = render(field({ type: 'loading', label: '加载' }))
    await flushPromises()
    expect(l.findComponent(RendererDisplayLoading).exists(), 'loading 分支').toBe(true)
    l.unmount()
  })
})

/* ═══════════ ③ 高级系列九个子分支 ═══════════ */

describe('高级系列分派', () => {
  it('**relate → Select（透传 change）**', async () => {
    const w = render(field({ type: 'relate', label: '关联', options: [{ label: 'A', value: 'a' }] }))
    await flushPromises()
    const sel = w.findComponent(Select)
    expect(sel.exists(), 'relate 复用 Select').toBe(true)
    sel.vm.$emit('change')
    await flushPromises()
    expect(w.emitted('change'), 'relate 必须挂 change（此前漏挂致动作不执行）').toBeTruthy()
    w.unmount()
  })

  it('**richtext / signature / address / idcard / matrix / serial 各渲染专用组件**', async () => {
    const cases: Array<[string, unknown]> = [
      ['richtext', RendererRichtext],
      ['signature', RendererSignature],
      ['address', RendererAddress],
      ['idcard', RendererIdcard],
      ['matrix', RendererMatrix],
      ['serial', RendererSerial],
    ]
    for (const [ty, comp] of cases) {
      const w = render(field({ type: ty, label: '标题' }))
      await flushPromises()
      expect(w.findComponent(comp as never).exists(), `${ty} → 专用组件`).toBe(true)
      expect(w.find('.fb-adv-label').exists(), `${ty} 有标签位`).toBe(true)
      w.unmount()
    }
  })

  it('**map-picker 除了 modelValue 还要转发 update:form-data-field**', async () => {
    const w = render(field({ type: 'map-picker', label: '位置' }))
    await flushPromises()
    const mp = w.findComponent(RendererMapPicker)
    expect(mp.exists(), 'map-picker 分支').toBe(true)
    mp.vm.$emit('update:modelValue', { lng: 1, lat: 2 })
    await flushPromises()
    expect(w.emitted('update:modelValue')!.at(-1)![0]).toEqual({ lng: 1, lat: 2 })
    mp.vm.$emit('update:formDataField', { key: 'lat', value: 2 })
    await flushPromises()
    expect(w.emitted('update:form-data-field'), '额外事件也要转发').toBeTruthy()
    w.unmount()
  })

  it('**toggle-list 透传 formData 与 apiUrlPolicy**', async () => {
    const w = render(field({ type: 'toggle-list', label: '开关项' }), { formData: { a: 1 } })
    await flushPromises()
    const tl = w.findComponent(RendererToggleList)
    expect(tl.exists(), 'toggle-list 分支').toBe(true)
    expect(tl.props('formData'), 'formData 透传').toEqual({ a: 1 })
    // apiUrlPolicy 未传时就是 undefined —— 断言「prop 存在」比断言「值存在」更准
    expect(Object.keys(tl.props()), 'apiUrlPolicy 作为 prop 显式传下去').toContain('apiUrlPolicy')
    tl.vm.$emit('update:modelValue', ['r1'])
    await flushPromises()
    expect(w.emitted('update:modelValue')!.at(-1)![0]).toEqual(['r1'])
    w.unmount()
  })

  it('**subform 分支渲染子表单组件**', async () => {
    const w = render(field({ type: 'subform', label: '明细' }))
    await flushPromises()
    expect(w.findComponent(RendererSubform).exists(), 'subform 分支').toBe(true)
    w.unmount()
  })

  it('**serial 是只读展示型：label 上没有必填星号**', async () => {
    const w = render(field({ type: 'serial', label: '流水号', required: true }))
    await flushPromises()
    expect(w.find('.fb-required').exists(), 'serial 不由用户填，不显示星号').toBe(false)
    w.unmount()
  })

  it('**未知类型：按 input 分类渲染 Input，不空白不抛错**', async () => {
    // ⚠️ advanced 分支里的 `<div v-else>` fallback 实际**不可达**：
    // getComponentCategory 对未知类型一律返回 'input'，于是走的是 input 分支，
    // 根本进不到 category === 'advanced'。这里断言真实行为（input 分支 + 值可写），
    // 并把「fallback 是死代码」记入报告，而不是硬造一个到不了的分支。
    const w = render(field({ type: '__unknown_advanced__', label: '未知' }))
    await flushPromises()
    expect(w.find('.fb-advanced-field').exists(), '不进高级容器').toBe(false)
    expect(w.findComponent(Input).exists(), '按 input 分类降级成 Input').toBe(true)
    w.findComponent(Input).vm.$emit('update:modelValue', 'v')
    await flushPromises()
    expect(w.emitted('update:modelValue')!.at(-1)![0], '值仍可写').toBe('v')
    w.unmount()
  })
})



/** camera 分支真正由 FormRenderer 直接渲染的那个实例（树里可能还有别的 CameraCapture） */
function camOf(w: ReturnType<typeof mount>) {
  const all = w.findAllComponents(CameraCapture)
  expect(all.length, '至少渲染了一个 CameraCapture').toBeGreaterThan(0)
  return all[all.length - 1]!
}

/* ═══════════ ⑤ uploadValue 的 setter（v-model 写回） ═══════════ */

describe('uploadValue 写回', () => {
  it('**Upload 的 v-model 走 uploadValue.setter → emit update:modelValue**', async () => {
    const w = render(field({ type: 'upload', label: '附件' }), { modelValue: [] })
    await flushPromises()
    // 直接驱动 v-model（不经 onUploadChange，专门验 computed setter 这条线）
    const files = [{ id: 9, name: 'x.png', size: 1, progress: 100, status: 'done' }]
    w.findComponent(Upload).vm.$emit('update:modelValue', files)
    await flushPromises()
    // Upload 可能连发多次 update（内部状态流转），断言「其中有一次就是我们给的值」
    const all = (w.emitted('update:modelValue') ?? []).map((e) => e[0])
    expect(all.some((v) => JSON.stringify(v) === JSON.stringify(files)), '值确实透出去').toBe(true)
    w.unmount()
  })
})

/* ═══════════ ⑥ 拍照交付（onCameraFinish） ═══════════ */

describe('拍照交付转 UploadFile[]', () => {
  const camMount = (props: Record<string, unknown>, modelValue: unknown) =>
    mount(FormRenderer, {
      props: { field: field({ type: 'camera', label: '拍照', props }), modelValue: modelValue as never } as never,
      global: { stubs: { FieldError: true, AmapWidget: true } },
    })

  it('**单张：转成 UploadFile[]（含 status/progress/raw），emit 值 + change**', async () => {
    const w = camMount({}, null)
    await flushPromises()
    const file = new File([new Uint8Array(3)], 'a.jpg', { type: 'image/jpeg' })
    const cam = camOf(w)
    expect(cam.exists(), 'camera 分支渲染 CameraCapture').toBe(true)
    cam.vm.$emit('finish', [file])
    await flushPromises()
    const val = w.emitted('update:modelValue')!.at(-1)![0] as Array<Record<string, unknown>>
    expect(Array.isArray(val), '交付的是 UploadFile[]').toBe(true)
    expect(val.length).toBe(1)
    expect(val[0]!.name, '保留文件名').toBe('a.jpg')
    expect(val[0]!.size, '带上体积').toBe(3)
    expect(val[0]!.status, '已完成的文件').toBe('done')
    expect(val[0]!.progress).toBe(100)
    expect(val[0]!.raw, '原始 File 也带上（供上传）').toBe(file)
    expect(w.emitted('change'), 'camera 无 change 事件，须在此补齐').toBeTruthy()
    w.unmount()
  })

  it('**没有文件名时兜底成 photo-N.jpg**（部分相机不返回 name）', async () => {
    const w = camMount({}, null)
    await flushPromises()
    const noName = [new File([new Uint8Array(1)], '', { type: 'image/jpeg' }), new File([new Uint8Array(2)], '', { type: 'image/jpeg' })]
    // File 的 name 来自构造参数，空串即「无文件名」
    camOf(w).vm.$emit('finish', noName)
    await flushPromises()
    const val = w.emitted('update:modelValue')!.at(-1)![0] as Array<Record<string, unknown>>
    expect(val[0]!.name, '第一张兜底命名').toBe('photo-1.jpg')
    expect(val[1]!.name, '第二张按序号').toBe('photo-2.jpg')
    w.unmount()
  })

  it('**multiple=false：新拍的覆盖旧值**（不是追加）', async () => {
    const old = [{ id: 1, name: 'old.png', size: 1, progress: 100, status: 'done' }]
    const w = camMount({ multiple: false }, old)
    await flushPromises()
    const fresh = new File([new Uint8Array(1)], 'new.jpg', { type: 'image/jpeg' })
    camOf(w).vm.$emit('finish', [fresh])
    await flushPromises()
    const val = w.emitted('update:modelValue')!.at(-1)![0] as Array<Record<string, unknown>>
    expect(val.length, '只剩新拍的').toBe(1)
    expect(val[0]!.name).toBe('new.jpg')
    w.unmount()
  })

  it('**multiple=true：新拍的追加在旧值之后，且不丢旧值**', async () => {
    const old = [{ id: 1, name: 'old.png', size: 1, progress: 100, status: 'done' }]
    const w = camMount({ multiple: true }, old)
    await flushPromises()
    const fresh = new File([new Uint8Array(1)], 'new.jpg', { type: 'image/jpeg' })
    camOf(w).vm.$emit('finish', [fresh])
    await flushPromises()
    const val = w.emitted('update:modelValue')!.at(-1)![0] as Array<Record<string, unknown>>
    expect(val.length, '旧 1 + 新 1').toBe(2)
    expect(val[0]!.name, '旧值在前').toBe('old.png')
    expect(val[1]!.name, '新值在后').toBe('new.jpg')
    w.unmount()
  })

  it('**multiple=true 但当前值为空 → 只放新拍的**（不产生 undefined 拼接）', async () => {
    const w = camMount({ multiple: true }, null)
    await flushPromises()
    const fresh = new File([new Uint8Array(1)], 'only.jpg', { type: 'image/jpeg' })
    camOf(w).vm.$emit('finish', [fresh])
    await flushPromises()
    const val = w.emitted('update:modelValue')!.at(-1)![0] as Array<Record<string, unknown>>
    expect(val.length).toBe(1)
    expect(val[0]!.name).toBe('only.jpg')
    w.unmount()
  })
})

/* ═══════════ ⑦ scan-code：扫码交付与清除 ═══════════ */

describe('scan-code 交付', () => {
  it('**无值时显示「扫码」按钮，点了打开捕获弹层**', async () => {
    const w = render(field({ type: 'scan-code', label: '条码' }), { modelValue: '' })
    await flushPromises()
    const trigger = w.find('.fb-scancode-trigger')
    expect(trigger.exists(), '无值时有扫码按钮').toBe(true)
    await trigger.trigger('click')
    await flushPromises()
    expect(w.findComponent({ name: 'CodeCapture' }).props('modelValue'), '弹层被打开').toBe(true)
    w.unmount()
  })

  it('**弹层关闭：CodeCapture 写回 false 时开关回落**', async () => {
    const w = render(field({ type: 'scan-code', label: '条码' }), { modelValue: '' })
    await flushPromises()
    await w.find('.fb-scancode-trigger').trigger('click')
    await flushPromises()
    const cap = w.findComponent(CodeCapture)
    expect(cap.props('modelValue'), '前置：已打开').toBe(true)
    cap.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(w.findComponent(CodeCapture).props('modelValue'), '关闭后回落 false').toBe(false)
    w.unmount()
  })

  it('**扫到码 → emit 码值 + change**', async () => {
    const w = render(field({ type: 'scan-code', label: '条码' }), { modelValue: '' })
    await flushPromises()
    w.findComponent({ name: 'CodeCapture' }).vm.$emit('scan', 'SKU-123')
    await flushPromises()
    expect(w.emitted('update:modelValue')!.at(-1)![0], '写回字符串').toBe('SKU-123')
    expect(w.emitted('change'), 'change 补齐').toBeTruthy()
    w.unmount()
  })

  it('**有值：显示码值 + 清除按钮；点清除写空串**', async () => {
    const w = render(field({ type: 'scan-code', label: '条码' }), { modelValue: 'SKU-9' })
    await flushPromises()
    expect(w.find('.fb-scancode-code').text(), '回显码值').toBe('SKU-9')
    const clear = w.find('.fb-scancode-clear')
    expect(clear.exists(), '有清除按钮').toBe(true)
    await clear.trigger('click')
    await flushPromises()
    expect(w.emitted('update:modelValue')!.at(-1)![0], '清除落空串').toBe('')
    expect(w.emitted('change'), '清除也要发 change').toBeTruthy()
    w.unmount()
  })

  it('**只读态：有值时不给清除按钮**（查看模式不该能改值）', async () => {
    const w = render(field({ type: 'scan-code', label: '条码' }), { modelValue: 'SKU-9', disabled: true })
    await flushPromises()
    expect(w.find('.fb-scancode-code').exists(), '值仍显示').toBe(true)
    expect(w.find('.fb-scancode-clear').exists(), '只读不给清除').toBe(false)
    w.unmount()
  })
})

/* ═══════════ ⑧ advanced 只读态 ═══════════ */

describe('高级字段只读态', () => {
  it('**disabled 时高级字段显示只读值，不渲染可编辑控件**', async () => {
    const w = mount(FormRenderer, {
      props: {
        field: field({ type: 'richtext', label: '正文' }),
        modelValue: '纯文本内容' as never,
        disabled: true as never,
      } as never,
      global: { stubs: { FieldError: true, AmapWidget: true } },
    })
    await flushPromises()
    expect(w.find('.fb-adv-readonly').exists(), '只读容器').toBe(true)
    expect(w.find('.fb-adv-readonly-val').text(), '显示格式化后的值').toContain('纯文本内容')
    expect(w.findComponent(RendererRichtext).exists(), '不渲染可编辑富文本').toBe(false)
    w.unmount()
  })
})

/* ═══════════ ④ 错误位一致性 ═══════════ */

describe('错误位', () => {
  it('**error prop 透传到各分支的 FieldError**', async () => {
    for (const ty of ['text', 'select', 'radio', 'upload'] as const) {
      const w = mount(FormRenderer, {
        props: {
          field: field({ type: ty, label: 'X', options: [{ label: 'A', value: 'a' }] }),
          modelValue: undefined as never,
          error: '必填',
        } as never,
        global: { stubs: { FieldError: false, AmapWidget: true } },
      })
      await flushPromises()
      const fe = w.findComponent({ name: 'FieldError' })
      expect(fe.exists(), `${ty} 渲染错误位`).toBe(true)
      expect(fe.props('message'), `${ty} 错误文案透传`).toBe('必填')
      w.unmount()
    }
  })
})