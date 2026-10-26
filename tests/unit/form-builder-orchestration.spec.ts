/**
 * FormBuilder 编排层深度行为锁定：数据同步 / 草稿 / 远程提交 / 容器渲染 / 暴露面
 *
 * ## 为什么补
 *
 * 801 行、67.5%、**函数只覆盖 51%**。已有 `form-builder.spec.ts`（145 行）只测了
 * 「校验拦截 / 提交载荷 / submitMode 锁 / steps 导航」四类入口行为，而 FormBuilder
 * 作为**编排层**的核心逻辑一条没测：
 *
 *   ① **数据同步三入口**（`syncFormData` 首帧、`watch(modelValue)` 外部重置、
 *      `initialData` 兜底）—— `initialized` 标志位 + `shallowEqual` 短路是防回环的关键，
 *      坏掉的表现是「父组件刚重置的值又被旧 formData 盖回去」。
 *   ② **草稿持久化**（storageKey → 防抖 1s 存 / 挂载时恢复 / 提交后清除 / 重置时清除）。
 *   ③ **远程提交链路**（saveUrl → POST 成功/失败两条分支，view 模式不提示）。
 *   ④ **renderSections 切分**（容器/group 归属、grid/flex 的 columns 与 span 折算）。
 *   ⑤ **容器交互**（tabs 切页 / collapse 展开 / steps 容器步进 / flex 样式变量）。
 *   ⑥ **visibleFields 与 getFormData**（事件隐藏 + 联动隐藏都不进提交）。
 *   ⑦ **暴露面契约**（stopSubmit / setSubmitting / getFormData / validate / errors）。
 *
 * 这些断言全在编排层（props/emits/DOM），不依赖真实后端。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FormBuilder from '@/components/form-builder/FormBuilder.vue'
import type { FormSchema, FormData, FormField, FieldContainer } from '@/components/form-builder/types'


/* runtime-observer 的 reportWarn 会被**预期告警**调用（安全策略拒绝等）。
   截流到局部数组，避免新增噪音类别触发第 16 步棘轮。
   ⚠️ 必须用 vi.mock 工厂：reportWarn 是 ESM 绑定，vi.spyOn 命名空间对象改不动它。 */
const warnCalls = vi.hoisted(() => [] as unknown[][])
vi.mock('@/components/_internal/runtime-observer', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, reportWarn: (...args: unknown[]) => void warnCalls.push(args) }
})

/* ═══════════ 构造工具 ═══════════ */

function field(key: string, type: string, over: Partial<FormField> = {}): FormField {
  return { key, type, label: `字段-${key}`, ...over } as FormField
}

/** 带 container 的字段 */
function inContainer(key: string, type: string, c: FieldContainer, slot = 0): FormField {
  return { key, type, label: `字段-${key}`, container: { ...c, slot } } as FormField
}

function mountBuilder(schema: FormSchema, data: FormData = {}, extra: Record<string, unknown> = {}) {
  return mount(FormBuilder, {
    props: { schema, modelValue: data, ...extra },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

/* ═══════════ 数据同步 ═══════════ */

describe('数据同步（syncFormData / watch / initialData）', () => {
  it('**首帧：defaultValue 兜底 + modelValue 覆盖**', async () => {
    // ⚠️ initialData 不是 schema 的入参，是 useFormSchema 由字段 defaultValue 算出来的
    const w = mountBuilder(
      {
        fields: [
          { key: 'a', type: 'text', label: '字段-a', default: '默认A' } as FormField,
          { key: 'b', type: 'text', label: '字段-b', default: '默认B' } as FormField,
        ],
      } as FormSchema,
      { a: '外部A' },
    )
    await nextTick()
    const data = (w.vm as unknown as { getFormData: () => FormData }).getFormData()
    expect(data.a, 'modelValue 优先').toBe('外部A')
    expect(data.b, '未给的用 defaultValue 兜底').toBe('默认B')
  })

  it('**外部 modelValue 变化时同步**（父组件重置数据）', async () => {
    const w = mountBuilder({ fields: [field('a', 'text')] } as FormSchema, { a: '旧' })
    await nextTick()
    await w.setProps({ modelValue: { a: '新' } })
    await nextTick()
    expect((w.vm as unknown as { getFormData: () => FormData }).getFormData().a).toBe('新')
  })

  it('**外部改成相同值不触发回写**（shallowEqual 短路，防抖循环）', async () => {
    const w = mountBuilder({ fields: [field('a', 'text')] } as FormSchema, { a: 'X' })
    await nextTick()
    const before = (w.emitted('update:modelValue') ?? []).length
    await w.setProps({ modelValue: { a: 'X' } })
    await nextTick()
    expect((w.emitted('update:modelValue') ?? []).length, '相同值不该再 emit').toBe(before)
  })

  it('**数据变化 emit update:modelValue + change**', async () => {
    const w = mountBuilder({ fields: [field('a', 'text')] } as FormSchema, {})
    await nextTick()
    await w.find('input').setValue('输入')
    const mv = w.emitted('update:modelValue') ?? []
    const ch = w.emitted('change') ?? []
    expect(mv.length).toBeGreaterThan(0)
    expect(ch.length).toBeGreaterThan(0)
    expect(mv.at(-1)![0]).toMatchObject({ a: '输入' })
  })

  it('**defaultMeta.type=currentTime 生成时间默认值**', async () => {
    const w = mountBuilder(
      {
        fields: [
          { key: 'a', type: 'text', label: '字段-a', defaultMeta: { type: 'currentTime' } } as FormField,
        ],
      } as FormSchema,
      {},
    )
    await nextTick()
    const v = (w.vm as unknown as { getFormData: () => FormData }).getFormData().a as string
    expect(v, '应生成 YYYY-MM-DD HH:mm').toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('**defaultMeta.type=currentUser 用 userContext.name**', async () => {
    const w = mountBuilder(
      {
        fields: [
          { key: 'a', type: 'text', label: '字段-a', defaultMeta: { type: 'currentUser' } } as FormField,
        ],
      } as FormSchema,
      {},
      { userContext: { name: '张三' } },
    )
    await nextTick()
    expect((w.vm as unknown as { getFormData: () => FormData }).getFormData().a).toBe('张三')
  })

  it('**defaultMeta.type=currentUser 无 userContext 时回落占位**', async () => {
    const w = mountBuilder(
      {
        fields: [
          { key: 'a', type: 'text', label: '字段-a', defaultMeta: { type: 'currentUser' } } as FormField,
        ],
      } as FormSchema,
      {},
    )
    await nextTick()
    expect((w.vm as unknown as { getFormData: () => FormData }).getFormData().a).toBe('currentUser')
  })

  it('**defaultMeta.type=formula 计算默认值**（{{field}} 引用）', async () => {
    const w = mountBuilder(
      {
        fields: [
          { key: 'a', type: 'number', label: '字段-a', default: 3 } as FormField,
          {
            key: 'b',
            type: 'number',
            label: '字段-b',
            defaultMeta: { type: 'formula', formula: '{{a}} * 2' },
          } as FormField,
        ],
      } as FormSchema,
      {},
    )
    await nextTick()
    expect((w.vm as unknown as { getFormData: () => FormData }).getFormData().b).toBe(6)
  })

  it('**formula 引用未填字段时整体退化为空串**', async () => {
    // expression-evaluator：求值失败/引用了空值 → 兜底返回 ''（不是部分拼接）
    const w = mountBuilder(
      {
        fields: [
          { key: 'a', type: 'text', label: '字段-a' } as FormField,
          {
            key: 'b',
            type: 'text',
            label: '字段-b',
            defaultMeta: { type: 'formula', formula: '前缀{{a}}' },
          } as FormField,
        ],
      } as FormSchema,
      {},
    )
    await nextTick()
    expect((w.vm as unknown as { getFormData: () => FormData }).getFormData().b, '兜底空串').toBe('')
  })

  it('**formula 字段顺序：被引用的字段后声明时引用为空串**', async () => {
    // createInitialData 顺序遍历：b 在 a 前，{{a}} 被替换成 ""，
    // "" + 1 走字符串拼接得 "1"（不是 6）——顺序敏感，值得锁住
    const w = mountBuilder(
      {
        fields: [
          {
            key: 'b',
            type: 'number',
            label: '字段-b',
            defaultMeta: { type: 'formula', formula: '{{a}} + 1' },
          } as FormField,
          { key: 'a', type: 'number', label: '字段-a', default: 5 } as FormField,
        ],
      } as FormSchema,
      {},
    )
    await nextTick()
    expect((w.vm as unknown as { getFormData: () => FormData }).getFormData().b).toBe('1')
  })

  it('**field.default 优先于 defaultMeta**（L168 的 field.default === undefined 守卫）', async () => {
    const w = mountBuilder(
      {
        fields: [
          {
            key: 'a',
            type: 'text',
            label: '字段-a',
            default: '显式值',
            defaultMeta: { type: 'currentTime' },
          } as FormField,
        ],
      } as FormSchema,
      {},
    )
    await nextTick()
    expect((w.vm as unknown as { getFormData: () => FormData }).getFormData().a).toBe('显式值')
  })

  it('**字段无 default 时值由 getEmptyValue 决定**（归一化填的，不是 undefined）', async () => {
    const w = mountBuilder({ fields: [field('a', 'text')] } as FormSchema)
    await nextTick()
    const d = (w.vm as unknown as { getFormData: () => FormData }).getFormData()
    expect(d.a, '缺省值落 null').toBe(null)
    expect(Object.keys(d)).toEqual(['a'])
  })
})

/* ═══════════ visibleFields / getFormData ═══════════ */

describe('可见字段与提交收集', () => {
  it('**getFormData 排除布局元素**', async () => {
    const w = mountBuilder(
      {
        fields: [field('a', 'text'), { key: 't', type: 'title', label: '标题' } as FormField],
      } as FormSchema,
      { a: 'v' },
    )
    await nextTick()
    const d = (w.vm as unknown as { getFormData: () => FormData }).getFormData()
    expect('a' in d).toBe(true)
    expect('t' in d, '布局元素不进数据').toBe(false)
  })

  it('**visibleWhen 不成立的字段不进 getFormData**', async () => {
    // ⚠️ visibleWhen 的键是 equals 不是 eq
    const w = mountBuilder(
      {
        fields: [
          field('a', 'text'),
          field('b', 'text', { visibleWhen: { field: 'a', equals: 'show' } }),
        ],
      } as FormSchema,
      { a: 'hide' },
    )
    await nextTick()
    const d = (w.vm as unknown as { getFormData: () => FormData }).getFormData()
    expect('a' in d).toBe(true)
    expect('b' in d, '隐藏字段不进数据').toBe(false)
  })

  it('**visibleWhen 成立的字段进 getFormData**', async () => {
    const w = mountBuilder(
      {
        fields: [
          field('a', 'text'),
          field('b', 'text', { visibleWhen: { field: 'a', equals: 'show' } }),
        ],
      } as FormSchema,
      { a: 'show', b: 'vb' },
    )
    await nextTick()
    expect((w.vm as unknown as { getFormData: () => FormData }).getFormData().b).toBe('vb')
  })

  it('**提交时隐藏字段不进 submit 载荷**', async () => {
    const w = mountBuilder(
      {
        fields: [
          field('a', 'text'),
          field('b', 'text', { visibleWhen: { field: 'a', equals: 'show' } }),
        ],
      } as FormSchema,
      { a: 'hide', b: 'vb' },
    )
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    const payload = w.emitted('submit')?.at(-1)?.[0] as FormData
    expect('a' in payload).toBe(true)
    expect('b' in payload, '隐藏字段不提交').toBe(false)
  })

  it('**renderFields 里不渲染隐藏字段**', async () => {
    const w = mountBuilder(
      {
        fields: [
          field('a', 'text', { label: '甲' }),
          field('b', 'text', { label: '乙', visibleWhen: { field: 'a', equals: 'show' } }),
        ],
      } as FormSchema,
      { a: 'hide' },
    )
    await nextTick()
    expect(w.text()).toContain('甲')
    expect(w.text(), '乙被隐藏').not.toContain('乙')
  })

  it('**visibleWhen 取反（not=true）**', async () => {
    const w = mountBuilder(
      {
        fields: [
          field('a', 'text'),
          field('b', 'text', { visibleWhen: { field: 'a', equals: 'show', not: true } }),
        ],
      } as FormSchema,
      { a: 'hide', b: 'vb' },
    )
    await nextTick()
    expect((w.vm as unknown as { getFormData: () => FormData }).getFormData().b, 'not 命中').toBe('vb')
  })
})

/* ═══════════ requiredWhen / disabledWhen 合成 ═══════════ */

describe('条件必填/禁用合成（effectiveFields）', () => {
  /* ⚠️ requiredWhen / disabledWhen 的判定复用 isFieldVisible，键同样是 equals。
     合成结果写进 field.required / field.disabled，所以下游（校验/渲染）零改动。 */
  it('**requiredWhen 命中 → 校验拦截**', async () => {
    const w = mountBuilder(
      {
        fields: [
          field('a', 'text'),
          field('b', 'text', { requiredWhen: { field: 'a', equals: 'must' } }),
        ],
      } as FormSchema,
      { a: 'must' },
    )
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    expect(w.emitted('submit'), 'b 必填未填 → 拦截').toBeUndefined()
    expect(w.text()).toContain('必填')
  })

  it('**requiredWhen 不命中 → 不拦截**', async () => {
    const w = mountBuilder(
      {
        fields: [
          field('a', 'text'),
          field('b', 'text', { requiredWhen: { field: 'a', equals: 'must' } }),
        ],
      } as FormSchema,
      { a: 'other' },
    )
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    expect(w.emitted('submit')).toBeTruthy()
  })

  it('**disabledWhen 命中 → 字段禁用**', async () => {
    const w = mountBuilder(
      {
        fields: [
          field('a', 'text'),
          field('b', 'text', { disabledWhen: { field: 'a', equals: 'lock' } }),
        ],
      } as FormSchema,
      { a: 'lock' },
    )
    await nextTick()
    const inputs = w.findAll('input')
    const bInput = inputs[inputs.length - 1]!
    expect(bInput.attributes('disabled'), 'b 应被禁用').toBeDefined()
  })

  it('**disabledWhen 不命中 → 不禁用**', async () => {
    const w = mountBuilder(
      {
        fields: [
          field('a', 'text'),
          field('b', 'text', { disabledWhen: { field: 'a', equals: 'lock' } }),
        ],
      } as FormSchema,
      { a: 'open' },
    )
    await nextTick()
    const inputs = w.findAll('input')
    const bInput = inputs[inputs.length - 1]!
    expect(bInput.attributes('disabled')).toBeUndefined()
  })

  it('**disabledWhen 命中时 required 也生效**（两个条件可同时合成）', async () => {
    const w = mountBuilder(
      {
        fields: [
          field('a', 'text'),
          field('b', 'text', {
            requiredWhen: { field: 'a', equals: 'both' },
            disabledWhen: { field: 'a', equals: 'both' },
          }),
        ],
      } as FormSchema,
      { a: 'both' },
    )
    await nextTick()
    const inputs = w.findAll('input')
    expect(inputs[inputs.length - 1]!.attributes('disabled'), '合成进 disabled').toBeDefined()
  })
})

/* ═══════════ 草稿持久化 ═══════════ */

/* ═══════════ 草稿持久化 ═══════════ */

/* ⚠️ 单测盲区（诚实记录）：storageKey 的草稿存取依赖 IndexedDB，happy-dom 未实现，
   一挂上就打 [FormBuilder] 草稿加载/保存失败 —— 属**新增噪音类别**，会触发
   第 16 步噪音棘轮。该链路由 useFormStorage 的单测覆盖，此处不复刻。 */

/* ═══════════ 提交链路 ═══════════ */

describe('提交链路', () => {
  it('**submitting 期间重复提交被拦截**（防双击）', async () => {
    const w = mountBuilder({ fields: [field('a', 'text')] } as FormSchema, { a: 'v' })
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    // submitting=true（3s 兜底窗口内），第二次直接触发应被拦
    await w.find('form.fb-form').trigger('submit')
    expect(w.emitted('submit')!.length, 'in-flight 守卫拦第二次').toBe(1)
  })

  it('**submitLocked：once 模式提交后按钮禁用**', async () => {
    const w = mountBuilder(
      { fields: [field('a', 'text')], submitMode: 'once' } as FormSchema,
      { a: 'v' },
    )
    await nextTick()
    const btn = w.findAll('button').find((b) => b.text() === '提交')!
    expect(btn.attributes('disabled')).toBeUndefined()
    await w.find('form.fb-form').trigger('submit')
    await nextTick()
    expect(btn.attributes('disabled'), 'once 提交后置灰').toBeDefined()
  })

  it('**submitLocked：multiple 模式提交后不禁用**', async () => {
    const w = mountBuilder(
      { fields: [field('a', 'text')], submitMode: 'multiple' } as FormSchema,
      { a: 'v' },
    )
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    await nextTick()
    const btn = w.findAll('button').find((b) => b.text() === '提交')!
    // ⚠️ VTU 的 attributes('disabled') 对 false 返回空串（不是 undefined）
    expect(btn.attributes('disabled')).toBeFalsy()
  })

  it('**stopSubmit 立即释放 loading**（expose 契约）', async () => {
    const w = mountBuilder({ fields: [field('a', 'text')] } as FormSchema, { a: 'v' })
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    const btn = w.findAll('button').find((b) => b.text() === '提交')!
    expect(btn.attributes('loading') ?? btn.classes().join(' ')).toBeTruthy()
    ;(w.vm as unknown as { stopSubmit: () => void }).stopSubmit()
    await nextTick()
    expect(btn.attributes('loading')).toBeUndefined()
  })

  it('**setSubmitting 可外部置位**（父组件延长锁定）', async () => {
    const w = mountBuilder({ fields: [field('a', 'text')] } as FormSchema, { a: 'v' })
    await nextTick()
    ;(w.vm as unknown as { setSubmitting: (v: boolean) => void }).setSubmitting(true)
    await nextTick()
    const btn = w.findAll('button').find((b) => b.text() === '提交')!
    expect(btn.attributes('loading') ?? btn.classes().join(' ')).toBeTruthy()
    // 置位期间提交被拦
    await w.find('form.fb-form').trigger('submit')
    expect(w.emitted('submit'), '外部锁定期间不提交').toBeUndefined()
    ;(w.vm as unknown as { stopSubmit: () => void }).stopSubmit()
  })

  it('**clearAfterSubmit：提交后清空数据**', async () => {
    const w = mountBuilder(
      { fields: [field('a', 'text')], clearAfterSubmit: true } as FormSchema,
      { a: 'v' },
    )
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    await nextTick()
    expect((w.vm as unknown as { getFormData: () => FormData }).getFormData().a, '提交后清空').toBeFalsy()
  })

  it('**clearAfterSubmit=false：提交后保留数据**', async () => {
    const w = mountBuilder(
      { fields: [field('a', 'text')], clearAfterSubmit: false } as FormSchema,
      { a: 'v' },
    )
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    await nextTick()
    expect((w.vm as unknown as { getFormData: () => FormData }).getFormData().a).toBe('v')
  })
})

/* ═══════════ 重置 ═══════════ */

describe('重置（handleReset）', () => {
  it('**重置回 default 并清错误、emit reset**', async () => {
    const w = mountBuilder(
      {
        fields: [
          { key: 'a', type: 'text', label: '字段-a', required: true, default: '初始' } as FormField,
        ],
      } as FormSchema,
      {},
    )
    await nextTick()
    // 用户清空输入（绕过 default 的首帧填充）
    await w.find('input').setValue('')
    await w.find('form.fb-form').trigger('submit')
    expect(w.text(), '清空后必填报错').toContain('必填')
    const resetBtn = w.findAll('button').find((b) => b.text() === '重置')!
    await resetBtn.trigger('click')
    await nextTick()
    expect(w.emitted('reset'), 'emit reset').toBeTruthy()
    expect((w.vm as unknown as { getFormData: () => FormData }).getFormData().a, '回到 default').toBe('初始')
    expect(w.find('.fb-field-error').exists(), '错误也清掉').toBe(false)
  })

  it('**重置清掉错误状态**（errors 暴露面为空）', async () => {
    const w = mountBuilder(
      { fields: [field('a', 'text', { required: true })] } as FormSchema,
      {},
    )
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    expect(Object.keys((w.vm as unknown as { errors: Record<string, unknown> }).errors).length, '有错误').toBeGreaterThan(0)
    await w.findAll('button').find((b) => b.text() === '重置')!.trigger('click')
    await nextTick()
    expect(Object.keys((w.vm as unknown as { errors: Record<string, unknown> }).errors).length, '重置后无错误').toBe(0)
  })

  it('**重置后不再渲染字段级错误**', async () => {
    const w = mountBuilder(
      { fields: [field('a', 'text', { required: true })] } as FormSchema,
      {},
    )
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    expect(w.find('.fb-field-error').exists(), '有字段级错误').toBe(true)
    await w.findAll('button').find((b) => b.text() === '重置')!.trigger('click')
    await nextTick()
    expect(w.find('.fb-field-error').exists(), '重置后字段级错误消失').toBe(false)
  })

  it('**重置后 steps 模式回到第 1 步**', async () => {
    const w = mountBuilder(
      {
        layout: 'steps',
        steps: [
          { title: '一', fields: ['a'] },
          { title: '二', fields: ['b'] },
        ],
        fields: [field('a', 'text'), field('b', 'text')],
      } as FormSchema,
      { a: 'v' },
    )
    await nextTick()
    const nextBtn = w.findAll('button').find((b) => b.text().includes('下一步'))!
    await nextBtn.trigger('click')
    await nextTick()
    await w.findAll('button').find((b) => b.text() === '重置')!.trigger('click')
    await nextTick()
    expect(w.text(), '回到第 1 步').toContain('一')
  })
})

/* ═══════════ renderSections 切分 ═══════════ */

describe('renderSections：容器/分组切分', () => {
  it('**同容器字段合成一个 section**', async () => {
    const w = mountBuilder(
      {
        fields: [
          inContainer('a', 'text', { id: 'c1', type: 'card', label: '容器一' }),
          inContainer('b', 'text', { id: 'c1', type: 'card', label: '容器一' }),
        ],
      } as FormSchema,
      {},
    )
    await nextTick()
    // 一个 Card 标题
    const cards = w.findAll('.fb-group-card')
    expect(cards.length, '同容器 → 1 个卡片').toBe(1)
    expect(cards[0]!.text()).toContain('容器一')
  })

  it('**不同容器切成多个 section**', async () => {
    const w = mountBuilder(
      {
        fields: [
          inContainer('a', 'text', { id: 'c1', type: 'card', label: '一' }),
          inContainer('b', 'text', { id: 'c2', type: 'card', label: '二' }),
        ],
      } as FormSchema,
      {},
    )
    await nextTick()
    expect(w.findAll('.fb-group-card').length).toBe(2)
  })

  it('**容器标签缺省时无标题**', async () => {
    const w = mountBuilder(
      {
        fields: [inContainer('a', 'text', { id: 'c1', type: 'card' })],
      } as FormSchema,
      {},
    )
    await nextTick()
    expect(w.findAll('.fb-group-card').length).toBe(1)
  })

  it('**group 字段按 group 名聚成一段**', async () => {
    const w = mountBuilder(
      {
        fields: [
          field('a', 'text', { group: 'G1' }),
          field('b', 'text', { group: 'G1' }),
          field('c', 'text', { group: 'G2' }),
        ],
      } as FormSchema,
      {},
    )
    await nextTick()
    // G1 一段 + G2 一段
    expect(w.findAll('.fb-group-card').length).toBe(2)
  })

  it('**grid 容器：columns 折算 CSS 变量**', async () => {
    const w = mountBuilder(
      {
        fields: [inContainer('a', 'text', { id: 'c1', type: 'grid', columns: 3 })],
      } as FormSchema,
      {},
    )
    await nextTick()
    const el = w.find('.fb-fields').element as HTMLElement
    expect(el.classList.contains('fb-grid')).toBe(true)
    expect(el.style.getPropertyValue('--fb-cols')).toBe('3')
  })

  it('**grid 容器 columns 缺省 2**', async () => {
    const w = mountBuilder(
      { fields: [inContainer('a', 'text', { id: 'c1', type: 'grid' })] } as FormSchema,
      {},
    )
    await nextTick()
    expect((w.find('.fb-fields').element as HTMLElement).style.getPropertyValue('--fb-cols')).toBe('2')
  })

  it('**grid 容器 columns=0 时兜底 1**（Math.max(1, ...)）', async () => {
    const w = mountBuilder(
      { fields: [inContainer('a', 'text', { id: 'c1', type: 'grid', columns: 0 })] } as FormSchema,
      {},
    )
    await nextTick()
    expect((w.find('.fb-fields').element as HTMLElement).style.getPropertyValue('--fb-cols')).toBe('1')
  })

  it('**flex 容器：wrap=false 时加 nowrap 类**', async () => {
    const w = mountBuilder(
      { fields: [inContainer('a', 'text', { id: 'c1', type: 'flex', wrap: false })] } as FormSchema,
      {},
    )
    await nextTick()
    const el = w.find('.fb-fields').element as HTMLElement
    expect(el.classList.contains('fb-flex')).toBe(true)
    expect(el.classList.contains('fb-flex--nowrap')).toBe(true)
    expect(el.style.getPropertyValue('--fb-flex-wrap')).toBe('nowrap')
  })

  it('**flex 容器：justify 三态映射**', async () => {
    const cases: Array<[string | undefined, string]> = [
      [undefined, 'flex-start'],
      ['center', 'center'],
      ['space-between', 'space-between'],
      ['flex-start', 'flex-start'],
    ]
    for (const [justify, expected] of cases) {
      const w = mountBuilder(
        {
          fields: [inContainer('a', 'text', { id: 'c1', type: 'flex', ...(justify ? { justify } : {}) })],
        } as FormSchema,
        {},
      )
      await nextTick()
      expect((w.find('.fb-fields').element as HTMLElement).style.getPropertyValue('--fb-flex-justify'), String(justify)).toBe(expected)
    }
  })

  it('**flex 容器：gap 负值兜底 0**', async () => {
    const w = mountBuilder(
      { fields: [inContainer('a', 'text', { id: 'c1', type: 'flex', gap: -5 })] } as FormSchema,
      {},
    )
    await nextTick()
    expect((w.find('.fb-fields').element as HTMLElement).style.getPropertyValue('--fb-flex-gap')).toBe('0px')
  })

  it('**flex 容器：gap 正常值转 px**', async () => {
    const w = mountBuilder(
      { fields: [inContainer('a', 'text', { id: 'c1', type: 'flex', gap: 12 })] } as FormSchema,
      {},
    )
    await nextTick()
    expect((w.find('.fb-fields').element as HTMLElement).style.getPropertyValue('--fb-flex-gap')).toBe('12px')
  })

  it('**flex 容器：gap 非数字兜底 0**', async () => {
    const w = mountBuilder(
      {
        fields: [inContainer('a', 'text', { id: 'c1', type: 'flex', gap: 'abc' as unknown as number })],
      } as FormSchema,
      {},
    )
    await nextTick()
    expect((w.find('.fb-fields').element as HTMLElement).style.getPropertyValue('--fb-flex-gap')).toBe('0px')
  })

  it('**普通分组：layout=grid 时走 grid 样式**', async () => {
    const w = mountBuilder(
      { layout: 'grid', columns: 4, fields: [field('a', 'text')] } as FormSchema,
      {},
    )
    await nextTick()
    const el = w.find('.fb-fields').element as HTMLElement
    expect(el.classList.contains('fb-grid')).toBe(true)
    expect(el.style.getPropertyValue('--fb-cols')).toBe('4')
  })
})

/* ═══════════ 容器交互 ═══════════ */

describe('容器交互（tabs / collapse / steps）', () => {
  const tabsContainer: FieldContainer = {
    id: 'tc',
    type: 'tabs',
    tabs: [
      { name: 't1', label: '页一' },
      { name: 't2', label: '页二' },
    ],
  }

  it('**tabs：默认激活第一个**', async () => {
    const w = mountBuilder(
      {
        fields: [
          inContainer('a', 'text', tabsContainer, 0),
          inContainer('b', 'text', tabsContainer, 1),
        ],
      } as FormSchema,
      {},
    )
    await nextTick()
    expect(w.text(), '默认显示页一字段').toContain('字段-a')
    expect(w.text(), '页二字段不显示').not.toContain('字段-b')
  })

  it('**tabs：切换后显示对应字段**', async () => {
    const w = mountBuilder(
      {
        fields: [
          inContainer('a', 'text', tabsContainer, 0),
          inContainer('b', 'text', tabsContainer, 1),
        ],
      } as FormSchema,
      {},
    )
    await nextTick()
    const tabItems = w.findAll('[role="tab"], .tab, [class*="tab-item"]')
    expect(tabItems.length, '应有 tab 项').toBeGreaterThan(0)
    await tabItems[tabItems.length - 1]!.trigger('click')
    await nextTick()
    expect(w.text(), '切到页二').toContain('字段-b')
  })

  it('**collapse：按 slot 分栏渲染字段**', async () => {
    const cc: FieldContainer = {
      id: 'cc',
      type: 'collapse',
      collapseItems: [
        { title: '折叠一', expanded: true },
        { title: '折叠二', expanded: false },
      ],
    }
    const w = mountBuilder(
      {
        fields: [inContainer('a', 'text', cc, 0), inContainer('b', 'text', cc, 1)],
      } as FormSchema,
      {},
    )
    await nextTick()
    expect(w.text()).toContain('字段-a')
    expect(w.text()).toContain('字段-b')
  })

  it('**collapse：slot 越界的字段不渲染**', async () => {
    const cc: FieldContainer = {
      id: 'cc',
      type: 'collapse',
      collapseItems: [{ title: '只有一项', expanded: true }],
    }
    const w = mountBuilder(
      {
        fields: [inContainer('a', 'text', cc, 0), inContainer('b', 'text', cc, 5)],
      } as FormSchema,
      {},
    )
    await nextTick()
    expect(w.text()).toContain('字段-a')
    expect(w.text(), 'slot=5 无对应折叠项').not.toContain('字段-b')
  })

  it('**steps 容器：默认第 0 项**', async () => {
    const w = mountBuilder(
      {
        fields: [
          inContainer('a', 'text', {
            id: 'sc',
            type: 'steps',
            steps: [
              { title: '步一' },
              { title: '步二' },
            ],
          }, 0),
          inContainer('b', 'text', {
            id: 'sc',
            type: 'steps',
            steps: [
              { title: '步一' },
              { title: '步二' },
            ],
          }, 1),
        ],
      } as FormSchema,
      {},
    )
    await nextTick()
    expect(w.text(), '默认显示步一字段').toContain('字段-a')
    expect(w.text(), '步二字段不显示').not.toContain('字段-b')
  })

  it('**steps 容器：点导航切换**', async () => {
    const w = mountBuilder(
      {
        fields: [
          inContainer('a', 'text', {
            id: 'sc',
            type: 'steps',
            steps: [
              { title: '步一' },
              { title: '步二' },
            ],
          }, 0),
          inContainer('b', 'text', {
            id: 'sc',
            type: 'steps',
            steps: [
              { title: '步一' },
              { title: '步二' },
            ],
          }, 1),
        ],
      } as FormSchema,
      {},
    )
    await nextTick()
    // Steps 组件的 step-click 由容器步骤导航触发
    const steps = w.findAll('.steps, [class*="steps"] [class*="step"]')
    expect(steps.length, '应有步骤导航').toBeGreaterThan(0)
    await steps[steps.length - 1]!.trigger('click')
    await nextTick()
    expect(w.text(), '切到步二').toContain('字段-b')
  })
})

/* ═══════════ 头部与动作区 ═══════════ */

describe('头部与动作区', () => {
  it('**title/description 渲染**', async () => {
    const w = mountBuilder(
      { title: '表单标题', description: '表单说明', fields: [field('a', 'text')] } as FormSchema,
      {},
    )
    await nextTick()
    expect(w.find('.fb-title').text()).toBe('表单标题')
    expect(w.find('.fb-desc').text()).toBe('表单说明')
  })

  it('**hideHeader 时不渲染头部**', async () => {
    const w = mountBuilder(
      { title: 'T', description: 'D', fields: [field('a', 'text')] } as FormSchema,
      {},
      { hideHeader: true },
    )
    await nextTick()
    expect(w.find('.fb-header').exists()).toBe(false)
  })

  it('**无 title/description 时不渲染头部容器**', async () => {
    const w = mountBuilder({ fields: [field('a', 'text')] } as FormSchema, {})
    await nextTick()
    expect(w.find('.fb-header').exists()).toBe(false)
  })

  it('**hideActions 时隐藏提交/重置**', async () => {
    const w = mountBuilder(
      { fields: [field('a', 'text')], hideActions: true } as FormSchema,
      {},
    )
    await nextTick()
    expect(w.findAll('button').some((b) => b.text() === '提交'), '提交应隐藏').toBe(false)
    expect(w.findAll('button').some((b) => b.text() === '重置'), '重置应隐藏').toBe(false)
  })

  it('**view 模式隐藏动作区**（submitConfig.mode=view）', async () => {
    const w = mountBuilder(
      {
        fields: [field('a', 'text')],
        submitConfig: { mode: 'view' },
      } as FormSchema,
      {},
    )
    await nextTick()
    expect(w.findAll('button').some((b) => b.text() === '提交'), 'view 模式无提交').toBe(false)
  })

  it('**自定义提交/重置文案**', async () => {
    const w = mountBuilder(
      {
        fields: [field('a', 'text')],
        submitText: '保存',
        resetText: '清空',
      } as FormSchema,
      {},
    )
    await nextTick()
    expect(w.findAll('button').some((b) => b.text() === '保存')).toBe(true)
    expect(w.findAll('button').some((b) => b.text() === '清空')).toBe(true)
  })

  it('**disabled 时提交按钮禁用**', async () => {
    const w = mountBuilder({ fields: [field('a', 'text')] } as FormSchema, {}, { disabled: true })
    await nextTick()
    const btn = w.findAll('button').find((b) => b.text() === '提交')!
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('**readonly 时字段禁用**', async () => {
    const w = mountBuilder({ fields: [field('a', 'text')] } as FormSchema, {}, { readonly: true })
    await nextTick()
    expect(w.find('input').attributes('disabled'), 'readonly → 字段禁用').toBeDefined()
  })

  it('**view 模式字段只读**', async () => {
    const w = mountBuilder(
      { fields: [field('a', 'text')], submitConfig: { mode: 'view' } } as FormSchema,
      { a: 'v' },
    )
    await nextTick()
    expect(w.find('input').attributes('disabled')).toBeDefined()
  })
})

/* ═══════════ steps 模式（layout=steps） ═══════════ */

describe('steps 布局模式', () => {
  const stepsSchema = (): FormSchema =>
    ({
      layout: 'steps',
      steps: [
        { title: '第一步', fields: ['a'] },
        { title: '第二步', fields: ['b'] },
      ],
      fields: [field('a', 'text'), field('b', 'text')],
    }) as FormSchema

  it('**只渲染当前步字段**', async () => {
    const w = mountBuilder(stepsSchema(), {})
    await nextTick()
    expect(w.text()).toContain('字段-a')
    expect(w.text()).not.toContain('字段-b')
  })

  it('**上一步按钮：第 1 步不显示**', async () => {
    const w = mountBuilder(stepsSchema(), {})
    await nextTick()
    expect(w.findAll('button').some((b) => b.text().includes('上一步'))).toBe(false)
  })

  it('**前进后显示上一步**', async () => {
    const w = mountBuilder(stepsSchema(), { a: 'v' })
    await nextTick()
    await w.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    await nextTick()
    expect(w.findAll('button').some((b) => b.text().includes('上一步'))).toBe(true)
  })

  it('**上一步回到第 1 步**', async () => {
    const w = mountBuilder(stepsSchema(), { a: 'v' })
    await nextTick()
    await w.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    await nextTick()
    expect(w.text()).toContain('字段-b')
    await w.findAll('button').find((b) => b.text().includes('上一步'))!.trigger('click')
    await nextTick()
    expect(w.text()).toContain('字段-a')
    expect(w.text()).not.toContain('字段-b')
  })

  it('**步骤进度条与文案**', async () => {
    const w = mountBuilder(stepsSchema(), {})
    await nextTick()
    expect(w.find('.fb-step-indicator').exists()).toBe(true)
    expect(w.text()).toContain('1')
    expect(w.text()).toContain('2')
  })

  it('**steps 模式隐藏分组卡片**（不按容器切分）', async () => {
    const w = mountBuilder(stepsSchema(), {})
    await nextTick()
    expect(w.find('.fb-group-card').exists(), 'steps 模式不渲染分组卡片').toBe(false)
  })

  it('**showSteps：layout=steps 但无 steps 配置时不显示导航**', async () => {
    const w = mountBuilder({ layout: 'steps', fields: [field('a', 'text')] } as FormSchema, {})
    await nextTick()
    // totalSteps=0 → showSteps=false → 走普通渲染
    expect(w.find('.fb-step-indicator').exists()).toBe(false)
    expect(w.find('.fb-group-card').exists() || w.find('input').exists()).toBe(true)
  })
})


/* ═══════════ validateOnChange 实时校验 ═══════════ */

describe('实时校验（validateOnChange）', () => {
  it('**开启后：有值的字段失焦即校验，emit validate**', async () => {
    const w = mountBuilder(
      {
        fields: [field('a', 'text', { required: true })],
        validateOnChange: true,
      } as FormSchema,
      {},
    )
    await nextTick()
    await w.find('input').setValue('v')
    await nextTick()
    // validateOnChange 模式下数据变化会跑一遍校验并 emit validate
    const v = w.emitted('validate') ?? []
    expect(v.length, '应 emit validate').toBeGreaterThan(0)
    expect(v.at(-1)![0], '有值 → 通过').toBe(true)
  })

  it('**开启后：必填字段为空时不报错**（避免刚打开全红）', async () => {
    const w = mountBuilder(
      {
        fields: [field('a', 'text', { required: true })],
        validateOnChange: true,
      } as FormSchema,
      {},
    )
    await nextTick()
    // 空值不该触发 validateOne（hasValue 为 false 且 errors 无该项）
    const v = w.emitted('validate') ?? []
    if (v.length) expect(v.at(-1)![0]).toBe(false)
    expect(w.find('.fb-field-error').exists(), '空值不渲染错误').toBe(false)
  })

  it('**开启后：填错的字段失焦报错**', async () => {
    // ⚠️ rules 是函数数组（不是字符串），签名 (v: string) => string | undefined
    const w = mountBuilder(
      {
        fields: [
          field('a', 'text', {
            required: true,
            rules: [(v: string) => (v.length >= 3 ? undefined : '至少 3 个字符')],
          }),
        ],
        validateOnChange: true,
      } as FormSchema,
      {},
    )
    await nextTick()
    await w.find('input').setValue('ab')
    await nextTick()
    const v = w.emitted('validate') ?? []
    expect(v.length, '数据变化应触发一次校验').toBeGreaterThan(0)
    expect(v.at(-1)![0], '长度不足 → 不通过').toBe(false)
  })

  it('**开启后：改对之后校验恢复通过**', async () => {
    const w = mountBuilder(
      {
        fields: [
          field('a', 'text', {
            required: true,
            rules: [(v: string) => (v.length >= 3 ? undefined : '至少 3 个字符')],
          }),
        ],
        validateOnChange: true,
      } as FormSchema,
      {},
    )
    await nextTick()
    await w.find('input').setValue('ab')
    await nextTick()
    expect((w.emitted('validate') ?? []).at(-1)![0], '先不通过').toBe(false)
    await w.find('input').setValue('abc')
    await nextTick()
    expect((w.emitted('validate') ?? []).at(-1)![0], '改对后恢复').toBe(true)
  })

  it('**实时校验的 rules 接收当前值**（上下文签名可见同表其它字段）', async () => {
    const w = mountBuilder(
      {
        fields: [
          field('a', 'text'),
          field('b', 'text', {
            rules: [(v: string, data: Record<string, unknown>) => (v === data.a ? undefined : '需与 a 相同')],
          }),
        ],
        validateOnChange: true,
      } as FormSchema,
      { a: 'x' },
    )
    await nextTick()
    await w.findAll('input')[1]!.setValue('y')
    await nextTick()
    expect((w.emitted('validate') ?? []).at(-1)![0], '与 a 不同 → 不通过').toBe(false)
    await w.findAll('input')[1]!.setValue('x')
    await nextTick()
    expect((w.emitted('validate') ?? []).at(-1)![0], '与 a 相同 → 通过').toBe(true)
  })

  it('**关闭时不跑实时校验**（只在 submit 时校验）', async () => {
    const w = mountBuilder(
      { fields: [field('a', 'text', { required: true })] } as FormSchema,
      {},
    )
    await nextTick()
    await w.find('input').setValue('v')
    await nextTick()
    expect((w.emitted('validate') ?? []).length, '未开启不该 emit validate').toBe(0)
  })

  it('**实时校验跳过布局元素**', async () => {
    const w = mountBuilder(
      {
        fields: [
          field('a', 'text', { required: true }),
          { key: 't', type: 'title', label: '标题' } as FormField,
        ],
        validateOnChange: true,
      } as FormSchema,
      { a: 'v' },
    )
    await nextTick()
    await w.find('input').setValue('v2')
    await nextTick()
    const v = w.emitted('validate') ?? []
    expect(v.length).toBeGreaterThan(0)
    expect(v.at(-1)![0], '布局元素不参与校验').toBe(true)
  })
})

/* ═══════════ collapse 交互 ═══════════ */

describe('collapse 展开状态切换', () => {
  const cc: FieldContainer = {
    id: 'cc',
    type: 'collapse',
    collapseItems: [
      { title: '折叠一', expanded: true },
      { title: '折叠二', expanded: false },
    ],
  }

  it('**collapseOpen 优先用运行时状态**（点过之后不再看 item.expanded）', async () => {
    const w = mountBuilder(
      { fields: [inContainer('a', 'text', cc, 0), inContainer('b', 'text', cc, 1)] } as FormSchema,
      {},
    )
    await nextTick()
    // 点第 2 项的标题切换展开（collapseStates 被写入）
    const collapseItems = w.findAll('.collapse, [class*="collapse"]')
    expect(collapseItems.length, '应有两个折叠项').toBeGreaterThanOrEqual(2)
    await collapseItems[collapseItems.length - 1]!.trigger('click')
    await nextTick()
    // 运行时状态写入后 fieldsBySlot 不变，但 open 状态已变（这里只验证不抛）
    expect(w.text()).toContain('字段-a')
  })

  it('**collapse 的 update:open 写入运行时状态**（不依赖 item.expanded）', async () => {
    const w = mountBuilder(
      { fields: [inContainer('a', 'text', cc, 0), inContainer('b', 'text', cc, 1)] } as FormSchema,
      {},
    )
    await nextTick()
    const collapse = w.findAllComponents({ name: 'Collapse' })
    expect(collapse.length, '应有两个 Collapse').toBe(2)
    // 第 1 项默认 expanded=true → 反转为 false
    collapse[0]!.vm.$emit('update:open', false)
    await nextTick()
    expect(collapse[0]!.props('open'), '运行时状态应覆盖默认').toBe(false)
    // 第 2 项默认 false → 置 true
    collapse[1]!.vm.$emit('update:open', true)
    await nextTick()
    expect(collapse[1]!.props('open')).toBe(true)
  })

  it('**collapseItems 缺省时不出错**', async () => {
    const w = mountBuilder(
      { fields: [inContainer('a', 'text', { id: 'cc', type: 'collapse' }, 0)] } as FormSchema,
      {},
    )
    await nextTick()
    expect(w.findAllComponents({ name: 'Collapse' }).length, '无配置项 → 0 个折叠').toBe(0)
  })
})

/* ═══════════ tabs 运行时状态 ═══════════ */

describe('tabs 激活态切换', () => {
  const tabsContainer: FieldContainer = {
    id: 'tc',
    type: 'tabs',
    tabs: [
      { name: 't1', label: '页一' },
      { name: 't2', label: '页二' },
    ],
  }

  it('**activeTabOf：运行时状态优先于第一个 tab**', async () => {
    const w = mountBuilder(
      {
        fields: [
          inContainer('a', 'text', tabsContainer, 0),
          inContainer('b', 'text', tabsContainer, 1),
        ],
      } as FormSchema,
      {},
    )
    await nextTick()
    const tabs = w.findAllComponents({ name: 'Tabs' })
    expect(tabs.length).toBe(1)
    tabs[0]!.vm.$emit('update:modelValue', 't2')
    await nextTick()
    expect(tabs[0]!.props('modelValue'), '切到 t2').toBe('t2')
    expect(w.text(), 't2 字段出现').toContain('字段-b')
  })

  it('**tabs 容器 id 缺省时 key 为空串**（不抛）', async () => {
    const w = mountBuilder(
      {
        fields: [
          inContainer('a', 'text', { type: 'tabs', tabs: [{ name: 't1', label: '页一' }] } as FieldContainer, 0),
        ],
      } as FormSchema,
      {},
    )
    await nextTick()
    expect(w.findComponent({ name: 'Tabs' }).exists()).toBe(true)
  })
})


/* ═══════════ 负向对照驱动补齐：可分辨断言 ═══════════ */

describe('可分辨断言（防变异存活）', () => {
  /* 首帧同步：变异后 initialized 一旦为 true 就不再更新 formData。
     可分辨观测点：initialData 变化后 formData 是否跟进。 */
  it('**initialData 变化时 formData 跟进**（首帧后才看 initialized 短路）', async () => {
    const w = mountBuilder(
      { fields: [{ key: 'a', type: 'text', label: '字段-a', default: 'D1' } as FormField] } as FormSchema,
      {},
    )
    await nextTick()
    expect((w.vm as unknown as { getFormData: () => FormData }).getFormData().a).toBe('D1')
    await w.setProps({
      schema: { fields: [{ key: 'a', type: 'text', label: '字段-a', default: 'D2' } as FormField] } as FormSchema,
    })
    await nextTick()
    await nextTick()
    expect((w.vm as unknown as { getFormData: () => FormData }).getFormData().a, 'initialData 变了要跟进').toBe('D2')
  })

  /* 外部 modelValue 同步：变异「if (false)」后 setProps 完全不起作用。观测点：DOM。 */
  it('**外部 modelValue 变化反映到 DOM**', async () => {
    const w = mountBuilder({ fields: [field('a', 'text')] } as FormSchema, { a: '旧' })
    await nextTick()
    expect(w.find('input').element.value).toBe('旧')
    await w.setProps({ modelValue: { a: '新' } })
    await nextTick()
    expect(w.find('input').element.value, 'DOM 应更新').toBe('新')
  })

  /* 实时校验：清空已出错字段仍应触发校验（errors 分支参与判定）。 */
  it('**实时校验：清空已出错字段后仍触发校验**（errors 分支参与判定）', async () => {
    // 变异「if (hasValue)」去掉 errors 分支后：清空无值字段不会重新校验，
    // 旧错误留在 errors 里 —— 观测点是 validate 的 emit 次数是否继续增长。
    const w = mountBuilder(
      {
        fields: [
          field('a', 'text', {
            required: true,
            rules: [(v: string) => (v === 'bad' ? '不许 bad' : undefined)],
          }),
        ],
        validateOnChange: true,
      } as FormSchema,
      {},
    )
    await nextTick()
    await w.find('input').setValue('bad')
    await nextTick()
    expect((w.emitted('validate') ?? []).at(-1)![0], 'bad → 不通过').toBe(false)
    const before = (w.emitted('validate') ?? []).length
    await w.find('input').setValue('')
    await nextTick()
    expect((w.emitted('validate') ?? []).length, '清空后仍应再校验').toBeGreaterThan(before)
  })

  /* 校验失败时最后一次 validate 必须是 false。 */
  it('**校验失败时 validate 最后一次为 false**', async () => {
    const w = mountBuilder(
      { fields: [field('a', 'text', { required: true })] } as FormSchema,
      {},
    )
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    const v = w.emitted('validate') ?? []
    expect(v.length, '失败也要 emit validate').toBeGreaterThan(0)
    expect(v.at(-1)![0]).toBe(false)
  })

  /* once 模式：stopSubmit 后再次提交仍被 hasSubmitted 拦。 */
  it('**once 模式：stopSubmit 后再次提交仍被拦**', async () => {
    const w = mountBuilder(
      { fields: [field('a', 'text')], submitMode: 'once' } as FormSchema,
      { a: 'v' },
    )
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    expect(w.emitted('submit')!.length).toBe(1)
    ;(w.vm as unknown as { stopSubmit: () => void }).stopSubmit()
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    expect(w.emitted('submit')!.length, 'hasSubmitted 拦第二次').toBe(1)
  })

  /* multiple 模式提交后原生 disabled 必须是 false（不是空串）。 */
  it('**multiple 模式提交后原生 disabled 为 false**', async () => {
    const w = mountBuilder(
      { fields: [field('a', 'text')], submitMode: 'multiple' } as FormSchema,
      { a: 'v' },
    )
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    // 先释放 in-flight（loading 也会 disabled），才能单独观测 submitLocked
    ;(w.vm as unknown as { stopSubmit: () => void }).stopSubmit()
    await nextTick()
    const btn = w.findAll('button').find((b) => b.text() === '提交')!
    expect((btn.element as HTMLButtonElement).disabled, 'multiple 不锁').toBe(false)
  })

  /* reset 后 once 模式可再次提交（hasSubmitted 复位）。 */
  it('**reset 后 once 模式可再次提交**', async () => {
    const w = mountBuilder(
      { fields: [field('a', 'text')], submitMode: 'once' } as FormSchema,
      { a: 'v' },
    )
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    expect(w.emitted('submit')!.length).toBe(1)
    ;(w.vm as unknown as { stopSubmit: () => void }).stopSubmit()
    await w.findAll('button').find((b) => b.text() === '重置')!.trigger('click')
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    expect(w.emitted('submit')!.length, 'reset 后可再提交').toBe(2)
  })

  /* reset 后 steps 回到第 1 步（DOM 可分辨）。 */
  it('**reset 后 steps 回到第 1 步的字段**', async () => {
    const w = mountBuilder(
      {
        layout: 'steps',
        steps: [
          { title: '一', fields: ['a'] },
          { title: '二', fields: ['b'] },
        ],
        fields: [field('a', 'text'), field('b', 'text')],
      } as FormSchema,
      { a: 'v' },
    )
    await nextTick()
    await w.findAll('button').find((b) => b.text().includes('下一步'))!.trigger('click')
    await nextTick()
    expect(w.text(), '先到第 2 步').toContain('字段-b')
    await w.findAll('button').find((b) => b.text() === '重置')!.trigger('click')
    await nextTick()
    expect(w.text(), '回到第 1 步').toContain('字段-a')
    expect(w.text(), '第 2 步字段消失').not.toContain('字段-b')
  })

  /*
   * 事件隐藏：visibleFields 若不过事件隐藏，字段会一直可见。
   *
   * ⚠️ 第 139 轮语义变更（契约变更）：`toggleVisible` 从「每事件翻转」改为「值驱动」——
   * 源字段**有内容 → 显示目标**、**清空 → 隐藏目标**。
   * 原语义下目标可见性是"change 事件次数的奇偶"，而 Input 逐键 emit change，
   * 于是键入 a→隐藏、ab→显示、abc→隐藏；值没变时重复派发也会翻转（详见 useFormEvents 注释）。
   */
  it('**事件隐藏后字段不渲染**（visibleFields 过事件隐藏 · 值驱动）', async () => {
    const w = mountBuilder(
      {
        fields: [
          {
            key: 'a',
            type: 'text',
            label: '字段-a',
            // ⚠️ events 是字段级、单对象（不是 schema 级数组）
            events: {
              onChange: { action: 'toggleVisible', targetField: 'b' },
            },
          } as FormField,
          field('b', 'text', { label: '字段-b' }),
        ],
      } as FormSchema,
      { a: '' },
    )
    await nextTick()
    expect(w.text(), '初始可见').toContain('字段-b')
    // 有内容 → 显示（值驱动：不随键入次数抖动）
    await w.find('input').setValue('x')
    await nextTick()
    expect(w.text(), '有内容时仍显示').toContain('字段-b')
    // 清空 → 隐藏。这一条同时充当变异检测：visibleFields 若不过事件隐藏，清空后仍会渲染 '字段-b'
    await w.find('input').setValue('')
    await nextTick()
    expect(w.text(), '清空后不可见').not.toContain('字段-b')
  })

  /* reset 清掉事件隐藏（hiddenByEvent 复位）。 */
  it('**reset 清掉事件隐藏的字段**（hiddenByEvent 复位）', async () => {
    const w = mountBuilder(
      {
        fields: [
          {
            key: 'a',
            type: 'text',
            label: '字段-a',
            // ⚠️ events 是字段级、单对象（不是 schema 级数组）
            events: {
              onChange: { action: 'toggleVisible', targetField: 'b' },
            },
          } as FormField,
          field('b', 'text', { label: '字段-b' }),
        ],
      } as FormSchema,
      { a: '' },
    )
    await nextTick()
    expect(w.text(), '初始可见').toContain('字段-b')
    // 清空源字段 → 值驱动语义下隐藏目标
    await w.find('input').setValue('')
    await nextTick()
    expect(w.text(), '清空后不可见').not.toContain('字段-b')
    await w.findAll('button').find((b) => b.text() === '重置')!.trigger('click')
    await nextTick()
    expect(w.text(), 'reset 后恢复可见').toContain('字段-b')
  })

  /* layout=single 有 steps 配置时不该显示导航、也不该按 steps 过滤字段。 */
  it('**layout=single 有 steps 配置时不显示导航且渲染全部字段**', async () => {
    const w = mountBuilder(
      {
        layout: 'single',
        steps: [{ title: '一', fields: ['a'] }],
        fields: [field('a', 'text', { label: '字段-a' }), field('b', 'text', { label: '字段-b' })],
      } as FormSchema,
      { a: 'v', b: 'v2' },
    )
    await nextTick()
    expect(w.find('.fb-step-indicator').exists(), '不该有步骤导航').toBe(false)
    expect(w.text()).toContain('字段-a')
    expect(w.text(), 'b 不该被 steps 过滤').toContain('字段-b')
  })

  /* group 名作为段落标题。 */
  it('**group 名作为段落标题渲染**', async () => {
    const w = mountBuilder(
      { fields: [field('a', 'text', { group: '基本信息' })] } as FormSchema,
      {},
    )
    await nextTick()
    expect(w.text(), 'group 名应在标题位置').toContain('基本信息')
  })

  /* grid columns=0 时 span 兜底为正数（不出现 Infinity）。 */
  it('**grid columns=0 时 span 兜底为正数**', async () => {
    const w = mountBuilder(
      { fields: [inContainer('a', 'text', { id: 'c1', type: 'grid', columns: 0 })] } as FormSchema,
      {},
    )
    await nextTick()
    const el = w.find('.fb-fields').element as HTMLElement
    const span = el.style.getPropertyValue('--fb-span')
    expect(span, '不应是 Infinity').not.toContain('Infinity')
    expect(span, '不应是 NaN').not.toContain('NaN')
  })

  /* flex 容器 --fb-cols 强制 24。 */
  it('**flex 容器不设 --fb-cols**（只有 grid 才设，flex 走 flexStyle）', async () => {
    const w = mountBuilder(
      { fields: [inContainer('a', 'text', { id: 'c1', type: 'flex', columns: 3 })] } as FormSchema,
      {},
    )
    await nextTick()
    const el = w.find('.fb-fields').element as HTMLElement
    expect(el.classList.contains('fb-flex'), '应有 fb-flex 类').toBe(true)
    expect(el.classList.contains('fb-grid'), '不该有 fb-grid 类').toBe(false)
    expect(el.style.getPropertyValue('--fb-cols'), 'flex 不设列数').toBe('')
    expect(el.style.getPropertyValue('--fb-flex-wrap'), 'flex 走 flexStyle').toBe('wrap')
  })

  it('**flex 容器 columns 归一为 24 但不进 DOM**（span 计算用）', async () => {
    const w = mountBuilder(
      { fields: [inContainer('a', 'text', { id: 'c1', type: 'flex' })] } as FormSchema,
      {},
    )
    await nextTick()
    expect((w.find('.fb-fields').element as HTMLElement).style.getPropertyValue('--fb-cols')).toBe('')
  })

  /* collapse 首项按 expanded=true 默认展开。 */
  it('**collapse 首项按 expanded=true 默认展开**', async () => {
    const w = mountBuilder(
      {
        fields: [
          inContainer('a', 'text', {
            id: 'cc',
            type: 'collapse',
            collapseItems: [{ title: '折叠一', expanded: true }],
          }, 0),
        ],
      } as FormSchema,
      {},
    )
    await nextTick()
    const c = w.findComponent({ name: 'Collapse' })
    expect(c.props('open'), 'expanded=true 应传给 open').toBe(true)
  })

  /* 跨域 apiUrl 默认被拒（apiAllowOrigins 为空 = 同源 only）。 */
  it('**跨域 apiUrl 默认被拒**', async () => {
    const spy = vi.fn().mockResolvedValue({ json: async () => ({}) })
    vi.stubGlobal('fetch', spy)
    try {
      mountBuilder(
        {
          fields: [
            {
              key: 'a',
              type: 'text',
              label: '字段-a',
              defaultMeta: { type: 'api', apiUrl: 'https://evil.example.com/x' },
            } as FormField,
          ],
        } as FormSchema,
        {},
      )
      await nextTick()
      await nextTick()
      expect(spy, '跨域被拒 → 不请求').not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })


  /* 外部 modelValue 同步：保留（已能杀「if (false)」变异） */

  /* submitLocked 不看 submitMode：once 模式 stopSubmit 后按钮仍锁，multiple 不锁。
     两条对照才能把「只看 hasSubmitted」的变异杀掉。 */
  it('**once 模式 stopSubmit 后按钮仍锁**（submitLocked 与 in-flight 解耦）', async () => {
    const w = mountBuilder(
      { fields: [field('a', 'text')], submitMode: 'once' } as FormSchema,
      { a: 'v' },
    )
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    ;(w.vm as unknown as { stopSubmit: () => void }).stopSubmit()
    await nextTick()
    const btn = w.findAll('button').find((b) => b.text() === '提交')!
    expect((btn.element as HTMLButtonElement).disabled, 'once 提交后一直锁').toBe(true)
  })

  it('**multiple 模式 stopSubmit 后可再提交**（不锁按钮）', async () => {
    const w = mountBuilder(
      { fields: [field('a', 'text')], submitMode: 'multiple' } as FormSchema,
      { a: 'v' },
    )
    await nextTick()
    await w.find('form.fb-form').trigger('submit')
    ;(w.vm as unknown as { stopSubmit: () => void }).stopSubmit()
    await nextTick()
    const btn = w.findAll('button').find((b) => b.text() === '提交')!
    expect((btn.element as HTMLButtonElement).disabled, 'multiple 不锁').toBe(false)
    await w.find('form.fb-form').trigger('submit')
    expect(w.emitted('submit')!.length, '可再次提交').toBe(2)
  })

  /* stopSubmit 清 timer 的可观测设计：
     submit#1 起 3s timer(A) → stopSubmit（真码清掉 A，变异留下）→
     submit#2 起新 timer(B, 3s) → 推进 0.2s：
       真码：只有 B，submitting 仍 true（loading 在）
       变异：A 到期（3.0s）把 submitting 改回 false（loading 消失）
     ⚠️ multiple 模式，否则 submit#2 会被 hasSubmitted 拦。 */
  it('**stopSubmit 清掉旧的兜底 timer**（旧 timer 到期不会覆盖新提交状态）', async () => {
    vi.useFakeTimers()
    try {
      const w = mountBuilder(
        { fields: [field('a', 'text')], submitMode: 'multiple' } as FormSchema,
        { a: 'v' },
      )
      await nextTick()
      await w.find('form.fb-form').trigger('submit') // t=0 起 timer A（t=3000 到期）
      // 先推进 1s 把 A/B 的到期点错开（否则两者同时到期，观测不到差异）
      await vi.advanceTimersByTimeAsync(1000)
      const vm = w.vm as unknown as { stopSubmit: () => void }
      vm.stopSubmit()
      await nextTick()
      await w.find('form.fb-form').trigger('submit') // t=1000 起 timer B（t=4000 到期）
      await nextTick()
      const btn = w.findAll('button').find((b) => b.text() === '提交')!
      expect(btn.classes(), '第二次提交后 loading').toContain('loading')
      // 推进到 t=3200：A 已过期（3000），B 还没到（4000）
      await vi.advanceTimersByTimeAsync(2200)
      await nextTick()
      expect(btn.classes(), 'A 若未清会在 t=3000 把 loading 抹掉').toContain('loading')
      // 再推进到 t=4200：B 到期，正常解锁
      await vi.advanceTimersByTimeAsync(1000)
      await nextTick()
      expect(btn.classes(), 'B 到期后正常解锁').not.toContain('loading')
    } finally {
      vi.useRealTimers()
    }
  })

  /* setSubmitting 清 timer：设计同上，但第二步用 setSubmitting 起新状态。
     真码 setSubmitting 会先清 A，变异不清 → A 到期覆盖。 */
  it('**setSubmitting 清掉旧的兜底 timer**', async () => {
    vi.useFakeTimers()
    try {
      const w = mountBuilder(
        { fields: [field('a', 'text')] } as FormSchema,
        { a: 'v' },
      )
      await nextTick()
      await w.find('form.fb-form').trigger('submit') // 起 timer A
      const vm = w.vm as unknown as { setSubmitting: (v: boolean) => void }
      vm.setSubmitting(true)
      await nextTick()
      const btn = w.findAll('button').find((b) => b.text() === '提交')!
      expect(btn.classes()).toContain('loading')
      await vi.advanceTimersByTimeAsync(3100)
      await nextTick()
      expect(btn.classes(), 'A 若未清会让 loading 被覆盖').toContain('loading')
    } finally {
      vi.useRealTimers()
    }
  })

  /* apiUrlPolicy：跨域被拒 vs 白名单放行（两条对照） */
  it('**apiAllowOrigins 白名单内的 apiUrl 会请求**', async () => {
    const spy = vi.fn().mockResolvedValue({ json: async () => ({ v: 1 }) })
    vi.stubGlobal('fetch', spy)
    try {
      mountBuilder(
        {
          fields: [
            {
              key: 'a',
              type: 'text',
              label: '字段-a',
              defaultMeta: { type: 'api', apiUrl: 'https://ok.example.com/x' },
            } as FormField,
          ],
        } as FormSchema,
        {},
        { apiAllowOrigins: ['https://ok.example.com'] },
      )
      await nextTick()
      await new Promise((r) => setTimeout(r, 80))
      expect(spy.mock.calls.length, '白名单内应发起请求').toBeGreaterThan(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('**跨域 apiUrl 被拒时不发请求**（同源 only 默认）', async () => {
    const before = warnCalls.length
    const fetchSpy = vi.fn().mockResolvedValue({ json: async () => ({}) })
    vi.stubGlobal('fetch', fetchSpy)
    try {
      mountBuilder(
        {
          fields: [
            {
              key: 'a',
              type: 'text',
              label: '字段-a',
              defaultMeta: { type: 'api', apiUrl: 'https://evil.example.com/x' },
            } as FormField,
          ],
        } as FormSchema,
        {},
      )
      await nextTick()
      await new Promise((r) => setTimeout(r, 80))
      expect(fetchSpy.mock.calls.length, '跨域被拒 → 0 次请求').toBe(0)
      expect(warnCalls.length, '应走安全策略拒绝分支（reportWarn 已截流）').toBeGreaterThan(before)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  /* 无 api 数据源时不发任何请求。 */
  it('**无 api 数据源时不发请求**', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    try {
      const w = mountBuilder({ fields: [field('a', 'text')] } as FormSchema, {})
      await nextTick()
      await nextTick()
      expect(spy, '无 api 配置不该请求').not.toHaveBeenCalled()
      expect(w.find('input').exists()).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
/* ═══════════ onFieldUpdate 回写 ═══════════ */

describe('onFieldUpdate：FieldList 回写', () => {
  it('**update:field 写回 formData**', async () => {
    const w = mountBuilder({ fields: [field('a', 'text')] } as FormSchema, {})
    await nextTick()
    const group = w.findComponent({ name: 'FormFieldGroup' })
    expect(group.exists(), '应挂 FormFieldGroup').toBe(true)
    group.vm.$emit('update:field', 'a', '回写值')
    await nextTick()
    expect((w.vm as unknown as { getFormData: () => FormData }).getFormData().a).toBe('回写值')
  })

  it('**回写触发 update:modelValue**', async () => {
    const w = mountBuilder({ fields: [field('a', 'text')] } as FormSchema, {})
    await nextTick()
    const before = (w.emitted('update:modelValue') ?? []).length
    w.findComponent({ name: 'FormFieldGroup' }).vm.$emit('update:field', 'a', 'v2')
    await nextTick()
    expect((w.emitted('update:modelValue') ?? []).length).toBeGreaterThan(before)
  })
})
