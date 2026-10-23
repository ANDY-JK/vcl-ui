/**
 * to-schema 映射表全覆盖：props / 类型专属 / 条件 / 联动 / 数据源 / 校验
 *
 * ## 为什么补
 *
 * `toFormSchema` 是一张**又长又平的映射表**（390 行里 260 行是 `if (f.x) base.y = ...`），
 * 已有三个 spec 只钉住了三件事：容器归属不丢、缺 key 的兜底、布局字段不参与收集。
 * 剩下整张表——数值 props、upload/scan-code 的类型专属属性、条件必填/禁用、
 * linkage 的依赖提取、onChange/onBlur/onFocus 三类事件、四种数据源、
 * 以及**校验规则（含内置手机号/邮箱/身份证/URL 与非法正则兜底）**——一行都没测。
 *
 * 这类「平铺映射」最典型的缺陷不是崩，而是**某个属性被静默漏掉**：
 * 设计器里配了「最大长度 20」，导出 schema 里没有，运行时就不校验了，
 * 而且没有任何报错。所以本 spec 的断言口径是「**配了什么就必须在下发结果里找得到**」，
 * 逐条对着源码的映射语句来，不做抽样。
 *
 * ## 校验规则的特殊性
 *
 * `base.rules` 是**函数数组**，所以不能只断言 `length`——必须真的调用它、
 * 断言返回的文案。这样连「规则挂了但判断写反了」也能抓到（例如 `<` 写成 `<=`）。
 */
import { describe, it, expect } from 'vitest'
import { toFormSchema, migrateFieldsToNodes, parseCascaderOptions, getTypeLabel, getTypeIcon } from '@/components/form-builder/designer/types/to-schema'
import * as registry from '@/components/form-builder/fieldRegistry'
import type { DesignerNode } from '@/components/form-builder/designer/types/domain'
import type { FormField } from '@/components/form-builder/types'

/** 构造一个字段节点（cast 掉类型面，这里只关心映射） */
function node(over: Record<string, unknown>): DesignerNode {
  return { id: 'n1', type: 'text', label: '字段', key: 'k', ...over } as unknown as DesignerNode
}

/** 单节点 → 单个 FormField */
function one(over: Record<string, unknown>): FormField {
  return toFormSchema([node(over)]).fields![0]!
}

const props = (over: Record<string, unknown>) => (one(over).props ?? {}) as Record<string, unknown>

/** 跑一条规则并取文案（用于校验规则） */
function ruleText(field: FormField, idx: number, value: string): string | undefined {
  const rules = field.rules
  expect(rules, '应有 rules').toBeTruthy()
  const fn = rules![idx]
  expect(fn, `应存在第 ${idx} 条规则`).toBeTypeOf('function')
  return fn!(value)
}

/* ═══════════ 数值 / 文本属性 ═══════════ */

describe('props：数值与文本属性', () => {
  it('**min / max / step 都下发**', () => {
    expect(props({ min: 1, max: 9, step: 2 })).toMatchObject({ min: 1, max: 9, step: 2 })
  })

  it('**多个 props 属性互不覆盖**（每次展开合并，写错顺序就会丢）', () => {
    const p = props({ min: 0, max: 10, step: 5, icon: 'user', suffixText: '元', rows: 4 })
    expect(p).toMatchObject({ min: 0, max: 10, step: 5, icon: 'user', suffix: '元', rows: 4 })
  })

  it('**maxLength > 0 下发，= 0 不下发**（maxlength="0" 会让输入框完全无法输入）', () => {
    expect(props({ maxLength: 20 }).maxlength).toBe(20)
    expect(props({ maxLength: 0 }), '0 视为未设置').not.toHaveProperty('maxlength')
  })

  it('**rows（textarea 行数）下发**', () => {
    expect(props({ type: 'textarea', rows: 6 }).rows).toBe(6)
  })

  it('**rate 的 max 与 allowHalf 映射到 rateMax / allowHalf**（键名不同，最容易写反）', () => {
    expect(props({ type: 'rate', rateMax: 10, rateAllowHalf: true })).toMatchObject({
      rateMax: 10,
      allowHalf: true,
    })
  })

  it('**不传可选属性时 props 为空**（不能凭空多出键）', () => {
    expect(one({}).props, '什么都没配 → 无 props').toBeUndefined()
  })
})

/* ═══════════ 类型专属属性 ═══════════ */

describe('类型专属：cascader / upload / scan-code', () => {
  it('**cascader 合法 JSON → 解析成 cascaderOptions**', () => {
    const opts = [{ value: 'z', label: '浙江', children: [{ value: 'h', label: '杭州' }] }]
    expect(one({ type: 'cascader', cascaderOptions: JSON.stringify(opts) }).cascaderOptions).toEqual(opts)
  })

  it('**cascader 非法 JSON → 不下发且不抛**（设计器里手改坏了不能让导出崩）', () => {
    expect(() => one({ type: 'cascader', cascaderOptions: '{坏' })).not.toThrow()
    expect(one({ type: 'cascader', cascaderOptions: '{坏' }).cascaderOptions).toBeUndefined()
  })

  it('**upload：accept / multiple / maxSize 都进 props**', () => {
    expect(props({ type: 'upload', accept: '.pdf', multiple: true, maxSize: 5 })).toMatchObject({
      accept: '.pdf',
      multiple: true,
      maxSize: 5,
    })
  })

  it('**upload：multiple=false 也要下发**（用 !== undefined 判，不是真值判）', () => {
    expect(props({ type: 'upload', multiple: false })).toHaveProperty('multiple', false)
  })

  it('**upload 且 accept=image/* → 类型改写为 image-upload**（渲染端靠它选缩略图模式）', () => {
    expect(one({ type: 'upload', accept: 'image/*' }).type).toBe('image-upload')
  })

  it('**upload 其它 accept 不改类型**', () => {
    expect(one({ type: 'upload', accept: '.xlsx' }).type).toBe('upload')
  })

  it('**scan-code：scanFormats 非 all 才下发**（all 是默认值，下发等于冗余传参）', () => {
    expect(props({ type: 'scan-code', scanFormats: 'qr_code' }).scanFormats).toBe('qr_code')
    expect(props({ type: 'scan-code', scanFormats: 'all' }), 'all 不下发').not.toHaveProperty('scanFormats')
  })

  it('**scan-code：scanLength > 0 才下发，0 不下发**', () => {
    expect(props({ type: 'scan-code', scanLength: 13 }).scanLength).toBe(13)
    expect(props({ type: 'scan-code', scanLength: 0 })).not.toHaveProperty('scanLength')
  })

  it('**scan-code：scanPrefix 下发**', () => {
    expect(props({ type: 'scan-code', scanPrefix: 'SKU-' }).scanPrefix).toBe('SKU-')
  })
})

/* ═══════════ 条件显示 / 必填 / 禁用 ═══════════ */

describe('条件：visibleWhen / requiredWhen / disabledWhen', () => {
  it('**visibleWhen 映射三件套**', () => {
    expect(one({ visibleWhenField: 'type', visibleWhenValue: 'A', visibleWhenNot: true }).visibleWhen).toEqual({
      field: 'type',
      equals: 'A',
      not: true,
    })
  })

  it('**visibleWhen 无 not 时不带 not 键**（带 false 会让运行时读成「取反」）', () => {
    expect(one({ visibleWhenField: 'type', visibleWhenValue: 'A' }).visibleWhen).not.toHaveProperty('not')
  })

  it('**visibleWhenValue 缺省为空串**（equals undefined 会让 looseEquals 全不匹配）', () => {
    expect(one({ visibleWhenField: 'type' }).visibleWhen?.equals).toBe('')
  })

  it('**requiredWhen 与 disabledWhen 各自独立映射**（同一个循环表驱动，容易只处理一半）', () => {
    const f = one({
      requiredWhenField: 'a',
      requiredWhenValue: '1',
      disabledWhenField: 'b',
      disabledWhenValue: '2',
      disabledWhenNot: true,
    })
    expect(f.requiredWhen).toEqual({ field: 'a', equals: '1' })
    expect(f.disabledWhen).toEqual({ field: 'b', equals: '2', not: true })
  })

  it('**只配 requiredWhen 时 disabledWhen 不出现，且 equals 兜底空串**', () => {
    const f = one({ requiredWhenField: 'a' })
    expect(f.requiredWhen).toBeTruthy()
    expect(f.requiredWhen?.equals, 'undefined 会让 looseEquals 全不匹配').toBe('')
    expect(f.disabledWhen).toBeUndefined()
  })
})

/* ═══════════ 级联选项选项表 ═══════════ */

describe('optionsMap：依赖值 → 选项表', () => {
  const build = (optionsMap: string, optionsFrom = 'province') =>
    one({ optionsFrom, optionsMap })

  it('**多行解析成 map**', () => {
    expect(build('浙江=杭州,宁波\n江苏=南京').optionsMap).toEqual({
      浙江: ['杭州', '宁波'],
      江苏: ['南京'],
    })
  })

  it('**缺等号的行被跳过**（脏数据不能让整表解析出错）', () => {
    expect(build('这一行没有等号\n浙江=杭州').optionsMap).toEqual({ 浙江: ['杭州'] })
  })

  it('**等号在行首（key 为空）的行被跳过**', () => {
    expect(build('=杭州').optionsMap, 'map 为空时整个 optionsMap 不下发').toBeUndefined()
  })

  it('**选项为空（等号右边全空白）的行被跳过**', () => {
    expect(build('浙江=  ').optionsMap).toBeUndefined()
  })

  it('**支持中英文逗号与分号混用分隔**', () => {
    expect(build('A=1，2;3；4').optionsMap).toEqual({ A: ['1', '2', '3', '4'] })
  })

  it('**没有 optionsFrom 时整段不生效**（缺依赖字段的级联表是无意义的）', () => {
    expect(one({ optionsMap: 'A=1' }).optionsMap).toBeUndefined()
  })

  it('**optionsMap 为空串时不生效**', () => {
    expect(one({ optionsFrom: 'p', optionsMap: '   ' }).optionsMap).toBeUndefined()
  })

  it('**optionsFrom 一并下发**', () => {
    expect(build('A=1').optionsFrom).toBe('province')
  })
})

/* ═══════════ 联动与事件 ═══════════ */

describe('联动（linkage）与事件动作（events）', () => {
  it('**linkage 从公式提取依赖字段**', () => {
    const f = one({
      eventConfig: { linkageType: 'formula', linkageFormula: '{{price}} * {{qty}}' },
    })
    expect(f.linkage).toMatchObject({ type: 'formula', formula: '{{price}} * {{qty}}' })
    expect(f.linkage?.dependsOn, '依赖去重后按出现顺序').toEqual(['price', 'qty'])
  })

  it('**公式无占位符时不带 dependsOn 键**', () => {
    expect(one({ eventConfig: { linkageType: 'formula', linkageFormula: '1 + 1' } }).linkage).not.toHaveProperty(
      'dependsOn',
    )
  })

  it('**linkageType=none 时不生成 linkage**', () => {
    expect(one({ eventConfig: { linkageType: 'none', linkageFormula: '{{a}}' } }).linkage).toBeUndefined()
  })

  it('**linkage 无公式时不生成**（半配置状态直接忽略）', () => {
    expect(one({ eventConfig: { linkageType: 'formula' } }).linkage).toBeUndefined()
  })

  it('**onChange 带 targetField 时写进 linkage**（followValue/showHide 都靠它）', () => {
    const f = one({
      eventConfig: {
        linkageType: 'followValue',
        linkageFormula: '{{a}}',
        onChange: { enabled: true, action: 'setValue', targetField: 'b' },
      },
    })
    expect(f.linkage?.targetField).toBe('b')
  })

  it('**events.onChange 映射 action / targetField / apiUrl**', () => {
    const f = one({
      eventConfig: { onChange: { enabled: true, action: 'callApi', targetField: 't', apiUrl: '/x' } },
    })
    expect(f.events?.onChange).toEqual({ action: 'callApi', targetField: 't', apiUrl: '/x' })
  })

  it('**events.onBlur / onFocus 只带 action**', () => {
    const f = one({
      eventConfig: {
        onBlur: { enabled: true, action: 'validate' },
        onFocus: { enabled: true, action: 'tip' },
      },
    })
    expect(f.events?.onBlur).toEqual({ action: 'validate' })
    expect(f.events?.onFocus).toEqual({ action: 'tip' })
    expect(f.events?.onChange, 'onChange 未配 → 不该出现').toBeUndefined()
  })

  it('**三类事件同时配置时合并进同一个 events**（展开合并写错会只剩最后一个）', () => {
    const f = one({
      eventConfig: {
        onChange: { enabled: true, action: 'a' },
        onBlur: { enabled: true, action: 'b' },
        onFocus: { enabled: true, action: 'c' },
      },
    })
    expect(Object.keys(f.events ?? {}).sort()).toEqual(['onBlur', 'onChange', 'onFocus'])
  })

  it('**enabled=false 的事件不下发**（设计器里配过但关掉了）', () => {
    const f = one({
      eventConfig: {
        onChange: { enabled: false, action: 'a' },
        onBlur: { enabled: false, action: 'b' },
        onFocus: { enabled: false, action: 'c' },
      },
    })
    expect(f.events).toBeUndefined()
  })

  it('**enabled=true 但无 action 的事件不下发**（空动作无意义）', () => {
    expect(one({ eventConfig: { onChange: { enabled: true } } }).events).toBeUndefined()
  })
})

/* ═══════════ 数据源 ═══════════ */

describe('dataSource：四种来源', () => {
  it('**api + apiUrl → 带全部可选字段**', () => {
    const f = one({
      dataConfig: {
        sourceType: 'api',
        apiUrl: '/api/list',
        labelField: 'name',
        valueField: 'id',
        linkageField: 'pid',
        cacheData: true,
      },
    })
    expect(f.dataSource).toEqual({
      type: 'api',
      apiUrl: '/api/list',
      labelField: 'name',
      valueField: 'id',
      linkageField: 'pid',
      cacheData: true,
    })
  })

  it('**api 缺 apiUrl 时不生成**（运行时空请求比不生成更糟）', () => {
    expect(one({ dataConfig: { sourceType: 'api' } }).dataSource).toBeUndefined()
  })

  it('**userList / deptList / database 统一降级为 static**（库内不内置实体数据，但不能静默丢配置）', () => {
    for (const sourceType of ['userList', 'deptList', 'database']) {
      expect(one({ dataConfig: { sourceType } }).dataSource, sourceType).toEqual({ type: 'static' })
    }
  })

  it('**sourceType=static 不生成 dataSource**（默认值无需下发）', () => {
    expect(one({ dataConfig: { sourceType: 'static' } }).dataSource).toBeUndefined()
  })
})

/* ═══════════ 高级字段属性 ═══════════ */

describe('高级字段属性透传', () => {
  it('**subform / matrix 的列行配置进 props**', () => {
    expect(props({ subformColumns: [{ key: 'a' }], matrixRows: ['r1'], matrixCols: ['c1'] })).toMatchObject({
      subformColumns: [{ key: 'a' }],
      matrixRows: ['r1'],
      matrixCols: ['c1'],
    })
  })

  it('**addressDetail=false 也要下发**（用 !== undefined 判，不是真值判）', () => {
    expect(props({ type: 'address', addressDetail: false })).toHaveProperty('addressDetail', false)
  })

  it('**idcardTypes / serialPrefix / serialDateFormat / relateEntityType 进 props**', () => {
    expect(
      props({
        idcardTypes: ['idcard'],
        serialPrefix: 'SO',
        serialDateFormat: 'yyyyMM',
        relateEntityType: 'customer',
      }),
    ).toMatchObject({
      idcardTypes: ['idcard'],
      serialPrefix: 'SO',
      serialDateFormat: 'yyyyMM',
      relateEntityType: 'customer',
    })
  })

  it('**richtextToolbar 进 props**', () => {
    expect(props({ richtextToolbar: ['bold'] }).richtextToolbar).toEqual(['bold'])
  })

  it('**styleConfig 整体透传**（FormRenderer 读里面的 size/radius 等）', () => {
    const cfg = { size: 'sm', radius: 8, customClass: 'x' }
    expect(props({ styleConfig: cfg }).styleConfig).toEqual(cfg)
  })
})

/* ═══════════ 校验规则 ═══════════ */

describe('校验规则：长短限制与自定义正则', () => {
  it('**minLength 规则真的拦住过短输入**', () => {
    const f = one({ validation: { minLength: 3 } })
    expect(ruleText(f, 0, 'ab')).toBe('至少 3 个字符')
    expect(ruleText(f, 0, 'abc'), '刚好等于下限应通过').toBeUndefined()
  })

  it('**maxLength 规则真的拦住过长输入**', () => {
    const f = one({ validation: { maxLength: 2 } })
    expect(ruleText(f, 0, 'abc')).toBe('最多 2 个字符')
    expect(ruleText(f, 0, 'ab')).toBeUndefined()
  })

  it('**minLength / maxLength = 0 视为未设置**', () => {
    expect(one({ validation: { minLength: 0, maxLength: 0 } }).rules, '都不加规则').toBeUndefined()
  })

  it('**pattern 命中通过、不命中给自定义文案**', () => {
    const f = one({ validation: { pattern: '^\\d+$', patternMessage: '只能数字' } })
    expect(ruleText(f, 0, '123')).toBeUndefined()
    expect(ruleText(f, 0, 'abc')).toBe('只能数字')
  })

  it('**pattern 无自定义文案时用默认文案**', () => {
    const f = one({ validation: { pattern: '^\\d+$' } })
    expect(ruleText(f, 0, 'abc')).toBe('格式不正确')
  })

  it('**非法正则不抛异常且不加规则**（设计器里能输任意字符串）', () => {
    expect(() => one({ validation: { pattern: '([' } })).not.toThrow()
    expect(one({ validation: { pattern: '([' } }).rules).toBeUndefined()
  })

  it('**minLength + pattern 两条规则按顺序共存**', () => {
    const f = one({ validation: { minLength: 2, pattern: '^\\d+$' } })
    expect(f.rules!.length, '应两条').toBe(2)
    expect(ruleText(f, 0, '1')).toBe('至少 2 个字符')
    expect(ruleText(f, 1, 'ab')).toBe('格式不正确')
  })
})

describe('校验规则：内置类型', () => {
  it('**phone：11 位手机号通过，乱码不通过**', () => {
    const f = one({ validation: { builtinType: 'phone' } })
    expect(ruleText(f, 0, '13800138000')).toBeUndefined()
    expect(ruleText(f, 0, '123')).toBe('请输入正确的手机号')
  })

  it('**email：合法通过、非法不通过**', () => {
    const f = one({ validation: { builtinType: 'email' } })
    expect(ruleText(f, 0, 'a@b.com')).toBeUndefined()
    expect(ruleText(f, 0, 'a@')).toBe('请输入正确的邮箱')
  })

  it('**idcard：18 位通过、位数不对不通过**', () => {
    const f = one({ validation: { builtinType: 'idcard' } })
    expect(ruleText(f, 0, '110101199003074512'), '合法身份证').toBeUndefined()
    expect(ruleText(f, 0, '11010119900307')).toBe('请输入正确的身份证号')
  })

  it('**url：带协议通过、裸串不通过**', () => {
    const f = one({ validation: { builtinType: 'url' } })
    expect(ruleText(f, 0, 'https://a.com')).toBeUndefined()
    expect(ruleText(f, 0, 'not-a-url')).toBe('请输入正确的 URL')
  })

  it('**未知 builtinType 不加规则**（注册表查不到就静默跳过，不能崩）', () => {
    expect(one({ validation: { builtinType: 'unknown-kind' as never } }).rules).toBeUndefined()
  })

  it('**trim=true 不产生规则**（trim 在 FormBuilder 层处理）', () => {
    expect(one({ validation: { trim: true } }).rules).toBeUndefined()
  })
})

describe('校验规则：高级字段专项（走 props 而非 rules）', () => {
  it('**richtextMinChars / matrixMinRows / signatureRequired 进 props**', () => {
    expect(
      props({ validation: { richtextMinChars: 50, matrixMinRows: 2, signatureRequired: true } }),
    ).toMatchObject({ richtextMinChars: 50, matrixMinRows: 2, signatureRequired: true })
  })

  it('**richtextMinChars <= 0 都不下发**', () => {
    expect(props({ validation: { richtextMinChars: 0 } })).not.toHaveProperty('richtextMinChars')
    expect(props({ validation: { richtextMinChars: -1 } }), '负数也拦').not.toHaveProperty('richtextMinChars')
  })

  it('**无 validation 时既无 rules 也无这些 props**', () => {
    const f = one({})
    expect(f.rules).toBeUndefined()
    expect(f.props).toBeUndefined()
  })
})

/* ═══════════ 其余映射与工具函数 ═══════════ */

describe('默认值映射', () => {
  it('**静态 defaultValue → default**', () => {
    expect(one({ defaultValue: 'hello' }).default).toBe('hello')
  })

  it('**defaultType=currentTime / currentUser → defaultMeta**', () => {
    expect(one({ dataConfig: { defaultType: 'currentTime' } }).defaultMeta).toEqual({ type: 'currentTime' })
    expect(one({ dataConfig: { defaultType: 'currentUser' } }).defaultMeta).toEqual({ type: 'currentUser' })
  })

  it('**defaultType=formula 带公式才下发**', () => {
    expect(one({ dataConfig: { defaultType: 'formula', defaultFormula: '1+1' } }).defaultMeta).toEqual({
      type: 'formula',
      formula: '1+1',
    })
    expect(one({ dataConfig: { defaultType: 'formula' } }).defaultMeta).toBeUndefined()
  })

  it('**defaultType=api 带 apiUrl 才下发，可选 dataPath**', () => {
    expect(
      one({ dataConfig: { defaultType: 'api', defaultApiUrl: '/x', defaultApiDataPath: 'data.v' } }).defaultMeta,
    ).toEqual({ type: 'api', apiUrl: '/x', dataPath: 'data.v' })
    expect(one({ dataConfig: { defaultType: 'api' } }).defaultMeta).toBeUndefined()
  })

  it('**options 字符串数组 → {value,label} 对象数组**', () => {
    expect(one({ options: ['甲', '乙'] }).options).toEqual([
      { value: '甲', label: '甲' },
      { value: '乙', label: '乙' },
    ])
  })

  it('**空 options 不下发**', () => {
    expect(one({ options: [] }).options).toBeUndefined()
  })
})

describe('meta 透传与其它导出', () => {
  it('**meta 全字段透传**', () => {
    const schema = toFormSchema([node({})], {
      title: 'T',
      description: 'D',
      submitText: '提交',
      resetText: '重置',
      layout: 'columns',
      columns: 3,
      hideActions: true,
      validateOnChange: true,
      submitMode: 'auto',
      clearAfterSubmit: true,
      labelPosition: 'top',
      labelWidth: 88,
    })
    expect(schema).toMatchObject({
      title: 'T',
      description: 'D',
      submitText: '提交',
      resetText: '重置',
      layout: 'columns',
      columns: 3,
      hideActions: true,
      validateOnChange: true,
      submitMode: 'auto',
      clearAfterSubmit: true,
      labelPosition: 'top',
      labelWidth: 88,
    })
  })

  it('**无 meta 时 layout 兜底 single**', () => {
    expect(toFormSchema([]).layout).toBe('single')
  })

  it('**migrateFieldsToNodes：已含容器时原样返回同一数组**（幂等，避免二次迁移打乱树）', () => {
    const nodes = [node({ type: 'card', isContainer: true, children: [node({ id: 'c1' })] })]
    expect(migrateFieldsToNodes(nodes)).toBe(nodes)
  })

  it('**migrateFieldsToNodes：纯平铺时逐项浅拷贝**（不改调用方数据）', () => {
    const flat = [node({ id: 'a' }), node({ id: 'b' })]
    const out = migrateFieldsToNodes(flat)
    expect(out).toHaveLength(2)
    expect(out[0]).not.toBe(flat[0])
    expect(out[0]).toMatchObject({ id: 'a' })
  })

  it('**parseCascaderOptions：空 / 非数组 → null，合法 → 数组**', () => {
    expect(parseCascaderOptions('')).toBeNull()
    expect(parseCascaderOptions(undefined)).toBeNull()
    expect(parseCascaderOptions('{"a":1}')).toBeNull()
    expect(parseCascaderOptions('[1,2]')).toEqual([1, 2])
    expect(parseCascaderOptions('坏')).toBeNull()
  })

  it('**getTypeLabel / getTypeIcon 委托 fieldRegistry**（单一真源，不许各存一份）', () => {
    expect(getTypeLabel('text')).toBe(registry.getTypeLabel('text'))
    expect(getTypeIcon('text')).toBe(registry.getTypeIcon('text'))
  })
})
