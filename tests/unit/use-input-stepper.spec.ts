/**
 * useInputStepper — Input 数字步进模式（原 InputNumber）逻辑
 *
 * ## 为什么补（194 行，语句 33.7% / 分支 32.4% / 函数 31.6%，**零 spec 引用**）
 *
 * `grep useInputStepper tests/` 为空 —— 与上一轮做满的 useImageExport 同型：
 * 可注入 props（响应式对象）+ 注入 emit 的纯逻辑块，宿主 Input.vue 的重渲染依赖它。
 * 承接口径里最容易出错、且用户直接可感的几处：
 *
 * ① **精度口径**（`numPrecision` / `roundTo` / `clampRound`）—— 显式 precision 优先，
 *    否则从 `String(step)` 的小数位反推（0.5 → 1 位、0.25 → 2 位、整数 → 0 位）；
 *    `1e-7` 这种科学计数法**推不出小数位**（正则不匹配）→ 0 位，是已知边界。
 * ② **受控文本与外部值的同步**（watch 三条短路）—— 宿主重渲染会拿到新 props，
 *    三条短路决定「外部值变了要不要覆盖用户正在输入的文字」：
 *    非 number 类型不管 / 空文本+空值不动 / 文本已等于值不动。
 * ③ **长按连加**（400ms 首延迟 + 100ms 间隔 + 指针消费）—— `_pointerHandled`
 *    让「按下」与随后的「click」不重复加一次，这是移动端点按最常翻车的地方。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { reactive, nextTick } from 'vue'
import { useInputStepper } from '@/components/form/useInputStepper'

interface Props {
  type: string
  step: number
  precision?: number
  min?: number | null
  max?: number | null
  modelValue: unknown
  disabled: boolean
}

function mk(over: Partial<Props> = {}) {
  const props = reactive<Props>({
    type: 'number',
    step: 1,
    precision: undefined,
    min: null,
    max: null,
    modelValue: null,
    disabled: false,
    ...over,
  })
  const emit = vi.fn()
  const api = useInputStepper(props as never, { emit: emit as never })
  return { props, emit, api }
}

/** 取出某事件的载荷序列 */
const payloads = (emit: ReturnType<typeof vi.fn>, ev: string) =>
  emit.mock.calls.filter((c) => c[0] === ev).map((c) => c[1])

/** 构造 input 事件（宿主把原生 event 直接传进来） */
const inputEv = (value: string) => ({ target: { value } }) as unknown as Event

/** 构造 keydown / pointerdown 事件（happy-dom 未必有真 PointerEvent，用最小替身） */
const keyEv = (key: string) => {
  const e = { key, preventDefault: vi.fn() }
  return e as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> }
}
const ptrEv = () => ({ preventDefault: vi.fn() }) as unknown as PointerEvent & {
  preventDefault: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/* ═══════════ 精度口径 ═══════════ */

describe('numPrecision 精度推导', () => {
  it('**显式 precision 优先于 step 推导**', () => {
    const { api } = mk({ step: 0.5, precision: 3 })
    expect(api.numPrecision.value, 'step 本来推出 1 位，但显式给了 3').toBe(3)
  })

  it('**显式 precision 向下取整**（2.7 → 2）', () => {
    const { api } = mk({ precision: 2.7 })
    expect(api.numPrecision.value).toBe(2)
  })

  it('**显式 precision 负数被抬到 0**', () => {
    const { api } = mk({ precision: -3 })
    expect(api.numPrecision.value).toBe(0)
  })

  it('**无显式 precision：从 step 小数位反推**', () => {
    expect(mk({ step: 0.5 }).api.numPrecision.value, '0.5 → 1 位').toBe(1)
    expect(mk({ step: 0.25 }).api.numPrecision.value, '0.25 → 2 位').toBe(2)
    expect(mk({ step: 0.001 }).api.numPrecision.value, '0.001 → 3 位').toBe(3)
    expect(mk({ step: 1 }).api.numPrecision.value, '整数 → 0 位').toBe(0)
    expect(mk({ step: 10 }).api.numPrecision.value, '整数 → 0 位').toBe(0)
  })

  it('**科学计数法 step 推不出小数位 → 0**（`1e-7` 的字符串无 .数字 结尾）', () => {
    // String(1e-7) === '1e-7'，正则 /\.(\d+)$/ 不匹配 → 回退 0 位（已知边界）
    const { api } = mk({ step: 1e-7 })
    expect(api.numPrecision.value).toBe(0)
  })

  it('**精度随 props.step 响应式变化**（宿主重渲染读最新值）', async () => {
    const { api, props } = mk({ step: 1 })
    expect(api.numPrecision.value).toBe(0)
    props.step = 0.125
    await nextTick()
    expect(api.numPrecision.value).toBe(3)
  })
})

/* ═══════════ displayNum ═══════════ */

describe('displayNum 文本化', () => {
  it('**null / undefined / 非有限值 → 空串**', () => {
    const { api } = mk()
    expect(api.displayNum(null)).toBe('')
    expect(api.displayNum(undefined)).toBe('')
    expect(api.displayNum(NaN)).toBe('')
    expect(api.displayNum(Infinity)).toBe('')
    expect(api.displayNum(-Infinity)).toBe('')
  })

  it('**机制证明：null/undefined 本就是 Number.isFinite 假**（故 v===null 那半是冗余判断）', () => {
    // 这条断言把 displayNum 里 `v === null` 为何「删掉也不改变行为」钉死：
    // Number.isFinite 不做强制转换 → null/undefined 都不是有限数 → 后面的
    // !Number.isFinite(v) 已经把它们兜住。属可清理的冗余，不是缺陷。
    expect(Number.isFinite(null), 'null 不是有限数').toBe(false)
    expect(Number.isFinite(undefined), 'undefined 不是有限数').toBe(false)
    expect(Number.isFinite(NaN)).toBe(false)
    // 反面对照：真正需要显式判断的是字符串等会被强转的值
    expect(Number.isFinite('5' as never), '字符串不被强转').toBe(false)
    expect(Number.isFinite(Number('5')), '显式强转后才是有限').toBe(true)
  })

  it('**有限数值 → String(v)**（0 与负数不算空）', () => {
    const { api } = mk()
    expect(api.displayNum(0), '0 必须成 "0" 而不是空串').toBe('0')
    expect(api.displayNum(-5)).toBe('-5')
    expect(api.displayNum(1.5)).toBe('1.5')
  })
})

/* ═══════════ 受控文本同步（watch） ═══════════ */

describe('numText 与 modelValue 同步', () => {
  it('**immediate：建实例就把初值写进 numText**', () => {
    const { api } = mk({ modelValue: 5 })
    expect(api.numText.value).toBe('5')
  })

  it('**非 number 类型不同步**（type=text 时不管 modelValue）', () => {
    const { api } = mk({ type: 'text', modelValue: 5 })
    expect(api.numText.value, 'text 类型不接管文本').toBe('')
  })

  it('**空文本 + 空值不覆盖**（用户已清空，外部值也是空 → 不动）', () => {
    const { api, props } = mk({ modelValue: null })
    api.numText.value = ''
    props.modelValue = undefined
    return nextTick().then(() => {
      expect(api.numText.value).toBe('')
    })
  })

  it('**文本已等于外部值时不覆盖**（保住用户敲的原始格式）', async () => {
    // ⚠️ 必须让 modelValue **真的变化**，否则 watcher 不会触发，测不到这条短路：
    // 先把外部值设 4（immediate 写 '4'），用户手动改成 '5.0'，再把外部值推到 5。
    // 此刻 v 由 4 → 5，watcher 触发；parsed=5 与 v=5 相等 → 短路返回 → 文本保住 '5.0'。
    const { api, props } = mk({ modelValue: 4 })
    expect(api.numText.value).toBe('4')
    api.numText.value = '5.0'
    props.modelValue = 5
    await nextTick()
    expect(api.numText.value, '数值相等即不动文本，保住用户敲的 "5.0"').toBe('5.0')
  })

  it('**外部值变化时覆盖文本**', async () => {
    const { api, props } = mk({ modelValue: 5 })
    expect(api.numText.value).toBe('5')
    props.modelValue = 7
    await nextTick()
    expect(api.numText.value).toBe('7')
  })

  it('**机制证明：空文本 + 空值这条短路是幂等的**（删掉后赋值结果相同）', () => {
    // 短路体是 `numText.value === '' && (v === null || v === undefined)` → return。
    // 若删掉该短路，代码会继续执行 displayNum(null) === '' 并写回 numText，
    // 而 numText 已是 '' → **赋值幂等**，观察不到差异。属冗余保护。
    const { api } = mk()
    api.numText.value = ''
    // 两条路径的终值相同：displayNum(null) 与 displayNum(undefined) 都是 ''
    expect(api.displayNum(null)).toBe('')
    expect(api.displayNum(undefined)).toBe('')
    expect(api.numText.value).toBe('')
  })

  it('**外部值变成 null → 文本清空**', async () => {
    const { api, props } = mk({ modelValue: 5 })
    props.modelValue = null
    await nextTick()
    expect(api.numText.value).toBe('')
  })

  it('**数值不等时覆盖**（文本 5、外部 5.5 → 覆盖成 "5.5"）', async () => {
    const { api, props } = mk({ modelValue: 5 })
    props.modelValue = 5.5
    await nextTick()
    expect(api.numText.value).toBe('5.5')
  })
})

/* ═══════════ onNumInput ═══════════ */

describe('onNumInput 输入', () => {
  it('**合法数字：写入文本 + 发 update/change**', () => {
    const { api, emit } = mk()
    api.onNumInput(inputEv('12'))
    expect(api.numText.value).toBe('12')
    expect(payloads(emit, 'update:modelValue')).toEqual([12])
    expect(payloads(emit, 'change')).toEqual([12])
  })

  it('**负数与小数都合法**', () => {
    const { api, emit } = mk()
    api.onNumInput(inputEv('-3.5'))
    expect(api.numText.value).toBe('-3.5')
    expect(payloads(emit, 'change')).toEqual([-3.5])
  })

  it('**清空（空串）→ 文本空 + 发 null，且不发 change**', () => {
    const { api, emit } = mk()
    api.onNumInput(inputEv(''))
    expect(api.numText.value).toBe('')
    expect(payloads(emit, 'update:modelValue')).toEqual([null])
    expect(payloads(emit, 'change'), '清空不发 change（只有 commit 才发）').toEqual([])
  })

  it('**纯空白也算清空**（trim 判定）', () => {
    const { api, emit } = mk()
    api.onNumInput(inputEv('   '))
    expect(api.numText.value).toBe('')
    expect(payloads(emit, 'update:modelValue')).toEqual([null])
  })

  it('**非法字符：文本回填当前 modelValue，不发事件**', () => {
    const { api, emit } = mk({ modelValue: 5 })
    api.onNumInput(inputEv('abc'))
    expect(api.numText.value, '回填成 "5"').toBe('5')
    expect(emit, '完全不发事件').not.toHaveBeenCalled()
  })

  it('**中间态（"-" / "."）通过正则但不发事件**（Number 非有限）', () => {
    const { api, emit } = mk()
    api.onNumInput(inputEv('-'))
    expect(api.numText.value, '文本留着让用户继续敲').toBe('-')
    expect(emit).not.toHaveBeenCalled()

    api.onNumInput(inputEv('.'))
    expect(api.numText.value).toBe('.')
    expect(emit).not.toHaveBeenCalled()
  })

  it('**modelValue 为 null 时非法输入回填成空串**', () => {
    const { api } = mk({ modelValue: null })
    api.onNumInput(inputEv('x'))
    expect(api.numText.value).toBe('')
  })
})

/* ═══════════ commitNum ═══════════ */

describe('commitNum 提交', () => {
  it('**空文本 → 发 null 且 change 也带 null**', () => {
    const { api, emit } = mk({ modelValue: 5 })
    api.numText.value = ''
    api.commitNum()
    expect(payloads(emit, 'update:modelValue')).toEqual([null])
    expect(payloads(emit, 'change'), 'commit 与 input 的差别：change 也发').toEqual([null])
  })

  it('**纯空白也算空**（提交前 trim）', () => {
    const { api, emit } = mk()
    api.numText.value = '  '
    api.commitNum()
    expect(payloads(emit, 'change')).toEqual([null])
  })

  it('**非有限文本 → 回填 modelValue，不发事件**', () => {
    const { api, emit } = mk({ modelValue: 3 })
    api.numText.value = 'abc'
    api.commitNum()
    expect(api.numText.value).toBe('3')
    expect(emit).not.toHaveBeenCalled()
  })

  it('**提交按精度取整**（precision 0，输入 3.7 → 4）', () => {
    const { api, emit } = mk({ precision: 0 })
    api.numText.value = '3.7'
    api.commitNum()
    expect(api.numText.value, '文本被规范化成 "4"').toBe('4')
    expect(payloads(emit, 'change')).toEqual([4])
  })

  it('**提交夹下界**（min 0，输入 -100 → 0）', () => {
    const { api, emit } = mk({ min: 0 })
    api.numText.value = '-100'
    api.commitNum()
    expect(api.numText.value).toBe('0')
    expect(payloads(emit, 'update:modelValue')).toEqual([0])
  })

  it('**提交夹上界**（max 10，输入 100 → 10）', () => {
    const { api, emit } = mk({ max: 10 })
    api.numText.value = '100'
    api.commitNum()
    expect(api.numText.value).toBe('10')
    expect(payloads(emit, 'change')).toEqual([10])
  })

  it('**范围内不动**（min 0 / max 10，输入 5 → 5）', () => {
    const { api, emit } = mk({ min: 0, max: 10 })
    api.numText.value = '5'
    api.commitNum()
    expect(api.numText.value).toBe('5')
    expect(payloads(emit, 'change')).toEqual([5])
  })
})

/* ═══════════ clearNumValue ═══════════ */

describe('clearNumValue 清空', () => {
  it('**发 update null 且发无载荷的 clear**', () => {
    const { api, emit } = mk({ modelValue: 5 })
    api.clearNumValue()
    expect(payloads(emit, 'update:modelValue')).toEqual([null])
    const clearCall = emit.mock.calls.find((c) => c[0] === 'clear')
    expect(clearCall, 'clear 事件已发').toBeTruthy()
    expect(clearCall!.length, 'clear 不带载荷').toBe(1)
  })
})

/* ═══════════ stepBy（经 onBtnClick / 键盘） ═══════════ */

describe('stepBy 步进', () => {
  it('**加一步：值 +step，文本同步，发 update/change**', () => {
    const { api, emit } = mk({ modelValue: 5, step: 1 })
    api.onBtnClick(1)
    expect(api.numText.value).toBe('6')
    expect(payloads(emit, 'update:modelValue')).toEqual([6])
    expect(payloads(emit, 'change')).toEqual([6])
  })

  it('**减一步**', () => {
    const { api, emit } = mk({ modelValue: 5, step: 1 })
    api.onBtnClick(-1)
    expect(payloads(emit, 'change')).toEqual([4])
  })

  it('**step ≤ 0 时按 1 兜底**（step 0 与 step -2 都不动）', () => {
    const zero = mk({ modelValue: 5, step: 0 })
    zero.api.onBtnClick(1)
    expect(payloads(zero.emit, 'change'), 'step 0 → 用 1').toEqual([6])

    const neg = mk({ modelValue: 5, step: -2 })
    neg.api.onBtnClick(1)
    expect(payloads(neg.emit, 'change'), 'step -2 → 用 1').toEqual([6])
  })

  it('**modelValue 为 null 时基数为 0**', () => {
    const { api, emit } = mk({ modelValue: null, step: 1 })
    api.onBtnClick(1)
    expect(payloads(emit, 'change')).toEqual([1])
  })

  it('**小数步进按精度取整，避免浮点残渣**（precision 2，0.2 + 0.1）', () => {
    const { api, emit } = mk({ modelValue: 0.2, step: 0.1, precision: 2 })
    api.onBtnClick(1)
    expect(payloads(emit, 'change'), '不能是 0.30000000000000004').toEqual([0.3])
    expect(api.numText.value).toBe('0.3')
  })

  it('**步进结果被 min/max 夹住**', () => {
    const atMax = mk({ modelValue: 10, step: 1, max: 10 })
    atMax.api.onBtnClick(1)
    expect(payloads(atMax.emit, 'change'), '已到 max 不再涨').toEqual([10])

    const atMin = mk({ modelValue: 0, step: 1, min: 0 })
    atMin.api.onBtnClick(-1)
    expect(payloads(atMin.emit, 'change'), '已到 min 不再降').toEqual([0])
  })
})

/* ═══════════ onNumKeydown ═══════════ */

describe('onNumKeydown 键盘', () => {
  it('**disabled 时完全不动**（连 preventDefault 都不调）', () => {
    const { api, emit } = mk({ disabled: true, modelValue: 5 })
    const e = keyEv('ArrowUp')
    api.onNumKeydown(e)
    expect(e.preventDefault, 'disabled 不拦默认行为').not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })

  it('**ArrowUp：拦默认 + 加一步**', () => {
    const { api, emit } = mk({ modelValue: 5 })
    const e = keyEv('ArrowUp')
    api.onNumKeydown(e)
    expect(e.preventDefault).toHaveBeenCalledTimes(1)
    expect(payloads(emit, 'change')).toEqual([6])
  })

  it('**ArrowDown：拦默认 + 减一步**', () => {
    const { api, emit } = mk({ modelValue: 5 })
    const e = keyEv('ArrowDown')
    api.onNumKeydown(e)
    expect(e.preventDefault).toHaveBeenCalledTimes(1)
    expect(payloads(emit, 'change')).toEqual([4])
  })

  it('**Enter：拦默认 + 提交（走取整与夹取）**', () => {
    const { api, emit } = mk({ modelValue: 5, precision: 0, max: 10 })
    api.numText.value = '99.6'
    const e = keyEv('Enter')
    api.onNumKeydown(e)
    expect(e.preventDefault).toHaveBeenCalledTimes(1)
    expect(payloads(emit, 'change'), '100 被 max 夹到 10').toEqual([10])
  })

  it('**其它键不拦不响应**', () => {
    const { api, emit } = mk({ modelValue: 5 })
    const e = keyEv('a')
    api.onNumKeydown(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })
})

/* ═══════════ 长按连加 ═══════════ */

describe('长按连加（400ms 首延迟 + 100ms 间隔）', () => {
  const updateCalls = (emit: ReturnType<typeof vi.fn>) => payloads(emit, 'update:modelValue')

  it('**按下立即加一步、拦默认、并标记指针已处理**', () => {
    const { api, emit } = mk({ modelValue: 0, step: 1 })
    const e = ptrEv()
    api.onBtnDown(1, e)
    expect(e.preventDefault, '按下要拦默认（防选中/滚动）').toHaveBeenCalledTimes(1)
    expect(updateCalls(emit), '立即加一步').toHaveLength(1)
  })

  it('**400ms 后开始每 100ms 连加**', () => {
    const { api, emit } = mk({ modelValue: 0, step: 1 })
    api.onBtnDown(1, ptrEv())
    expect(updateCalls(emit)).toHaveLength(1)

    vi.advanceTimersByTime(399)
    expect(updateCalls(emit), '399ms 还没到首延迟').toHaveLength(1)

    vi.advanceTimersByTime(1) // 到 400ms：建 interval，本身不加
    expect(updateCalls(emit), '首延迟只负责建 interval').toHaveLength(1)

    vi.advanceTimersByTime(100)
    expect(updateCalls(emit), '第 1 次连加').toHaveLength(2)
    // 再走 300ms = 3 个 100ms tick → 共 1（按下）+ 1 + 3 = 5
    vi.advanceTimersByTime(300)
    expect(updateCalls(emit), '累计 5 次（按下 1 + tick 4）').toHaveLength(5)
  })

  it('**连加过程中变 disabled → 停表**（间隔回调里自查）', () => {
    const { api, emit, props } = mk({ modelValue: 0, step: 1 })
    api.onBtnDown(1, ptrEv())
    vi.advanceTimersByTime(400) // 建 interval
    vi.advanceTimersByTime(100)
    expect(updateCalls(emit)).toHaveLength(2)

    props.disabled = true
    vi.advanceTimersByTime(100)
    expect(updateCalls(emit), 'disabled 后不再加').toHaveLength(2)
    vi.advanceTimersByTime(1000)
    expect(updateCalls(emit), '表已清，后续都不加').toHaveLength(2)
  })

  it('**clearHold 同时清掉首延迟与间隔**', () => {
    const { api, emit } = mk({ modelValue: 0, step: 1 })
    api.onBtnDown(1, ptrEv())
    api.clearHold()
    vi.advanceTimersByTime(2000)
    expect(updateCalls(emit), '只保留按下那一次').toHaveLength(1)
  })

  it('**再次按下会先清旧表**（不会双表叠加）', () => {
    const { api, emit } = mk({ modelValue: 0, step: 1 })
    api.onBtnDown(1, ptrEv())
    vi.advanceTimersByTime(400) // 旧 interval 已建、尚未 tick
    api.onBtnDown(1, ptrEv()) // 第二次按下：先 clearHold 再建新表
    expect(updateCalls(emit), '按下两次 → 两次立即加').toHaveLength(2)
    vi.advanceTimersByTime(400)
    vi.advanceTimersByTime(100)
    // 旧表已清 → 只有新表 tick 一次
    expect(updateCalls(emit), '若旧表未被清会多出一次').toHaveLength(3)
  })

  it('**disabled 时按下直接返回**（不拦默认、不加、不建表）', () => {
    const { api, emit } = mk({ disabled: true, modelValue: 0 })
    const e = ptrEv()
    api.onBtnDown(1, e)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2000)
    expect(updateCalls(emit), '没有表可跑').toHaveLength(0)
  })
})

/* ═══════════ onBtnClick 与指针消费 ═══════════ */

describe('onBtnClick 与 _pointerHandled 消费', () => {
  it('**没有按下记录时 click 加一步**（键盘/无障碍触发路径）', () => {
    const { api, emit } = mk({ modelValue: 5 })
    api.onBtnClick(1)
    expect(payloads(emit, 'change')).toEqual([6])
  })

  it('**按下过的 click 被消费，不重复加**（移动端点按防双加）', () => {
    const { api, emit, props } = mk({ modelValue: 0, step: 1 })
    // 补上 v-model 回路：宿主把 update:modelValue 写回 props，
    // 否则 stepBy 的基数恒为初值，多次步进只会发同一个数（测不出累加）
    emit.mockImplementation((ev: string, v: unknown) => {
      if (ev === 'update:modelValue') props.modelValue = v
    })

    api.onBtnDown(1, ptrEv()) // 立即加一次 → 1
    api.onBtnClick(1) // 同一次手势的 click → 消费掉，不加
    expect(payloads(emit, 'change'), '总计只加一次').toEqual([1])

    // 消费是一次性的：再来一次 click 应正常加
    api.onBtnClick(1)
    expect(payloads(emit, 'change'), '第二次 click 正常加到 2').toEqual([1, 2])
  })

  it('**click 消费标记与方向无关**（先按下 +1 再 click -1 也被消费）', () => {
    const { api, emit } = mk({ modelValue: 0, step: 1 })
    api.onBtnDown(1, ptrEv())
    api.onBtnClick(-1)
    expect(payloads(emit, 'change'), '只保留按下那次 +1').toEqual([1])
  })
})

/* ═══════════ minusDisabled / plusDisabled ═══════════ */

describe('minusDisabled / plusDisabled 边界按钮禁用', () => {
  it('**minus：模型值 ≤ min 时禁用**', () => {
    expect(mk({ min: 0, modelValue: 0 }).api.minusDisabled.value, '等于 min → 禁').toBe(true)
    expect(mk({ min: 0, modelValue: -5 }).api.minusDisabled.value, '低于 min → 禁').toBe(true)
    expect(mk({ min: 0, modelValue: 1 }).api.minusDisabled.value, '高于 min → 不禁').toBe(false)
  })

  it('**minus：min 为 null 时永不禁用**', () => {
    expect(mk({ min: null, modelValue: -999 }).api.minusDisabled.value).toBe(false)
    expect(mk({ min: undefined, modelValue: 0 }).api.minusDisabled.value).toBe(false)
  })

  it('**plus：模型值 ≥ max 时禁用**', () => {
    expect(mk({ max: 10, modelValue: 10 }).api.plusDisabled.value, '等于 max → 禁').toBe(true)
    expect(mk({ max: 10, modelValue: 11 }).api.plusDisabled.value, '高于 max → 禁').toBe(true)
    expect(mk({ max: 10, modelValue: 9 }).api.plusDisabled.value, '低于 max → 不禁').toBe(false)
  })

  it('**plus：max 为 null 时永不禁用**', () => {
    expect(mk({ max: null, modelValue: 999 }).api.plusDisabled.value).toBe(false)
  })

  it('**modelValue 为 null 时按 0 参与比较**（min 0 → minus 禁；max 10 → plus 不禁）', () => {
    expect(mk({ min: 0, modelValue: null }).api.minusDisabled.value).toBe(true)
    expect(mk({ max: 10, modelValue: null }).api.plusDisabled.value).toBe(false)
  })

  it('**边界值随 props 变化响应式更新**', async () => {
    const { api, props } = mk({ max: 5, modelValue: 5 })
    expect(api.plusDisabled.value).toBe(true)
    props.max = 10
    await nextTick()
    expect(api.plusDisabled.value, 'max 抬高后解禁').toBe(false)
  })
})

/* ═══════════ 返回值契约 ═══════════ */

describe('返回值契约', () => {
  it('**暴露 12 项**（宿主 Input.vue 按名解构）', () => {
    const { api } = mk()
    expect(Object.keys(api).sort()).toEqual(
      [
        'clearHold',
        'clearNumValue',
        'commitNum',
        'displayNum',
        'minusDisabled',
        'numPrecision',
        'numText',
        'onBtnClick',
        'onBtnDown',
        'onNumInput',
        'onNumKeydown',
        'plusDisabled',
      ].sort(),
    )
  })
})