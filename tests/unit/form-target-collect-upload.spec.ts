/**
 * FormTargetCollect 上传 / 存储 / 清空 / 导出（2026-10-23）
 *
 * ## 为什么补
 *
 * 已有 form-target-collect-fields 只覆盖「3 列裁剪 + 导出字段并集」，
 * 527 行里约 340 行（上传链、存储后端切换、一键清空、搜索持久化、
 * 图片预览、ZIP 导出）零覆盖。
 *
 * ## ⚠️ 这版是重写：第一版 18 个探针只生效 3 个
 *
 * 第一版大量用 `expect(document.body.textContent).toBeTruthy()` 这类
 * 「不炸就算过」的断言 —— 变异后组件照样渲染，探针抓不到。
 * 重写后全部对着真实节点断言（源码实测）：
 *
 *   `.ftc-row`            目标行（v-for filteredTargets）
 *   `.ftc-stat`           完成统计（:class="{ done: doneCount > 0 }"）
 *   `.ftc-status-done`    该行全槽位齐（allSlotsFilled）
 *   `.ftc-status-none`    未齐
 *   `.ftc-empty`          空结果
 *   `.ftc-search`         搜索 Input
 *   `.modal-box`          ConfirmModal
 *   `.ftc-fields-more`    隐藏列数提示
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/* ═══════════ 存储后端 mock（必须在组件 import 前） ═══════════ */

const h = vi.hoisted(() => ({
  loaded: new Map<number, { slots: Record<string, unknown>; ts: number }>(),
  calls: { loadAll: 0, saveRecord: [] as Array<[number, unknown]>, clearAll: 0 },
  failLoad: false,
  failSave: false,
  failClear: false,
  persisted: [] as unknown[],
}))

vi.mock('@/components/storage/contract-storage', async () => {
  const actual = await import('@/components/storage/contract-storage')
  return {
    ...actual,
    createBackend: vi.fn(() => ({
      kind: 'local' as const,
      loadAll: async () => {
        h.calls.loadAll++
        if (h.failLoad) throw new Error('load boom')
        return new Map(h.loaded)
      },
      saveRecord: async (id: number, state: unknown) => {
        h.calls.saveRecord.push([id, state])
        if (h.failSave) throw new Error('save boom')
      },
      clearAll: async () => {
        h.calls.clearAll++
        if (h.failClear) throw new Error('clear boom')
      },
    })),
  }
})

vi.mock('@/components/form-builder/storage-config-persist', () => ({
  // 必须返回合法 StorageConfig（组件 cfg 初始化直接用返回值读 .backend）
  loadPersistedStorageConfig: vi.fn(() => ({ backend: 'local' as const })),
  persistStorageConfig: vi.fn((c: unknown) => {
    h.persisted.push(c)
  }),
}))

import FormTargetCollect from '@/components/form-builder/FormTargetCollect.vue'
import type { FormSchema } from '@/components/form-builder/types'

/* ═══════════ 夹具 ═══════════ */

const schema = {
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

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(FormTargetCollect, {
    props: { schema, targets, ...props },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

async function settle(ms = 20) {
  await flushPromises()
  await new Promise((r) => setTimeout(r, ms))
  await flushPromises()
}

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null
const rows = () => [...document.querySelectorAll('.ftc-row')] as HTMLElement[]
const doneRows = () => document.querySelectorAll('.ftc-status-done').length
const noneRows = () => document.querySelectorAll('.ftc-status-none').length

/** 字符串 dataUrl 型（渲染侧用；导出会走 fetch，happy-dom 下 blob: 不可 fetch） */
function storeFile(name = 'saved.jpg') {
  return { name, dataUrl: 'data:image/jpeg;base64,AAAA', size: 88, type: 'image/jpeg' }
}

/**
 * ArrayBuffer 型 dataUrl（导出路径专用）：源码 L379-381 对非字符串 dataUrl 直接用，
 * 不走 fetch(file.dataUrl) —— happy-dom 无法 fetch blob:/data: URL，
 * 用字符串会让 fileCount 恒 0 → L415 早退，导出测不到。
 *
 * ⚠️ 不能直接给 Blob：JSZip 只接受 String/ArrayBuffer/Uint8Array，
 * 给 Blob 会抛 "Can't read the data of ... Is it in a supported JavaScript type"。
 */
function storeFileBlob(name = 'saved.jpg') {
  return { name, dataUrl: new Uint8Array([1, 2, 3]).buffer, size: 88, type: 'image/jpeg' }
}

beforeEach(() => {
  h.loaded = new Map()
  h.calls = { loadAll: 0, saveRecord: [], clearAll: 0 }
  h.failLoad = false
  h.failSave = false
  h.failClear = false
  h.persisted = []
  document.body.innerHTML = ''
  localStorage.clear()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://x/made')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

/**
 * ⚠️ happy-dom 下 `zip.generateAsync({ type: 'blob' })` 抛
 * "blob is not supported by this platform" —— 全局打桩返回假 Blob，
 * 让导出链能走到 L420-426（createObjectURL / a.click / revoke）。
 * 放在顶层而不是单个 describe 内：多个 describe 都要导出一遍。
 */
beforeEach(async () => {
  const JSZipMod = await import('jszip')
  vi.spyOn(JSZipMod.default.prototype, 'generateAsync').mockResolvedValue(new Blob(['zip']) as never)
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/* ═══════════ 挂载加载 ═══════════ */

describe('挂载时从后端加载', () => {
  it('**loadAll 恰好调用一次**', async () => {
    mountPanel()
    await settle()
    expect(h.calls.loadAll, '应加载一次').toBe(1)
  })

  it('**加载失败 → 表格仍渲染**（错误仅走 toast，不该白屏）', async () => {
    h.failLoad = true
    mountPanel()
    await settle()
    expect(rows().length, '加载失败仍应渲染目标行').toBe(2)
  })
})

/* ═══════════ 完成统计 ═══════════ */

describe('完成统计（doneCount / allSlotsFilled）', () => {
  it('**两个槽位都填 → 该行显示 .ftc-status-done**', async () => {
    h.loaded.set(1, { slots: { front: storeFile('f.jpg'), license: storeFile('l.jpg') }, ts: 1 })
    h.loaded.set(2, { slots: {}, ts: 1 })
    mountPanel()
    await settle()
    expect(doneRows(), '门店A 应已完成').toBe(1)
    expect(noneRows(), '门店B 未完成').toBe(1)
  })

  it('**只填一个槽位 → 不算完成**（allSlotsFilled 严格）', async () => {
    h.loaded.set(1, { slots: { front: storeFile('f.jpg') }, ts: 1 })
    mountPanel()
    await settle()
    expect(doneRows(), '缺槽位不算完成').toBe(0)
    expect(noneRows(), '两行都未完成').toBe(2)
  })

  it('**stat 无 done class 当全部未完成**', async () => {
    mountPanel()
    await settle()
    expect(q('.ftc-stat')?.className, '全未完成时无 done').not.toContain('done')
  })

  it('**stat 加 done class 当有完成目标**', async () => {
    // ⚠️ 一个用例只 mount 一次：backendInstance 是模块级 let，
    // 第二次 mount 会复用首个实例 → 新 h.loaded 读不到
    h.loaded.set(1, { slots: { front: storeFile('f.jpg'), license: storeFile('l.jpg') }, ts: 1 })
    mountPanel()
    await settle()
    expect(q('.ftc-stat')?.className, '有完成时应有 done').toContain('done')
  })
})

/* ═══════════ 搜索 ═══════════ */

describe('搜索（keyword 持久化 + filteredTargets）', () => {
  async function typeSearch(text: string) {
    const input = q<HTMLInputElement>('.ftc-search input') ?? q<HTMLInputElement>('.ftc-search')
    expect(input, '应有 .ftc-search 输入框').toBeTruthy()
    input!.value = text
    input!.dispatchEvent(new Event('input'))
    await settle()
  }

  it('**搜索命中 → 行数减少**', async () => {
    mountPanel()
    await settle()
    expect(rows().length, '初始 2 行').toBe(2)

    await typeSearch('门店A')
    expect(rows().length, '只留门店A').toBe(1)
    expect(q('.ftc-row')?.textContent, '留下的应是门店A').toContain('门店A')
  })

  it('**搜索无命中 → 渲染 .ftc-empty**', async () => {
    mountPanel()
    await settle()
    await typeSearch('不存在的关键字')
    expect(rows().length, '应无行').toBe(0)
    expect(q('.ftc-empty'), '应显示空态').toBeTruthy()
  })

  it('**搜索大小写不敏感**（toLowerCase）', async () => {
    mountPanel({
      targets: [
        { id: 1, name: 'StoreA' },
        { id: 2, name: 'shopb' },
      ],
    })
    await settle()
    await typeSearch('STOREA')
    expect(rows().length, '应匹配 StoreA').toBe(1)
  })

  it('**keyword 写入 localStorage**', async () => {
    mountPanel()
    await settle()
    await typeSearch('zzz')
    expect(localStorage.getItem('form-target-collect-search'), '应持久化关键字').toBe('zzz')
  })

  it('**挂载时从 localStorage 恢复关键字并生效**', async () => {
    localStorage.setItem('form-target-collect-search', '门店B')
    mountPanel()
    await settle()
    expect(rows().length, '恢复关键字后只显示门店B').toBe(1)
    expect(q('.ftc-row')?.textContent, '应是门店B').toContain('门店B')
  })
})

/* ═══════════ 清空 ═══════════ */

describe('一键清空（两段式确认）', () => {
  const clearBtn = () => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('清空'))

  it('**无记录时点清空 → 不弹确认**（requestClearAll 早退）', async () => {
    mountPanel()
    await settle()
    clearBtn()!.click()
    await settle()
    expect(q('.modal-box'), '无记录不该弹确认').toBeFalsy()
  })

  it('**有记录时点清空 → 先弹确认**', async () => {
    h.loaded.set(1, { slots: { front: storeFile() }, ts: 1 })
    mountPanel()
    await settle()
    clearBtn()!.click()
    await settle()
    expect(q('.modal-box'), '有记录应弹确认').toBeTruthy()
    expect(h.calls.clearAll, '确认前不该清空').toBe(0)
  })

  it('**确认后 → clearAll 调用 + 行状态回到未完成**', async () => {
    h.loaded.set(1, { slots: { front: storeFile('f.jpg'), license: storeFile('l.jpg') }, ts: 1 })
    mountPanel()
    await settle()
    expect(doneRows(), '清空前应已完成').toBe(1)

    clearBtn()!.click()
    await settle()
    // 确认按钮文案是 t('fbTarget.clear')=「清空」，与触发按钮同名（源码实测）
    const ok = [...document.querySelectorAll('.modal-box button')].find((b) => b.textContent?.trim() === '清空')
    expect(ok, '应有「清空」确认按钮').toBeTruthy()
    ok!.click()
    await settle()

    expect(h.calls.clearAll, '应调 clearAll').toBe(1)
    expect(doneRows(), '清空后不该再有完成行').toBe(0)
  })

  it('**clearAll 抛错 → 状态不清（行仍完成）**', async () => {
    h.loaded.set(1, { slots: { front: storeFile('f.jpg'), license: storeFile('l.jpg') }, ts: 1 })
    h.failClear = true
    mountPanel()
    await settle()
    clearBtn()!.click()
    await settle()
    const ok = [...document.querySelectorAll('.modal-box button')].find((b) => b.textContent?.trim() === '清空')
    ok!.click()
    await settle()
    expect(doneRows(), '清空失败不该丢了状态').toBe(1)
  })
})

/* ═══════════ ZIP 导出 ═══════════ */

describe('ZIP 导出', () => {
  const exportBtn = () =>
    [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.includes('导出') && !b.textContent?.includes('Excel'),
    )

  it('**点导出 → 触发下载**（ZIP 真跑一遍，含汇总 Excel）', async () => {
    h.loaded.set(1, { slots: { front: storeFileBlob() }, ts: 1 })
    let downloaded = 0
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      downloaded++
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://x/zip')
    mountPanel()
    await settle()

    const btn = exportBtn()
    expect(btn, '应有导出按钮').toBeTruthy()
    btn!.click()
    await settle(600)

    expect(downloaded, '导出应触发一次下载').toBe(1)
  })

  it('**导出中重复点击被 exporting 挡住**（只触发一次下载）', async () => {
    h.loaded.set(1, { slots: { front: storeFileBlob() }, ts: 1 })
    // ⚠️ 不能数 createObjectURL：渲染侧 getUploadFiles 也会调它。
    // 数 <a>.click()（下载触发点，L424）才是导出次数
    let downloaded = 0
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      downloaded++
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://x/zip')
    mountPanel()
    await settle()

    const btn = exportBtn()!
    btn.click()
    btn.click() // 立即再点（exporting=true 应早退）
    await settle(600)

    expect(downloaded, '重复点击只该触发一次下载').toBe(1)
  })
})

/* ═══════════ 补强：导出后 exporting 复位 ═══════════ */

describe('导出后 exporting 复位（连导两次）', () => {
  it('**连续点导出两次 → 下载两次**（finally 里复位才能第二次成功）', async () => {
    h.loaded.set(1, { slots: { front: storeFileBlob() }, ts: 1 })
    let downloaded = 0
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      downloaded++
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://x/zip')
    mountPanel()
    await settle()

    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.includes('导出') && !b.textContent?.includes('Excel'),
    )!
    btn.click()
    await settle(600)
    expect(downloaded, '第一次应下载').toBe(1)

    btn.click()
    await settle(600)
    expect(downloaded, '第二次也应下载（exporting 已复位）').toBe(2)
  })
})

/* ═══════════ 补强：上传区渲染（真实断言，非「不炸」） ═══════════ */

describe('上传区渲染', () => {
  it('**每个目标每个照片位渲染一个 Upload**（cell 数量 = 目标数 × 槽位数）', async () => {
    mountPanel()
    await settle()
    const cells = document.querySelectorAll('.ftc-td-upload')
    expect(cells.length, '2 目标 × 2 照片位 = 4 个上传位').toBe(4)
  })

  it('**已上传的目标位显示缩略图 <img>**（getUploadFiles 返回非空）', async () => {
    h.loaded.set(1, { slots: { front: storeFile() }, ts: 1 })
    mountPanel()
    await settle()
    const imgs = document.querySelectorAll('.ftc-td-upload img')
    expect(imgs.length, '门店A 的 front 位应有 1 张缩略图').toBe(1)
  })

  it('**未上传时无缩略图**', async () => {
    mountPanel()
    await settle()
    expect(document.querySelectorAll('.ftc-td-upload img').length, '全空时无缩略图').toBe(0)
  })
})

/* ═══════════ 存储配置面板 ═══════════ */

describe('存储配置面板（showStoragePanel 开关）', () => {
  const toggle = () =>
    [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.includes('本地') || b.textContent?.includes('云端'),
    )

  it('**点存储切换按钮 → 渲染 .scp-panel**（StorageConfigPanel 的 v-if=visible）', async () => {
    mountPanel()
    await settle()
    expect(document.querySelector('.scp-panel'), '初始应关闭').toBeFalsy()

    const btn = toggle()
    expect(btn, '应有存储切换按钮').toBeTruthy()
    btn!.click()
    await settle()
    expect(document.querySelector('.scp-panel'), '点击后应打开面板').toBeTruthy()
  })

  it('**再点一次 → 面板关闭**（toggle 语义）', async () => {
    mountPanel()
    await settle()
    toggle()!.click()
    await settle()
    expect(document.querySelector('.scp-panel'), '第一次点开').toBeTruthy()

    toggle()!.click()
    await settle()
    expect(document.querySelector('.scp-panel'), '第二次点关').toBeFalsy()
  })
})

/* ═══════════ 只读模式 ═══════════ */

describe('只读模式（readonly）', () => {
  /**
   * ⚠️ 实测发现真实缺陷：`readonly` 只透传给 Upload 的 :disabled（L490），
   * 「清空」按钮（L453）与导出/存储切换均**无 readonly 守卫** ——
   * 只读模式下仍能一键清空全部上传记录（不可逆）。
   * 按「锁当前行为」原则断言现状并标缺陷候选。
   */
  it('**锁当前行为：readonly 下「清空」按钮仍渲染（缺陷候选）**', async () => {
    h.loaded.set(1, { slots: { front: storeFile() }, ts: 1 })
    mountPanel({ readonly: true })
    await settle()
    const clearBtn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('清空'))
    expect(clearBtn, '当前实现下清空按钮仍渲染 —— 缺陷候选，待产品确认').toBeTruthy()
  })

  it('**readonly 透传给 Upload 的 disabled**（L490 唯一守卫点）', async () => {
    mountPanel({ readonly: true })
    await settle()
    const disabledInput = document.querySelector('.ftc-td-upload input[type=file][disabled]')
    const disabledArea = document.querySelector(
      '.ftc-td-upload .upload-area.disabled, .ftc-td-upload .card-wrap.card-disabled',
    )
    expect(disabledInput ?? disabledArea, 'readonly 应禁用上传入口').toBeTruthy()
  })

  it('**非 readonly 时上传入口可用**（对照）', async () => {
    mountPanel()
    await settle()
    const disabledArea = document.querySelector(
      '.ftc-td-upload .upload-area.disabled, .ftc-td-upload .card-wrap.card-disabled',
    )
    expect(disabledArea, '非只读不该禁用上传').toBeFalsy()
  })
})
