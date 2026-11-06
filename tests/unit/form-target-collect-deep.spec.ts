/**
 * FormTargetCollect.vue 深挖 — 存储切换 / 保存链路 / 上传两分支 / 预览 / ZIP 导出的边角
 *
 * ## 为什么补（527 行，单文件口径 语句 76% / 分支 63.8% / 函数 68.3%，59 行未覆盖）
 *
 * 既有 2 个 spec 已覆盖「列裁剪 + 导出字段并集 + 上传/清空/导出的主路径」，
 * 剩下一整层**分支与失败路径**：
 *
 * ① `displayKeys` 的**空目标**兜底（没有 targets 时表头退化成只有 ID）；
 * ② `cellText` 的 null/对象两种取值（导出不留 `[object Object]`、空值不留 "null"）；
 * ③ `applyBackend` 的**同步失败回调**（后端内部报错时给全局提示，否则用户只看到数据没同步）；
 * ④ `resetBackend` + `onStorageConfigSave`（换后端：持久化 → 重建 → 重载 → 关面板 → 提示）；
 * ⑤ `saveToBackend` 的成败两路（写盘失败必须提示，不能静默丢数据）；
 * ⑥ `onUpload` 的**两个真分支**：有新文件（存盘 + emit + 提示）／**文件被清空**（删槽位 + 存盘 + emit undefined）；
 * ⑦ `revokeSlotUrl`（换/删照片时必须 revoke 旧 blob URL，否则内存泄漏）；
 * ⑧ `openPreview` 的空 URL 守卫；`formatTs(0)` 的空时间兜底；
 * ⑨ ZIP 导出的四条边角：**一个文件都没成功**（提示而非产出空包）、失效引用（fetch 非 ok）、
 *    损坏文件（fetch 抛错）、**列名撞车**（同名列加序号后缀，否则整列丢数据）；
 * ⑩ 卸载时清理全部缓存 URL。
 *
 * ## harness
 *
 * `contract-storage` 用「真实现 + 只替换 createBackend」的方式 mock —— 这样
 * `getSlotFile`/`setSlotFile`/`allSlotsFilled`/`defaultStorageConfigFromEnv` 都是真的，
 * 只把后端 I/O 换成可断言的内存实现，并**捕获 createBackend 的第二个参数**
 * （错误回调），以便驱动 ③ 这条平时只能靠后端内部错误触发的路径。
 * `jszip` 用可控替身（记录写了哪些路径、可让 generateAsync 抛错），
 * 避开 happy-dom 下 `generateAsync({type:'blob'})` 不可用的限制。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

/* ═══════════ 后端替身（真实现 + 只换 createBackend） ═══════════ */

const hs = vi.hoisted(() => ({
  loaded: new Map<number, { slots: Record<string, unknown>; ts: number }>(),
  calls: { loadAll: 0, save: [] as Array<[number, unknown]>, clear: 0 },
  failLoad: false,
  failSave: false,
  failClear: false,
  /** createBackend 传进来的「后端内部错误」回调 */
  errCb: null as null | ((id: number, e: unknown) => void),
  kinds: [] as string[],
}))

vi.mock('@/components/storage/compositeBackend', async () => {
  const actual = await import('@/components/storage/compositeBackend')
  return {
    ...actual,
    createBackend: vi.fn((cfg: { backend?: string }, onErr?: (id: number, e: unknown) => void) => {
      hs.errCb = onErr ?? null
      const kind = (cfg?.backend as string) || 'local'
      hs.kinds.push(kind)
      return {
        kind,
        loadAll: async () => {
          hs.calls.loadAll++
          if (hs.failLoad) throw new Error('load boom')
          return new Map(hs.loaded)
        },
        saveRecord: async (id: number, state: unknown) => {
          hs.calls.save.push([id, state])
          if (hs.failSave) throw new Error('save boom')
        },
        clearAll: async () => {
          hs.calls.clear++
          if (hs.failClear) throw new Error('clear boom')
        },
      }
    }),
  }
})

const hp = vi.hoisted(() => ({ persisted: [] as unknown[] }))

vi.mock('@/components/form-builder/storage-config-persist', () => ({
  loadPersistedStorageConfig: vi.fn(() => ({ backend: 'local' as const })),
  persistStorageConfig: vi.fn((c: unknown) => {
    hp.persisted.push(c)
  }),
}))

/* ═══════════ jszip 替身 ═══════════ */

const hz = vi.hoisted(() => ({ files: [] as string[], gen: 0, throwGen: false }))

vi.mock('jszip', () => ({
  default: class FakeZip {
    file(path: string) {
      hz.files.push(path)
    }
    async generateAsync() {
      hz.gen++
      if (hz.throwGen) throw new Error('zip boom')
      return new Blob(['zip'])
    }
  },
}))

const hx = vi.hoisted(() => ({ rows: null as null | Array<Record<string, unknown>> }))

vi.mock('@/components/_internal/xlsx/xlsx.mjs', () => ({
  utils: {
    json_to_sheet: (rows: Array<Record<string, unknown>>) => {
      hx.rows = rows
      return { rows }
    },
    book_new: () => ({ sheets: [] }),
    book_append_sheet: () => {},
  },
  write: () => new ArrayBuffer(0),
}))

import FormTargetCollect from '@/components/form-builder/FormTargetCollect.vue'
import StorageConfigPanel from '@/components/storage/StorageConfigPanel.vue'
import Upload from '@/components/form/Upload.vue'
import ImagePreview from '@/components/data/ImagePreview.vue'
import type { FormSchema } from '@/components/form-builder/types'
import type { StorageConfig } from '@/components/storage/contract-storage'
import { useT } from '@/components/_internal/i18n'

// toast 文案一律取精确值：首版把 fbTarget.saved 猜成「已保存」，实际是「已记录 ✓」
const t = useT()

/* ═══════════ 夹具 ═══════════ */

const schema = {
  title: '目标收集',
  fields: [
    { id: 'p1', type: 'upload', label: '门头照', key: 'front' },
    { id: 'p2', type: 'camera', label: '执照照', key: 'license' },
    { id: 'x1', type: 'text', label: '备注', key: 'note' },
  ],
} as unknown as FormSchema

const targets = [
  { id: 1, name: '门店A', addr: '北京' },
  { id: 2, name: '门店B', addr: '上海' },
]

const fileA = { name: 'a.jpg', dataUrl: 'data:image/jpeg;base64,AAAA', size: 10, type: 'image/jpeg' }

type VM = {
  displayKeys: string[]
  exportKeys: string[]
  hiddenFieldCount: number
  cellText: (v: unknown) => string
  openPreview: (url: string) => void
  previewUrl: string
  previewVisible: boolean
  formatTs: (ts: number) => string
  onUpload: (id: number, key: string, files: unknown[]) => Promise<void>
  saveToBackend: (id: number) => Promise<void>
  onStorageConfigSave: (next: StorageConfig) => Promise<void>
  requestClearAll: () => void
  onConfirmClear: () => Promise<void>
  exportZip: () => Promise<void>
  showStoragePanel: boolean
  saving: boolean
  cfg: StorageConfig
  exporting: boolean
  uploadMap: Map<number, unknown>
  keyword: string
  [key: string]: unknown
}

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(FormTargetCollect, {
    props: { schema, targets, ...props },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

const vmOf = (w: ReturnType<typeof mountPanel>) => w.vm as unknown as VM
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null

let revokeSpy: ReturnType<typeof vi.fn>
let createSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  hs.loaded = new Map()
  hs.calls = { loadAll: 0, save: [], clear: 0 }
  hs.failLoad = false
  hs.failSave = false
  hs.failClear = false
  hs.errCb = null
  hs.kinds = []
  hp.persisted = []
  hz.files = []
  hz.gen = 0
  hz.throwGen = false
  hx.rows = null
  revokeSpy = vi.fn()
  createSpy = vi.fn((_b: Blob) => 'blob:fake-url')
  vi.stubGlobal('URL', Object.assign(URL, { revokeObjectURL: revokeSpy, createObjectURL: createSpy }))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/* ═══════════ ① 表头与单元格 ═══════════ */

describe('表头/单元格的边角', () => {
  it('**没有目标时表头退化成只有 ID**（不再假设有第一行）', async () => {
    const w = mountPanel({ targets: [] })
    await flushPromises()
    expect(vmOf(w).displayKeys, '空列表时用 id 占位').toEqual(['id'])
    expect(vmOf(w).hiddenFieldCount, '无目标时隐藏列数为 0').toBe(0)
    expect(q('.ftc-empty'), '渲染空态').not.toBeNull()
    w.unmount()
  })

  it('**cellText：null/undefined → 空串，对象 → JSON**（导出不留 null 与 [object Object]）', async () => {
    const w = mountPanel()
    await flushPromises()
    const cellText = vmOf(w).cellText
    expect(cellText(null)).toBe('')
    expect(cellText(undefined)).toBe('')
    expect(cellText({ a: 1 })).toBe('{"a":1}')
    expect(cellText(0), '0 不是空值').toBe('0')
    expect(cellText(false)).toBe('false')
    w.unmount()
  })

  it('**null 字段在表格里渲染成空单元格而不是 "null"**', async () => {
    const w = mountPanel({ targets: [{ id: 1, name: null, addr: '北京' }] })
    await flushPromises()
    const cells = [...document.querySelectorAll('.ftc-td-val')].map((el) => el.textContent)
    expect(cells, 'null 渲染成空串').toContain('')
    expect(cells, '不该出现字面 null').not.toContain('null')
    w.unmount()
  })
})

/* ═══════════ ② 后端：加载 / 错误回调 / 切后端 ═══════════ */

describe('存储后端', () => {
  it('**完成统计按槽位齐否计数**（1/2 表示只有一个目标填齐）', async () => {
    hs.loaded.set(1, { slots: { front: fileA, license: fileA }, ts: 5 })
    const w = mountPanel()
    await flushPromises()
    expect(document.querySelector('.ftc-stat')!.textContent, '有一个目标填齐').toContain('1/2')
    w.unmount()
  })

  it('**挂载即重载**：loadAll 被调用一次', async () => {
    hs.loaded.set(1, { slots: { front: fileA }, ts: 100 })
    const w = mountPanel()
    await flushPromises()
    expect(hs.calls.loadAll).toBe(1)
    expect(vmOf(w).uploadMap.size, '已载入一条').toBe(1)
    // 后端实例必须复用：每次操作都 createBackend 会翻倍连接/监听
    await vmOf(w).onUpload(1, 'front', [{ url: 'data:image/png;base64,AAAA', status: 'done', name: 'a', size: 1 }])
    await flushPromises()
    expect(hs.kinds.length, '整个生命周期只建了一个后端').toBe(1)
    w.unmount()
  })

  it('**后端内部同步失败 → 全局错误提示**（不然用户只看到数据没同步）', async () => {
    const w = mountPanel()
    await flushPromises()
    expect(hs.errCb, 'createBackend 收到了错误回调').not.toBeNull()
    hs.errCb!(7, new Error('quota'))
    await nextTick()
    expect(document.body.textContent, '提示里带目标 id').toContain('7')
    w.unmount()
  })

  it('**加载失败 → 提示（本地/云端文案不同）且不抛**', async () => {
    hs.failLoad = true
    const w = mountPanel()
    await flushPromises()
    expect(document.body.textContent).toContain(t('fbTarget.loadLocalFail'))
    w.unmount()
  })

  it('**重载会清掉旧映射**（后端已删的记录不该还挂在界面上）', async () => {
    hs.loaded.set(1, { slots: { front: fileA }, ts: 5 })
    hs.loaded.set(2, { slots: { front: fileA }, ts: 6 })
    const w = mountPanel()
    await flushPromises()
    expect(vmOf(w).uploadMap.size, '前置：两条').toBe(2)

    hs.loaded = new Map([[1, { slots: { front: fileA }, ts: 5 }]])
    await vmOf(w).onStorageConfigSave({ backend: 'local' } as StorageConfig)
    await flushPromises()
    expect(vmOf(w).uploadMap.size, '只剩下后端还存在的记录').toBe(1)
    w.unmount()
  })

  it('**切换后端：持久化 → 重建后端 → 重载 → 关面板 → 提示成功**', async () => {
    const w = mountPanel()
    await flushPromises()
    const vm = vmOf(w)
    vm.showStoragePanel = true
    await nextTick()
    const loadsBefore = hs.calls.loadAll
    const kindsBefore = hs.kinds.length

    await vm.onStorageConfigSave({ backend: 'api', apiBase: 'https://x' } as StorageConfig)
    await flushPromises()

    expect(hp.persisted.length, '持久化了新配置').toBe(1)
    expect(hs.kinds.length, '重建了后端实例').toBe(kindsBefore + 1)
    expect(hs.kinds.at(-1), '用新后端类型').toBe('api')
    expect(hs.calls.loadAll, '重建后重载').toBeGreaterThan(loadsBefore)
    expect(vm.showStoragePanel, '面板已关闭').toBe(false)
    expect(vm.saving, 'saving 已复位').toBe(false)
    expect(document.body.textContent, '切到云端后提示 switchCloud').toContain(t('fbTarget.switchCloud'))
    w.unmount()
  })

  it('**切后端时重载抛错也要复位 saving**（finally 兜住，否则保存按钮永久转圈）', async () => {
    const w = mountPanel()
    await flushPromises()
    hs.failLoad = true
    const vm = vmOf(w)
    await vm.onStorageConfigSave({ backend: 'local' } as StorageConfig)
    await flushPromises()
    expect(vm.saving).toBe(false)
    w.unmount()
  })

  it('**saveToBackend 成/败两路**（失败必须提示，不能静默丢数据）', async () => {
    const w = mountPanel()
    await flushPromises()
    const vm = vmOf(w)
    await vm.onUpload(1, 'front', [{ url: 'data:image/png;base64,AAAA', status: 'done', name: 'x.png', size: 3 }])
    await flushPromises()
    expect(hs.calls.save.length, '成功写盘一次').toBe(1)
    expect(hs.calls.save[0]![0]).toBe(1)

    hs.failSave = true
    await vm.saveToBackend(1)
    await flushPromises()
    expect(document.body.textContent, '写盘失败的提示').toContain(t('fbTarget.saveFail'))
    w.unmount()
  })
})

/* ═══════════ ③ 上传两分支 + revoke ═══════════ */

describe('onUpload 的两个真分支', () => {
  it('**有新文件 → 存盘 + emit change(file) + 提示已保存**', async () => {
    const w = mountPanel()
    await flushPromises()
    const vm = vmOf(w)
    await vm.onUpload(1, 'front', [{ url: 'data:image/png;base64,AAAA', status: 'done', name: 'x.png', size: 3 }] as never[])
    await flushPromises()

    const ev = w.emitted('change')
    expect(ev, 'emit 了 change').toBeTruthy()
    expect(ev![0]![0], '目标 id').toBe(1)
    expect(ev![0]![1], '槽位 key').toBe('front')
    expect((ev![0]![2] as { name: string }).name).toBe('x.png')
    expect(document.body.textContent, '提示用的是 fbTarget.saved').toContain(t('fbTarget.saved'))
    expect(hs.calls.save.length).toBe(1)
    w.unmount()
  })

  it('**文件被清空 → 删槽位 + 存盘 + emit change(undefined)**', async () => {
    // 两个槽位都齐 → 该行显示「已完成」；清掉一个后必须变回未完成
    hs.loaded.set(1, { slots: { front: fileA, license: fileA }, ts: 5 })
    const w = mountPanel()
    await flushPromises()
    expect(document.querySelectorAll('.ftc-status-done').length, '前置：已完成').toBe(1)
    const vm = vmOf(w)
    await vm.onUpload(1, 'front', [])
    await flushPromises()
    expect(document.querySelectorAll('.ftc-status-done').length, '清掉一个槽位后不再算完成').toBe(0)
    await flushPromises()

    const ev = w.emitted('change')
    expect(ev, 'emit 了 change').toBeTruthy()
    expect(ev![0]![2], '交付 undefined 表示已删除').toBeUndefined()
    expect(hs.calls.save.length, '删除也要落盘').toBe(1)
    w.unmount()
  })

  it('**既没有 done 文件也不是空数组 → 两个分支都不进**（防误存半成品）', async () => {
    const w = mountPanel()
    await flushPromises()
    const vm = vmOf(w)
    // url 有值但 status 不是 done（半成品）—— 若不看 status 就会被误存
    await vm.onUpload(1, 'front', [{ url: 'blob:pending', status: 'uploading', name: 'x', size: 1 }] as never[])
    await flushPromises()
    expect(hs.calls.save.length, '不该写盘').toBe(0)
    expect(w.emitted('change'), '不该 emit').toBeUndefined()
    w.unmount()
  })

  it('**替换照片时 revoke 旧 URL 并**删掉缓存**（否则内存只涨不落/复用到旧引用）', async () => {
    // ⚠️ 必须用 Blob 型 dataUrl：字符串型 getUploadFiles 直接复用 dataUrl 不建 objectURL，
    //    缓存是否被删就观测不到
    hs.loaded.set(1, { slots: { front: { ...fileA, dataUrl: new Blob(['x']) } }, ts: 5 })
    const w = mountPanel()
    await flushPromises()
    expect(createSpy, '首次渲染建了一个 objectURL').toHaveBeenCalledTimes(1)
    const firstUrl = createSpy.mock.results[0]!.value

    // 替换成的**也必须是 Blob 型**（raw）—— 字符串型 dataUrl 会直接复用、根本不建 objectURL，
    // 那样「缓存是否被删」同样观测不到
    await vmOf(w).onUpload(1, 'front', [
      { url: 'blob:pending', raw: new Blob(['y']), status: 'done', name: 'c.png', size: 4 },
    ] as never[])
    await flushPromises()
    expect(revokeSpy, '旧引用被 revoke').toHaveBeenCalledWith(firstUrl)
    // 缓存若没删，下次渲染会拿到已 revoke 的旧 URL（不再新建）
    await nextTick()
    expect(createSpy.mock.calls.length, '缓存已删 → 重新建 URL').toBeGreaterThan(1)
    w.unmount()
  })

  it('**卸载时清理全部缓存 URL**', async () => {
    hs.loaded.set(1, { slots: { front: fileA }, ts: 5 })
    const w = mountPanel()
    await flushPromises()
    revokeSpy.mockClear()
    w.unmount()
    expect(revokeSpy, '卸载时 revoke 所有缓存').toHaveBeenCalled()
  })
})

/* ═══════════ ④ 预览与时间格式 ═══════════ */

describe('预览与时间', () => {
  it('**空 URL 不打开预览**（避免弹一个空白层）', async () => {
    const w = mountPanel()
    await flushPromises()
    const vm = vmOf(w)
    vm.openPreview('')
    await nextTick()
    expect(vm.previewVisible, '空 URL 不打开').toBe(false)
    vm.openPreview('data:image/png;base64,AAAA')
    await nextTick()
    expect(vm.previewVisible).toBe(true)
    expect(vm.previewUrl).toBe('data:image/png;base64,AAAA')
    expect(w.findComponent(ImagePreview).exists(), '渲染了预览层').toBe(true)
    w.unmount()
  })

  it('**formatTs：0 → 空串，正常时间戳 → yyyy-MM-dd HH:mm**', async () => {
    const w = mountPanel()
    await flushPromises()
    const f = vmOf(w).formatTs
    expect(f(0), '没有时间戳就不显示').toBe('')
    expect(f(new Date(2026, 0, 2, 3, 4).getTime())).toBe('2026-01-02 03:04')
    w.unmount()
  })
})

/* ═══════════ ⑤ ZIP 导出的四条边角 ═══════════ */

describe('ZIP 导出边角', () => {
  it('**一个文件都没成功 → 只提示、不产出空包**', async () => {
    const w = mountPanel()
    await flushPromises()
    await vmOf(w).exportZip()
    await flushPromises()
    expect(hz.gen, '不该生成 zip').toBe(0)
    expect(document.body.textContent, '空导出的提示').toContain(t('fbTarget.noFileExport'))
    expect(vmOf(w).exporting, '导出态复位').toBe(false)
    w.unmount()
  })

  it('**失效引用（fetch 非 ok）→ 跳过该文件并告警**', async () => {
    hs.loaded.set(1, { slots: { front: fileA }, ts: 5 })
    // 响应里**故意**带可用的 blob()：若把 !resp.ok 的判断去掉，文件会被塞进包
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, blob: async () => new Blob(['x']) })))
    const w = mountPanel()
    await flushPromises()
    await vmOf(w).exportZip()
    await flushPromises()
    expect(console.warn, '告警跳过失效引用').toHaveBeenCalled()
    expect(hz.files.filter((p) => p.endsWith('.jpg')).length, '失效文件没进包').toBe(0)
    expect(hz.gen, '一个文件都没进包 → 不该生成 zip').toBe(0)
    w.unmount()
  })

  it('**fetch 抛错（损坏文件）→ catch 跳过，不影响其它文件**', async () => {
    hs.loaded.set(1, { slots: { front: fileA }, ts: 5 })
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('boom')
    }))
    const w = mountPanel()
    await flushPromises()
    await vmOf(w).exportZip()
    await flushPromises()
    expect(vmOf(w).exporting, '异常也复位').toBe(false)
    expect(console.warn, '损坏文件要告警（不能静默少文件）').toHaveBeenCalled()
    expect(hz.gen, '没有可用文件 → 不生成 zip').toBe(0)
    w.unmount()
  })

  it('**正常路径：文件进包 + 生成 zip + 触发下载 + 成功提示**', async () => {
    hs.loaded.set(1, { slots: { front: fileA }, ts: 5 })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x']) })))
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const w = mountPanel()
    await flushPromises()
    await vmOf(w).exportZip()
    await flushPromises()

    expect(hz.files.some((p) => /front-a\.jpg$/.test(p)), '照片按 目标目录/槽位-文件名 入包').toBe(true)
    expect(hz.files.some((p) => /\.xlsx$/.test(p)), '还有一份汇总表').toBe(true)
    expect(hz.gen, '生成了 zip').toBe(1)
    expect(clickSpy, '触发了下载').toHaveBeenCalled()
    expect(vmOf(w).exporting).toBe(false)
    w.unmount()
  })

  it('**列名撞车时加序号后缀**（直接覆盖会整列丢数据）', async () => {
    // 字段 key 恰好吃掉一张照片位的标题：'front' vs 照片位标题「front」
    const collide = {
      title: 't',
      fields: [{ id: 'p1', type: 'upload', label: 'name', key: 'front' }],
    } as unknown as FormSchema
    hs.loaded.set(1, { slots: { front: fileA }, ts: 5 })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x']) })))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const w = mountPanel({ schema: collide, targets: [{ id: 1, name: '门店A' }] })
    await flushPromises()
    await vmOf(w).exportZip()
    await flushPromises()

    expect(hz.gen, '导出完成').toBe(1)
    expect(hx.rows, '拿到了汇总表行').not.toBeNull()
    const keys = Object.keys(hx.rows![0]!)
    // 字段 key='name' 与照片位标题='name' 撞车 → 后写的必须加序号后缀，否则整列丢数据
    expect(keys.filter((k) => k === 'name').length, '原名只出现一次').toBe(1)
    expect(keys.some((k) => /^name（2）$/.test(k)), '撞车列带序号后缀').toBe(true)
    expect(keys.length, '两列都在（没被覆盖）').toBeGreaterThanOrEqual(2)
    w.unmount()
  })
})

/* ═══════════ ⑥ 子组件事件（模板绑定） ═══════════ */

describe('子组件事件绑定', () => {
  it('**StorageConfigPanel @save → 走后端切换**', async () => {
    const w = mountPanel()
    await flushPromises()
    const panel = w.findComponent(StorageConfigPanel)
    expect(panel.exists(), '渲染了存储面板').toBe(true)
    panel.vm.$emit('save', { backend: 'local' })
    await flushPromises()
    expect(hp.persisted.length, '走了切换逻辑').toBe(1)
    w.unmount()
  })

  it('**StorageConfigPanel update:visible=false → 收起面板**', async () => {
    const w = mountPanel()
    await flushPromises()
    const vm = vmOf(w)
    vm.showStoragePanel = true
    await nextTick()
    w.findComponent(StorageConfigPanel).vm.$emit('update:visible', false)
    await nextTick()
    expect(vm.showStoragePanel, '面板受 v-model 控制').toBe(false)
    w.unmount()
  })

  it('**customRequest 立刻给出即时预览 URL**（上传前就能看到图）', async () => {
    const w = mountPanel()
    await flushPromises()
    const vm = vmOf(w) as unknown as { customRequest: (f: File) => Promise<{ url: string }> }
    const res = await vm.customRequest(new File(['x'], 'a.png', { type: 'image/png' }))
    expect(createSpy, '用了 objectURL').toHaveBeenCalled()
    expect(res.url, '返回即时 blob URL').toBe('blob:fake-url')
    w.unmount()
  })

  it('**StorageConfigPanel @cancel → 关闭面板**', async () => {
    const w = mountPanel()
    await flushPromises()
    const vm = vmOf(w)
    vm.showStoragePanel = true
    await nextTick()
    w.findComponent(StorageConfigPanel).vm.$emit('cancel')
    await nextTick()
    expect(vm.showStoragePanel, '取消后收起').toBe(false)
    w.unmount()
  })

  it('**Upload @update:modelValue → 走 onUpload 落盘**', async () => {
    const w = mountPanel()
    await flushPromises()
    const ups = w.findAllComponents(Upload)
    expect(ups.length, '每个槽位一个 Upload').toBeGreaterThan(0)
    ups[0]!.vm.$emit('update:modelValue', [{ url: 'data:image/png;base64,AAAA', status: 'done', name: 'u.png', size: 2 }])
    await flushPromises()
    expect(hs.calls.save.length, '落盘了一次').toBe(1)
    w.unmount()
  })

  it('**Upload @preview → 打开预览**', async () => {
    const w = mountPanel()
    await flushPromises()
    const ups = w.findAllComponents(Upload)
    ups[0]!.vm.$emit('preview', 'data:image/png;base64,AAAA')
    await nextTick()
    expect(vmOf(w).previewVisible).toBe(true)
    w.unmount()
  })

  it('**Upload @error → 错误提示**', async () => {
    const w = mountPanel()
    await flushPromises()
    w.findAllComponents(Upload)[0]!.vm.$emit('error', '文件太大')
    await nextTick()
    expect(document.body.textContent).toContain('文件太大')
    w.unmount()
  })

  it('**ImagePreview @close → 关闭预览**', async () => {
    const w = mountPanel()
    await flushPromises()
    const vm = vmOf(w)
    vm.openPreview('data:image/png;base64,AAAA')
    await nextTick()
    w.findComponent(ImagePreview).vm.$emit('close')
    await nextTick()
    expect(vm.previewVisible).toBe(false)
    w.unmount()
  })
})

/* ═══════════ ⑦ 清空确认的分支 ═══════════ */

describe('一键清空', () => {
  it('**无上传记录时不弹确认**（点清空直接忽略）', async () => {
    const w = mountPanel()
    await flushPromises()
    const vm = vmOf(w)
    vm.requestClearAll()
    await nextTick()
    expect(vm['clearConfirmVisible'], '空数据不弹窗').toBe(false)
    w.unmount()
  })

  it('**有记录时确认 → 清空后端并提示**', async () => {
    hs.loaded.set(1, { slots: { front: fileA }, ts: 5 })
    const w = mountPanel()
    await flushPromises()
    const vm = vmOf(w)
    vm.requestClearAll()
    await nextTick()
    expect(vm['clearConfirmVisible']).toBe(true)
    await vm.onConfirmClear()
    await flushPromises()
    expect(hs.calls.clear, '调了 clearAll').toBe(1)
    expect(vm.uploadMap.size, '本地状态也清空').toBe(0)
    expect(document.body.textContent, '成功提示').toContain(t('fbTarget.cleared'))
    w.unmount()
  })

  it('**清空失败 → 提示且不静默**', async () => {
    hs.loaded.set(1, { slots: { front: fileA }, ts: 5 })
    hs.failClear = true
    const w = mountPanel()
    await flushPromises()
    await vmOf(w).onConfirmClear()
    await flushPromises()
    expect(document.body.textContent, '清空失败的提示').toContain(t('fbTarget.clearFail'))
    w.unmount()
  })
})

/* ═══════════ ⑧ 搜索持久化 ═══════════ */

describe('搜索', () => {
  it('**关键字写入 localStorage**（刷新后保留）', async () => {
    const w = mountPanel()
    await flushPromises()
    vmOf(w).keyword = '门店A'
    await nextTick()
    await nextTick()
    expect(localStorage.getItem('form-target-collect-search')).toBe('门店A')
    w.unmount()
  })

  it('**过滤不命中时渲染空态**', async () => {
    const w = mountPanel()
    await flushPromises()
    vmOf(w).keyword = '根本不存在的目标'
    await nextTick()
    expect(q('.ftc-empty'), '空态出现').not.toBeNull()
    expect(document.querySelectorAll('.ftc-row').length, '没有数据行').toBe(0)
    w.unmount()
  })
})