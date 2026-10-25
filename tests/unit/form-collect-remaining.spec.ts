/**
 * FormCollect.vue 剩余分支 — 分享复制 / 新建清空 / 审核提交 / 批量清除 / Excel 导出
 *
 * ## 为什么补（783 行，语句 80.3% / 分支 56.8% / 函数 78.4%，74 行未覆盖）
 *
 * 既有 5 个 spec 覆盖了「记录提交/统计/列表/搜索/导入」，但**分支只有 56.8%**，
 * 下列用户可感操作整块为空：
 *
 * ① **分享复制**（`copyShareLink` / `copyShareCode`）——`copyText` 有成功/失败两条
 *    反馈路径（文案与提示类型都不同）。用户复制失败却看到「已复制」是最典型的假反馈。
 * ② **新建记录**（`startNewRecord`）——清空表单数据 + 清空两条消息 + 平滑滚回填写区。
 *    残留旧值会让用户把上一条的数据提交成新记录。
 * ③ **审核提交**（`handleRecordSubmit`）——有 `store.updateRecord` 时原地更新；
 *    **没有时降级为「删 + 增」**（源码注释承认重插后该记录排到列表顶部、无法保持原位）。
 * ④ **批量清除**（`clearRecords` + `onConfirmClear`）——与单条删除**共用同一个确认弹窗**，
 *    靠 `pendingDeleteId` 分流：有 id 删一条、无 id 清全部。分流错了会删光用户数据。
 * ⑤ **Excel 导出**（`exportExcel`）——空记录时不导出（提示而非生成空表）；否则按
 *    `exportColumns` 或 `fields`（**过滤掉布局字段**）生成表头，并把数组/布尔/空值
 *    分别转成「逗号串 / 是-否 / 空串」；导出后 okMsg 有 3000ms 自动消失。
 *
 * ## 写法纪律（首版 21/40，19 条被探针判为存活后重写）
 *
 * 首版大量使用 `if (btn) { ... }`、`if (captured.length > 0) { ... }` 这类**条件化断言**，
 * 找不到元素/没拿到数据时**静默跳过断言**——用例永远绿，变异体当然也杀不掉。
 * 重写后：所有定位都 `expect(...)` 硬失败，所有断言都在**无条件下**执行，
 * 文案用 `useT()` 取精确值（不硬编码、不用子串正则）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import FormCollect from '@/components/form-builder/FormCollect.vue'
import { useT } from '@/components/_internal/i18n'
import type { FormStore, CollectRecord } from '@/components/form-builder/designer/types'

const t = useT()

const fields = [
  { id: 'f1', type: 'text' as const, label: '姓名', key: 'name', required: true },
  { id: 'f2', type: 'number' as const, label: '年龄', key: 'age' },
]
/** 含布局字段：导出时应被过滤掉 */
const fieldsWithLayout = [...fields, { id: 'f3', type: 'divider' as const, label: '分隔线' }]

/** 内存版 FormStore（可选注入 updateRecord 以测「原地更新」分支） */
function memoryStore(
  initial: CollectRecord[] = [],
  opts: { withUpdate?: boolean; failUpdate?: boolean } = {},
): FormStore & { records: CollectRecord[]; loadCalls: number } {
  const records = [...initial]
  const store = {
    records,
    loadCalls: 0,
    listForms: () => [],
    loadForm: () => null,
    saveForm: (_id: string | null, _d: unknown, name?: string) => ({
      id: 'f',
      name: name || '表单',
      updatedAt: '',
      collectKey: '',
    }),
    renameForm: () => {},
    deleteForm: () => {},
    loadRecords: () => {
      store.loadCalls += 1
      // ⚠️ 返回**副本**而非同一数组：若同引用，store.clearRecords() 会把组件侧的
      //    records 也清空，导致「组件列表未同步」这一缺陷不可观测。
      //    （记录对象本身仍共享，便于断言原地更新后的内容）
      return records.slice()
    },
    appendRecord: (_k: string, r: CollectRecord) => {
      records.unshift(r)
    },
    removeRecord: (_k: string, id: string) => {
      const i = records.findIndex((r) => r.id === id)
      if (i >= 0) records.splice(i, 1)
    },
    clearRecords: () => {
      records.length = 0
    },
  } as unknown as FormStore & { records: CollectRecord[]; loadCalls: number }
  if (opts.withUpdate) {
    ;(store as unknown as Record<string, unknown>).updateRecord = async (
      _k: string,
      id: string,
      data: Record<string, unknown>,
    ) => {
      if (opts.failUpdate) throw new Error('更新失败')
      const i = records.findIndex((r) => r.id === id)
      if (i >= 0) records[i] = { ...records[i]!, data: { ...data } }
    }
  }
  return store
}

function rec(id: string, name: string, time = '2026-01-01 09:00:00'): CollectRecord {
  return { id, time, data: { name } } as unknown as CollectRecord
}

/* ── Toast stub：捕获 show(msg, type) 调用，用于断言提示文案与类型 ── */
const toastCalls: [string, string][] = []
const ToastStub = {
  name: 'Toast',
  template: '<div class="toast-stub" />',
  methods: {
    show(msg: string, type: string) {
      toastCalls.push([msg, type])
    },
  },
}

/** 组件内部绑定（<script setup> 的顶层绑定可经 vm 读到）；索引签名兜住未列出的键 */
type VM = {
  formData: Record<string, unknown>
  errorMsg: string
  okMsg: string
  shareCode: string
  records: CollectRecord[]
  recordError: string
  recordDone: boolean
  recordSubmitting: boolean
  recordSchema: { submitConfig: Record<string, unknown> } | null
  pendingDeleteId: string | null
  confirmVisible: boolean
  confirmTitle: string
  confirmMessage: string
  exporting: boolean
  clearRecords: () => Promise<void>
  onConfirmClear: () => Promise<void>
  exportExcel: () => Promise<void>
  handleRecordSubmit: (d: Record<string, unknown>) => Promise<void>
  formatValue: (v: unknown) => string
  [key: string]: unknown
}

function mountCollect(store: FormStore, over: Record<string, unknown> = {}) {
  toastCalls.length = 0
  return mount(FormCollect, {
    props: { fields, store, ...over },
    global: { stubs: { teleport: true, Toast: ToastStub } },
    attachTo: document.body,
  })
}

const vmOf = (w: ReturnType<typeof mountCollect>) => w.vm as unknown as VM

/** 展开「已收集 N 条」记录面板（开关文案由 t('formBuilder.collected') 拼出） */
async function openRecords(w: ReturnType<typeof mountCollect>) {
  const toggle = w.findAll('button').find((b) => b.text().includes(t('formBuilder.collected')))
  expect(toggle, '存在「已收集 N 条」开关').toBeTruthy()
  await toggle!.trigger('click')
  await nextTick()
}

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  writeText = vi.fn(async () => undefined)
  const nav = { ...globalThis.navigator, clipboard: { writeText } }
  vi.stubGlobal('navigator', nav)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

/* ═══════════════ xlsx 动态导入的受控替身 ═══════════════ */

const xlsxState = {
  rows: null as Record<string, unknown>[] | null,
  exportingDuringSheet: null as boolean | null,
  throwOnWrite: false,
  files: [] as string[],
  readExporting: null as null | (() => boolean),
}

function installXlsxMock() {
  xlsxState.rows = null
  xlsxState.exportingDuringSheet = null
  xlsxState.throwOnWrite = false
  xlsxState.files = []
  xlsxState.readExporting = null
  vi.doMock('@/components/_internal/xlsx/xlsx.mjs', () => ({
    utils: {
      json_to_sheet: (rows: Record<string, unknown>[]) => {
        xlsxState.rows = rows
        if (xlsxState.readExporting) xlsxState.exportingDuringSheet = xlsxState.readExporting()
        return { rows }
      },
      book_new: () => ({ sheets: [] }),
      book_append_sheet: () => {},
    },
    writeFile: (_wb: unknown, name: string) => {
      if (xlsxState.throwOnWrite) throw new Error('写盘失败')
      xlsxState.files.push(name)
    },
  }))
}

/* ═══════════════ ① 分享复制 ═══════════════ */

describe('分享复制 · 成功与失败的反馈必须相反', () => {
  async function openShareAndCopy(w: ReturnType<typeof mountCollect>, which: 'code' | 'link') {
    const shareBtn = w.findAll('button').find((b) => b.text().includes(t('fbd.share')))
    expect(shareBtn, '存在分享按钮').toBeTruthy()
    await shareBtn!.trigger('click')
    await flushPromises()
    const copies = w.findAll('.ldc-share-copy')
    expect(copies.length, '分享弹窗内有复制入口').toBeGreaterThan(0)
    // 模板顺序：先分享码（copyShareCode），后链接（copyShareLink）
    const idx = which === 'code' ? 0 : copies.length - 1
    await copies[idx]!.trigger('click')
    await flushPromises()
  }

  it('**复制分享码成功 → 提示「分享码已复制」且类型为 success**', async () => {
    const w = mountCollect(memoryStore())
    await flushPromises()
    await openShareAndCopy(w, 'code')
    expect(writeText, '确实写了剪贴板').toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0]![0], '写入的是分享码文本').toBe(vmOf(w).shareCode)
    expect(toastCalls.at(-1), '提示文案与类型都要对').toEqual([t('fbd.shareCopied'), 'success'])
  })

  it('**复制分享链接成功 → 提示「链接已复制」且类型为 success**', async () => {
    const w = mountCollect(memoryStore())
    await flushPromises()
    await openShareAndCopy(w, 'link')
    expect(toastCalls.at(-1), '链接走另一条文案').toEqual([t('fbd.shareLinkCopied'), 'success'])
    expect(toastCalls.at(-1)![0], '不能与分享码文案相同').not.toBe(t('fbd.shareCopied'))
  })

  it('**剪贴板失败 → 提示「复制失败」且类型为 error**（不谎称成功）', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const w = mountCollect(memoryStore())
    await flushPromises()
    await openShareAndCopy(w, 'code')
    expect(toastCalls.at(-1), '失败必须报 error，且不能是成功文案').toEqual([t('fbd.copyFail'), 'error'])
  })
})

/* ═══════════════ ② 新建记录 ═══════════════ */

describe('startNewRecord 新建记录', () => {
  it('**新建清空表单数据与两条消息**（不残留上一条录入）', async () => {
    const w = mountCollect(memoryStore())
    await flushPromises()
    const vm = vmOf(w)
    // 人为制造残留：数据 + 两条消息都非空
    vm.formData = { name: '残留值' }
    vm.errorMsg = '旧的错误'
    vm.okMsg = '旧的提示'
    await nextTick()
    expect(vm.errorMsg, '前置条件：确实有旧错误').toBe('旧的错误')

    const newBtn = w.findAll('button').find((b) => b.text().includes(t('fbd.newRecord')))
    expect(newBtn, '存在「新建」按钮').toBeTruthy()
    await newBtn!.trigger('click')
    await flushPromises()

    // ⚠️ 不能断言 `formData` 深等于 {}：子表单会按 fields 回填成 {name: null, age: null}
    //    （空白表单的正常形态）。可分辨的观测量是**旧值不再存在**。
    expect(JSON.stringify(vm.formData), '旧值「残留值」不得残留').not.toContain('残留值')
    expect(vm.formData.name ?? '', '姓名字段已空').toBe('')
    expect(vm.errorMsg, '旧错误被清空').toBe('')
    expect(vm.okMsg, '旧提示被清空').toBe('')
  })

  it('**新建滚动回填写区顶部**（连续录入时视线回到表单）', async () => {
    const scrollSpy = vi.fn()
    const orig = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollSpy
    try {
      const w = mountCollect(memoryStore())
      await flushPromises()
      const newBtn = w.findAll('button').find((b) => b.text().includes(t('fbd.newRecord')))
      expect(newBtn, '存在「新建」按钮').toBeTruthy()
      await newBtn!.trigger('click')
      await flushPromises()
      await nextTick()
      expect(scrollSpy, '触发了 scrollIntoView').toHaveBeenCalledTimes(1)
      expect(scrollSpy.mock.calls[0]![0], '平滑滚到顶部').toEqual({ behavior: 'smooth', block: 'start' })
    } finally {
      Element.prototype.scrollIntoView = orig
    }
  })
})

/* ═══════════════ ③ 审核提交 ═══════════════ */

describe('handleRecordSubmit 审核提交', () => {
  async function openReview(w: ReturnType<typeof mountCollect>) {
    await openRecords(w)
    const rows = w.findAll('.ldc-record')
    expect(rows.length, '记录行已渲染').toBeGreaterThan(0)
    const reviewBtn = rows[0]!.findAll('button').find((b) => b.classes().includes('ldc-review-btn'))
    expect(reviewBtn, '存在审核按钮').toBeTruthy()
    await reviewBtn!.trigger('click')
    await nextTick()
  }

  it('**recordSchema 只在弹窗打开时生成**（否则为 null）', async () => {
    const w = mountCollect(memoryStore([rec('r1', '张三')]))
    await flushPromises()
    const vm = vmOf(w)
    expect(vm.recordSchema, '未打开弹窗 → null').toBeNull()
    await openReview(w)
    expect(vm.recordSchema, '打开审核弹窗 → 生成 schema').toBeTruthy()
    expect(vm.recordSchema.submitConfig, 'review 模式可提交、且不带内建提交地址').toMatchObject({
      mode: 'review',
      apiUrl: '',
      saveUrl: '',
    })
  })

  it('**未选中记录时提交直接返回**（不误改数据）', async () => {
    const store = memoryStore([rec('r1', '张三'), rec('r2', '李四')], { withUpdate: true })
    const w = mountCollect(store)
    await flushPromises()
    const before = JSON.stringify(store.records)
    const vm = vmOf(w)
    await vm.handleRecordSubmit({ name: '不该生效' })
    await flushPromises()
    expect(JSON.stringify(store.records), '记录未被改动').toBe(before)
    // 只断言「记录未变」不够：去掉守卫后会走到 record.id 抛 TypeError、被 catch 兜住，
    // 记录同样不变。可分辨的观测量是**错误态与提交标志**都没动。
    expect(vm.recordError, '没有目标记录时不该产生错误文案').toBe('')
    expect(vm.recordSubmitting, '不该进入提交态').toBe(false)
    expect(vm.recordDone, '不该标记完成').toBe(false)
  })

  it('**有 updateRecord 时原地更新**（记录数不变、位置不变）', async () => {
    const store = memoryStore([rec('r1', '张三'), rec('r2', '李四')], { withUpdate: true })
    const w = mountCollect(store)
    await flushPromises()
    await openReview(w)
    const loadsBefore = store.loadCalls
    await vmOf(w).handleRecordSubmit({ name: '张三改' })
    await flushPromises()

    expect(store.records.length, '记录数不变（原地更新）').toBe(2)
    expect(store.records[0]!.data.name, '首条被更新且仍在首位').toBe('张三改')
    expect(store.loadCalls, '提交后刷新了列表').toBeGreaterThan(loadsBefore)
    expect(vmOf(w).recordDone, '标记完成态（弹窗内反馈）').toBe(true)
    expect(vmOf(w).recordSubmitting, '提交标志已复位').toBe(false)
  })

  it('**无 updateRecord 时降级为「删 + 增」**（注释承认会排到顶部）', async () => {
    const store = memoryStore([rec('r1', '张三'), rec('r2', '李四')])
    const w = mountCollect(store)
    await flushPromises()
    await openReview(w)
    await vmOf(w).handleRecordSubmit({ name: '张三改' })
    await flushPromises()

    expect(store.records.length, '总数不变（一删一增）').toBe(2)
    expect(store.records[0]!.data.name, '降级后该记录排到列表顶部').toBe('张三改')
  })

  it('**提交中再次提交被拒**（防重复审核）', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const updateSpy = vi.fn(async () => {
      await gate
    })
    const store = memoryStore([rec('r1', '张三')])
    ;(store as unknown as Record<string, unknown>).updateRecord = updateSpy
    const w = mountCollect(store)
    await flushPromises()
    await openReview(w)
    const vm = vmOf(w)

    const first = vm.handleRecordSubmit({ name: '第一次' })
    await nextTick()
    expect(vm.recordSubmitting, '进行中标志已置位').toBe(true)
    await vm.handleRecordSubmit({ name: '第二次' }) // 应被 submitting 挡住
    release()
    await first
    await flushPromises()
    expect(updateSpy, '只提交一次').toHaveBeenCalledTimes(1)
  })

  it('**更新失败 → recordError 写入精确文案，且不标记完成**', async () => {
    const store = memoryStore([rec('r1', '张三')], { withUpdate: true, failUpdate: true })
    const w = mountCollect(store)
    await flushPromises()
    await openReview(w)
    const vm = vmOf(w)
    await vm.handleRecordSubmit({ name: '会失败' })
    await flushPromises()

    expect(vm.recordError, '错误文案由 i18n 拼出并含原始错误').toBe(
      t('fbd.reviewRecordFail', { err: '更新失败' }),
    )
    expect(vm.recordDone, '失败不得标记完成').toBe(false)
    expect(vm.recordSubmitting, '标志复位').toBe(false)
  })

  it('**并发冲突（409）→ 专用文案 + 刷新列表 + 面板换成最新数据**（不与"保存失败"混淆）', async () => {
    const store = memoryStore([rec('r1', '张三')], { withUpdate: true })
    // 模拟 REST 仓储抛出的冲突：鸭子类型（code + currentRev），不依赖具体实现
    ;(store as unknown as Record<string, unknown>).updateRecord = vi.fn(async () => {
      throw Object.assign(new Error('版本已过期'), { code: 'conflict', currentRev: 7 })
    })
    const w = mountCollect(store)
    await flushPromises()
    await openReview(w)
    const loadsBefore = store.loadCalls
    const vm = vmOf(w)
    // 期间别人改了这条记录：**换成新对象**（不是原地改字段）——
    // 否则 recordTarget 指向的还是同一个对象，"面板换没换"这件事根本测不出来（负向对照抓到过假绿）
    store.records[0] = { ...store.records[0]!, data: { name: '别人改的' } }

    await vm.handleRecordSubmit({ name: '我改的' })
    await flushPromises()

    expect(vm.recordError, '文案要说"已被他人修改"并带上当前版本').toBe(
      t('fbd.reviewRecordConflict', { rev: 7 }),
    )
    expect(vm.recordError, '不能混成"审核保存失败" —— 那是另一类问题').not.toContain('审核保存失败')
    expect(store.loadCalls, '冲突后必须刷新列表').toBeGreaterThan(loadsBefore)
    expect(vm.recordTarget?.data?.name, '面板换成最新那条：用户能立刻看到别人改了什么').toBe('别人改的')
    expect(vm.recordDone, '冲突不算完成（不假装成功）').toBe(false)
    expect(vm.recordSubmitting, '标志复位').toBe(false)
  })
})

/* ═══════════════ ④ 批量清除 vs 单条删除 ═══════════════ */

describe('clearRecords / onConfirmClear 分流', () => {
  it('**无记录时 clearRecords 直接返回**（不弹确认框）', async () => {
    const w = mountCollect(memoryStore([]))
    await flushPromises()
    const vm = vmOf(w)
    await vm.clearRecords()
    expect(vm.confirmVisible, '空列表不该弹确认').toBe(false)
  })

  it('**有记录时弹确认框，消息含条数**', async () => {
    const store = memoryStore([rec('r1', '张三'), rec('r2', '李四'), rec('r3', '王五')])
    const w = mountCollect(store)
    await flushPromises()
    const vm = vmOf(w)
    await vm.clearRecords()
    await nextTick()
    expect(vm.confirmVisible).toBe(true)
    expect(vm.pendingDeleteId, '批量清除不设 pendingDeleteId').toBeNull()
    expect(vm.confirmTitle).toBe(t('formBuilder.clearRecordsTitle'))
    expect(vm.confirmMessage, '消息里带条数 3').toContain('3')
  })

  it('**批量清除会先复位残留的 pendingDeleteId**（否则会误删单条）', async () => {
    const store = memoryStore([rec('r1', '张三'), rec('r2', '李四')])
    const w = mountCollect(store)
    await flushPromises()
    await openRecords(w)
    await w.find('.ldc-del-btn').trigger('click') // 留下 pendingDeleteId
    await nextTick()
    const vm = vmOf(w)
    expect(vm.pendingDeleteId, '前置条件：单条删除留了 id').toBe('r1')

    await vm.clearRecords() // 批量清除必须把它清掉
    await nextTick()
    expect(vm.pendingDeleteId, '残留 id 被复位，否则会只删一条').toBeNull()
    expect(vm.confirmVisible).toBe(true)
  })

  it('**确认且无 pendingDeleteId → 清空全部并关弹窗**', async () => {
    const store = memoryStore([rec('r1', '张三'), rec('r2', '李四')])
    const w = mountCollect(store)
    await flushPromises()
    const vm = vmOf(w)
    await vm.clearRecords()
    expect(vm.confirmVisible, '前置条件：弹窗已开').toBe(true)
    await vm.onConfirmClear()
    await flushPromises()
    expect(store.records.length, 'store 侧已清空').toBe(0)
    expect(vm.records.length, '组件侧列表同步清空（否则界面仍显示旧行）').toBe(0)
    expect(vm.confirmVisible, '确认后关闭弹窗').toBe(false)
  })

  it('**确认且带 pendingDeleteId → 只删那一条并刷新**', async () => {
    const store = memoryStore([rec('r1', '张三'), rec('r2', '李四'), rec('r3', '王五')])
    const w = mountCollect(store)
    await flushPromises()
    await openRecords(w)
    await w.find('.ldc-del-btn').trigger('click')
    await nextTick()
    const vm = vmOf(w)
    expect(vm.pendingDeleteId).toBe('r1')
    const loadsBefore = store.loadCalls

    await vm.onConfirmClear()
    await flushPromises()
    expect(store.records.length, '只删一条，不是清空').toBe(2)
    expect(store.records.map((r) => r.id)).toEqual(['r2', 'r3'])
    expect(store.loadCalls, '删后刷新列表').toBeGreaterThan(loadsBefore)
    expect(vm.pendingDeleteId, '复位为 null').toBeNull()
    expect(vm.confirmVisible, '确认后关闭弹窗').toBe(false)
  })
})

/* ═══════════════ ⑤ Excel 导出 ═══════════════ */

describe('exportExcel 导出', () => {
  it('**无记录时提示「导出为空」且不生成文件**', async () => {
    installXlsxMock()
    const w = mountCollect(memoryStore([]))
    await flushPromises()
    const vm = vmOf(w)
    await vm.exportExcel()
    await flushPromises()
    expect(vm.errorMsg, '给出空导出的提示').toBe(t('formBuilder.exportEmpty'))
    expect(xlsxState.files, '一张表都没写').toEqual([])
    expect(vm.exporting, '未进入导出态').toBe(false)
  })

  it('**有记录时生成并写出 xlsx，文件名含条数**；导出期间 exporting 为真', async () => {
    installXlsxMock()
    const w = mountCollect(memoryStore([rec('r1', '张三'), rec('r2', '李四')]))
    await flushPromises()
    const vm = vmOf(w)
    xlsxState.readExporting = () => vm.exporting === true
    await vm.exportExcel()
    await flushPromises()

    expect(xlsxState.exportingDuringSheet, '生成工作表时处于导出态').toBe(true)
    expect(xlsxState.files).toHaveLength(1)
    expect(xlsxState.files[0], '文件名含记录条数 2').toContain('2')
    expect(xlsxState.files[0], '扩展名为 .xlsx').toMatch(/\.xlsx$/)
    expect(vm.okMsg, '成功提示').toBe(t('formBuilder.exportDone'))
    expect(vm.exporting, '结束后复位导出态').toBe(false)
  })

  it('**成功后 okMsg 在 3000ms 后自动消失**', async () => {
    installXlsxMock()
    vi.useFakeTimers()
    const w = mountCollect(memoryStore([rec('r1', '张三')]))
    await flushPromises()
    const vm = vmOf(w)
    await vm.exportExcel()
    expect(vm.okMsg, '刚导出完还显示').toBe(t('formBuilder.exportDone'))

    await vi.advanceTimersByTimeAsync(2999)
    expect(vm.okMsg, '2999ms 时仍显示').toBe(t('formBuilder.exportDone'))
    await vi.advanceTimersByTimeAsync(1)
    expect(vm.okMsg, '3000ms 到点清空').toBe('')
  })

  it('**写盘失败 → errorMsg 写入精确文案，且导出态复位**', async () => {
    installXlsxMock()
    xlsxState.throwOnWrite = true
    const w = mountCollect(memoryStore([rec('r1', '张三')]))
    await flushPromises()
    const vm = vmOf(w)
    await vm.exportExcel()
    await flushPromises()
    expect(vm.errorMsg, '错误文案含原始错误').toBe(t('fbd.exportFailMsg', { err: '写盘失败' }))
    expect(vm.exporting, '异常路径也必须复位（否则按钮永久 loading）').toBe(false)
  })

  it('**导出会过滤布局字段**（divider 不进表头）', async () => {
    installXlsxMock()
    const w = mountCollect(memoryStore([rec('r1', '张三')]), { fields: fieldsWithLayout })
    await flushPromises()
    await vmOf(w).exportExcel()
    await flushPromises()
    expect(xlsxState.rows, '拿到了行数据').toBeTruthy()
    const keys = Object.keys(xlsxState.rows![0]!)
    expect(keys, '数据字段在').toContain('姓名')
    expect(keys, '布局字段被过滤').not.toContain('分隔线')
  })

  it('**自定义 exportColumns 优先于 fields**（列可裁剪）', async () => {
    installXlsxMock()
    const w = mountCollect(memoryStore([rec('r1', '张三')]), {
      exportColumns: [{ key: 'name', label: '只导出姓名' }],
    })
    await flushPromises()
    await vmOf(w).exportExcel()
    await flushPromises()
    const keys = Object.keys(xlsxState.rows![0]!)
    expect(keys, '自定义列生效').toContain('只导出姓名')
    expect(keys, '未列出的字段不导出').not.toContain('年龄')
  })

  it('**值按类型转换**：数组→逗号串、true→是、false→否、null→空串', async () => {
    installXlsxMock()
    const store = memoryStore([
      { id: 'r1', time: 'T1', data: { name: ['甲', '乙'], age: true } } as unknown as CollectRecord,
      { id: 'r2', time: 'T2', data: { name: null, age: false } } as unknown as CollectRecord,
    ])
    const w = mountCollect(store)
    await flushPromises()
    await vmOf(w).exportExcel()
    await flushPromises()

    const rows = xlsxState.rows!
    expect(rows).toHaveLength(2)
    expect(rows[0]!['姓名'], '数组转逗号串').toBe('甲, 乙')
    expect(rows[0]!['年龄'], 'true 转「是」').toBe(t('common.yes'))
    expect(rows[1]!['姓名'], 'null 转空串').toBe('')
    expect(rows[1]!['年龄'], 'false 转「否」').toBe(t('common.no'))
    expect(rows[0]![t('fbd.submittedAt')], '首列是提交时间').toBe('T1')
  })

  it('**导出文件名优先用 exportFileName，其次 meta.title，最后默认名**', async () => {
    installXlsxMock()
    const w = mountCollect(memoryStore([rec('r1', '张三')]), { exportFileName: '我的收集表' })
    await flushPromises()
    await vmOf(w).exportExcel()
    await flushPromises()
    expect(xlsxState.files[0], '用自定义文件名开头').toMatch(/^我的收集表-/)
  })
})

/* ═══════════════ formatValue 分支 ═══════════════ */

describe('formatValue 值格式化', () => {
  it('**null/undefined → 短横线；数组 → 逗号串；布尔 → 是/否；对象 → JSON**', async () => {
    const w = mountCollect(memoryStore())
    await flushPromises()
    const f = vmOf(w).formatValue as (v: unknown) => string
    expect(typeof f, '格式化函数可达').toBe('function')
    expect(f(null)).toBe('-')
    expect(f(undefined)).toBe('-')
    expect(f(['a', 'b'])).toBe('a, b')
    expect(f(true)).toBe(t('common.yes'))
    expect(f(false)).toBe(t('common.no'))
    expect(f({ x: 1 })).toBe('{"x":1}')
    expect(f('文本')).toBe('文本')
    expect(f(0), '0 不是空值').toBe('0')
  })
})