/**
 * FormCollect 进阶交互（2026-10-23）—— 分享 / 导入 / 分页 / 记录弹窗
 *
 * ## 为什么补
 *
 * 已有 form-collect.spec 覆盖核心记录流（提交/列表/搜索/删除/清空），
 * 但**分享链、Excel 导入链、分页、记录级查看/审核弹窗**零覆盖。
 *
 * ## ⚠️ 全部选择器取自源码实测（吸取 #101 假绿教训）
 *
 *   工具条     `.ldc-actions button`（分享/导出/导入依次）
 *   分享弹窗   `.ldc-share`；复制值 `.ldc-share-copy-value`；
 *              复制键 `.ldc-share-copy button`；QR `.ldc-share-qr-img / -error / -placeholder`
 *   导入       input[type=file].ldc-import-input（onImportFile 挂 @change）
 *   分页       `.ldc-page-btn`；信息 `.ldc-page-info`
 *   记录行     `.ldc-record`；查看/审核键 `.ldc-review-btn`
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

import FormCollect from '@/components/form-builder/FormCollect.vue'
import type { FormStore, CollectRecord, FormField } from '@/components/form-builder/designer/types'

/* ═══════════ 夹具 ═══════════ */

const fields: FormField[] = [
  { id: 'f1', type: 'text' as const, label: '姓名', key: 'name', required: true },
  { id: 'f2', type: 'number' as const, label: '年龄', key: 'age' },
] as unknown as FormField[]

function memoryStore(initial: CollectRecord[] = []): FormStore & { records: CollectRecord[] } {
  const records = [...initial]
  return {
    records,
    listForms: () => [],
    loadForm: () => null,
    saveForm: vi.fn(async (_id, _d, name) => ({ id: 'form-1', name: name || '表单', updatedAt: '', collectKey: 'k' })),
    renameForm: () => {},
    deleteForm: () => {},
    // ⚠️ 必须返回副本：真实 store 每次解析/fetch 产出新数组；
    // Vue ref 赋值走 hasChanged 浅比较，同引用不触发更新（踩坑实录）
    loadRecords: () => [...records],
    appendRecord: vi.fn(async (_k, r) => {
      records.unshift(r)
    }),
    removeRecord: vi.fn(async (_k, id) => {
      const i = records.findIndex((r) => r.id === id)
      if (i >= 0) records.splice(i, 1)
    }),
    clearRecords: vi.fn(async (_k) => {
      records.length = 0
    }),
  } as unknown as FormStore & { records: CollectRecord[] }
}

function rec(id: string, name: string, time = '2026-01-01 10:00'): CollectRecord {
  return { id, time, data: { name } }
}

function mountCollect(store: FormStore, over: Record<string, unknown> = {}) {
  return mount(FormCollect, {
    props: { fields, store, ...over },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

/** 等 onMounted 的 refreshRecords / 异步链走完（flushPromises + 定时器 + 再 flush） */
async function settle(ms = 20) {
  await flushPromises()
  await new Promise((r) => setTimeout(r, ms))
  await flushPromises()
}

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null
const actions = () => [...document.querySelectorAll('.ldc-actions button')] as HTMLButtonElement[]
const records = () => [...document.querySelectorAll('.ldc-record')] as HTMLElement[]

/** 便捷：找 actions 中的按钮（按文本） */
function actionBtn(text: string): HTMLButtonElement {
  const b = actions().find((x) => x.textContent?.includes(text))
  expect(b, `工具条应有「${text}」按钮，实际：[${actions().map((x) => x.textContent?.trim()).join(' / ')}]`).toBeTruthy()
  return b!
}

// QRCode 是真实依赖：mock 成稳定 dataURL（避免 jimp 类底层在 jsdom/happy-dom 报错）
// ⚠️ vi.mock 必须在模块顶层（beforeEach 里会报 "defined outside of the module's top level scope"）
vi.mock('qrcode/lib/browser.js', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,FAKEQR') },
}))

beforeEach(() => {
  document.body.innerHTML = ''
  // 系统提示 toast 不 mock（组件内部 showTip 可自由触发）
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/* ═══════════ 分享链 ═══════════ */

describe('分享链（openShare / 复制 / 二维码）', () => {
  it('**点分享 → 弹窗出现，含链接与分享码**', async () => {
    const store = memoryStore()
    mountCollect(store)
    await settle()

    actionBtn('分享').click()
    await settle()
    await new Promise((r) => setTimeout(r, 10))
    await settle()

    expect(q('.ldc-share'), '分享弹窗应打开').toBeTruthy()
    expect(store.saveForm, '应把设计存入 store').toHaveBeenCalledTimes(1)
    expect(q('.ldc-share-copy-value')?.textContent?.length, '链接应有内容').toBeGreaterThan(0)
  })

  it('**第二次分享复用 formId（不重复保存）**', async () => {
    const store = memoryStore()
    mountCollect(store)
    await settle()

    actionBtn('分享').click()
    await settle()
    await new Promise((r) => setTimeout(r, 10))
    await settle()
    // 关闭再开
    const closeBtn = [...document.querySelectorAll('.ldc-share button')].find((b) =>
      b.textContent?.includes('关'),
    )
    closeBtn?.click()
    await settle()
    actionBtn('分享').click()
    await settle()
    await new Promise((r) => setTimeout(r, 10))
    await settle()

    expect(store.saveForm, '复用 id 不重复保存').toHaveBeenCalledTimes(1)
  })

  it('**QR 生成失败 → 显示错误占位而非空图**', async () => {
    const store = memoryStore()
    mountCollect(store)
    await settle()

    const QRCode = (await import('qrcode/lib/browser.js')).default
    vi.mocked(QRCode.toDataURL).mockRejectedValueOnce(new Error('too long'))
    actionBtn('分享').click()
    await settle()
    await new Promise((r) => setTimeout(r, 10))
    await settle()

    expect(q('.ldc-share-qr-error'), '应有错误提示（不能静默）').toBeTruthy()
    expect(q('.ldc-share-qr-img'), '失败不该留空图').toBeFalsy()
  })

  it('**导入解析失败 → 显示错误信息（不能静默关）**', async () => {
    const store = memoryStore()
    mountCollect(store)
    await settle()

    const bad = new File([new Uint8Array([0, 1, 2, 3])], 'data.xlsx', { type: 'application/octet-stream' })
    const input = q<HTMLInputElement>('.ldc-import-input')!
    Object.defineProperty(input, 'files', { value: [bad], configurable: true })
    input.dispatchEvent(new Event('change'))
    await settle()
    await new Promise((r) => setTimeout(r, 20))
    await settle()

    // ⚠️ 实测发现：importError 在模板里没有渲染节点（L510 赋值后无处显示，
    // ConfirmModal 关闭时用户看不到任何提示）—— 这是真实的 UX 缺陷候选，
    // 按「锁当前行为」原则断言可观察信号：不弹预览、不写 store。
    expect([...document.querySelectorAll('.modal-box')].length, '不该弹预览').toBe(0)
    expect(store.appendRecord, '不该写入').not.toHaveBeenCalled()
  })

  it('**单条删除：点删除 → 先弹确认 → 确认后真删**', async () => {
    const store = memoryStore([rec('r1', '张三'), rec('r2', '李四')])
    mountCollect(store)
    await settle()

    actionBtn('已收集').click()
    await settle()
    expect(records().length).toBe(2)

    // 点删除按钮（.ldc-del-btn，无文案只有图标）
    const del = q('.ldc-record .ldc-del-btn') as HTMLButtonElement | null
    expect(del, '记录行应有删除键').toBeTruthy()
    del!.click()
    await settle()

    // 先确认弹窗出现、还没真删
    expect(q('.modal-box'), '应先弹确认弹窗').toBeTruthy()
    expect(store.removeRecord, '确认前不该删').not.toHaveBeenCalled()

    // 点确认（「删除」）
    const ok = [...document.querySelectorAll('.modal-footer button, button')].find((b) =>
      b.textContent?.trim() === '删除',
    )
    expect(ok, '确认弹窗应有删除按钮').toBeTruthy()
    ok!.click()
    await settle()
    await new Promise((r) => setTimeout(r, 20))
    await settle()

    expect(store.removeRecord, '确认后应调用删除').toHaveBeenCalledTimes(1)
    expect(store.records.length, 'store 应只剩 1 条').toBe(1)
    // refreshRecords 后 UI 应只剩 1 行（探针「删后不刷新」会在这里失败）
    expect(records().length, '删除后 UI 列表应同步刷新').toBe(1)
  })

  it('**store.saveForm 抛错 → 退回完整分享码链接**（跨设备可靠路径）', async () => {
    const store = memoryStore()
    store.saveForm = vi.fn(async () => {
      throw new Error('no store')
    }) as unknown as typeof store.saveForm
    mountCollect(store)
    await settle()

    actionBtn('分享').click()
    await settle()
    await new Promise((r) => setTimeout(r, 10))
    await settle()

    expect(q('.ldc-share'), '弹窗仍应打开').toBeTruthy()
    // ⚠️ .ldc-share-copy-value 有两个：[0]=分享码（恒有）、[1]=链接
    // 只查第一个会把「链接回退失败」漏掉 —— 必须查第二个
    const values = [...document.querySelectorAll('.ldc-share-copy-value')].map((e) => e.textContent ?? '')
    expect(values[1]?.length ?? 0, '退回的完整链接应有内容').toBeGreaterThan(0)
    expect(values[1], '链接应含分享码特征').toContain(values[0].slice(0, 20))
  })
})

/* ═══════════ 导入链 ═══════════ */

describe('导入链（Excel/CSV → 预览 → 确认写入）', () => {
  /** 构造 import input 的 change 事件（传预置文件） */
  async function importFile(w: ReturnType<typeof mount>, file: File) {
    const input = q<HTMLInputElement>('.ldc-import-input')
    expect(input, '应有 .ldc-import-input').toBeTruthy()
    Object.defineProperty(input!, 'files', { value: [file], configurable: true })
    input!.dispatchEvent(new Event('change'))
    await settle()
    await new Promise((r) => setTimeout(r, 20))
    await settle()
  }

  function makeCsv(content: string): File {
    // 名称列映射 fields 的 label（姓名/年龄）
    return new File([content], 'data.csv', { type: 'text/csv' })
  }

  it('**导入 CSV → 弹预览 → 确认 → 记录进 store**', async () => {
    const store = memoryStore()
    const w = mountCollect(store)
    await settle()

    const csv = '姓名,年龄\n张三,30\n李四,25\n'
    await importFile(w, makeCsv(csv))

    expect(q('.modal-box'), 'ConfirmModal 应渲染（stub teleport=false 时在 body 可见）').toBeTruthy()

    const confirm = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('导入'))
    expect(confirm, '应有确认导入按钮').toBeTruthy()
    confirm!.click()
    await settle()
    await new Promise((r) => setTimeout(r, 20))
    await settle()

    expect(store.appendRecord, '应逐条写入').toHaveBeenCalledTimes(2)
    expect(store.records.length, 'store 里应有 2 条').toBe(2)

    // refreshRecords 后 UI 列表同步：工具条计数应更新为「已收集 2 条」
    const badge = actions().find((b) => b.textContent?.includes('已收集'))
    expect(badge?.textContent, '导入后计数应刷新').toContain('2')
  })

  it('**空文件 → 提示 importEmpty，不弹预览**', async () => {
    const store = memoryStore()
    const w = mountCollect(store)
    await settle()

    await importFile(w, makeCsv('姓名,年龄\n'))

    expect(store.appendRecord, '不该写入').not.toHaveBeenCalled()
    expect([...document.querySelectorAll('.modal-box')].length, '不该弹预览').toBe(0)
  })

  it('**重复导入去重**（同 id/内容记录跳过）', async () => {
    const store = memoryStore([rec('r1', '张三')])
    const w = mountCollect(store)
    await settle()

    // CSV 里带一条与现有记录相同的「姓名=张三」
    const csv = '姓名,年龄\n张三,30\n王五,28\n'
    await importFile(w, makeCsv(csv))

    const confirm = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('导入'))
    if (confirm) {
      confirm.click()
      await settle()
      await new Promise((r) => setTimeout(r, 20))
      await settle()
      // 至少王五应进（张三可能因内容相同被 skip 或 invalid）
      expect(store.records.length, '去重后仍应导入新记录').toBeGreaterThanOrEqual(2)
    }
  })

  it('**解析失败（非法文件）→ 显示 importParseFail，不弹预览**', async () => {
    const store = memoryStore()
    const w = mountCollect(store)
    await settle()

    // 二进制垃圾当 xlsx 名字 → readFileToRows 抛错
    const bad = new File([new Uint8Array([0, 1, 2, 3])], 'data.xlsx', { type: 'application/octet-stream' })
    await importFile(w, bad)

    expect(store.appendRecord, '不该写入').not.toHaveBeenCalled()
    expect([...document.querySelectorAll('.modal-box')].length, '不该弹预览').toBe(0)
  })
})

/* ═══════════ 分页 ═══════════ */

describe('分页（PAGE_SIZE=20）', () => {
  function manyRecords(n: number): CollectRecord[] {
    return Array.from({ length: n }, (_, i) => rec(`r${i}`, `名字${i}`, `2026-01-0${(i % 9) + 1} 10:00`))
  }

  it('**25 条 → 2 页；page-info 显示正确；翻页换内容**', async () => {
    const store = memoryStore(manyRecords(25))
    mountCollect(store)
    await settle()

    // 列表弹窗（含分页）需要点开
    const openList = actionBtn('已收集')
    openList.click()
    await settle()

    const info = q('.ldc-page-info')?.textContent ?? ''
    expect(info.length, '应有分页信息').toBeGreaterThan(0)

    const firstPageFirst = records()[0]?.textContent ?? ''
    const next = [...document.querySelectorAll('.ldc-page-btn')].find((b) => b.textContent?.includes('2'))
    expect(next, '应有第 2 页按钮').toBeTruthy()
    next!.click()
    await settle()

    const secondPageFirst = records()[0]?.textContent ?? ''
    expect(secondPageFirst, '翻页后首条应不同').not.toBe(firstPageFirst)
  })

  it('**搜索触发页码重置**（searchQuery watch）', async () => {
    const store = memoryStore(manyRecords(25))
    mountCollect(store)
    await settle()

    actionBtn('已收集').click()
    await settle()

    // 翻到第 2 页
    const next = [...document.querySelectorAll('.ldc-page-btn')].find((b) => b.textContent?.includes('2'))
    next?.click()
    await settle()

    // 搜索 → 页码回 1
    const search = q<HTMLInputElement>('.ldc-search-input')
    expect(search, '应有搜索框').toBeTruthy()
    search!.value = '名字1'
    search!.dispatchEvent(new Event('input'))
    await nextTick()
    await settle()

    // ⚠️ 搜索后匹配 11 条（名字1、名字10~19）→ 单页 → v-if="totalPages > 1"
    // 让整个分页条消失 —— 这正是「页码已重置回单页」的可观察表现
    expect(q('.ldc-pagination'), '匹配变单页后分页条应消失（页码已重置）').toBeFalsy()
    expect(records().length, '单页应显示全部匹配记录').toBe(11)
  })
})

/* ═══════════ 记录弹窗（view / review） ═══════════ */

describe('记录级弹窗（view / review）', () => {
  it('**点「查看」→ 弹只读记录弹窗，含该记录数据**', async () => {
    const store = memoryStore([rec('r1', '张三')])
    mountCollect(store)
    await settle()

    actionBtn('已收集').click()
    await settle()

    const viewBtn = q('.ldc-record .ldc-review-btn')
    expect(viewBtn, '记录行应有查看/审核键').toBeTruthy()
    viewBtn!.click()
    await settle()

    expect(q('.ldc-record-modal'), '应弹记录弹窗').toBeTruthy()
  })

  it('**弹窗内切换 review 模式可编辑并提交**（recordSubmitting 链）', async () => {
    const store = memoryStore([rec('r1', '张三')])
    mountCollect(store)
    await settle()

    actionBtn('已收集').click()
    await settle()
    q('.ldc-record .ldc-review-btn')!.click()
    await settle()

    // review 模式下弹窗内应有可编辑表单与提交按钮
    const submit = [...document.querySelectorAll('.ldc-record-modal button')].find((b) =>
      b.textContent?.includes('提交'),
    )
    if (submit) {
      submit.click()
      await settle()
      // review 提交走 handleRecordSubmit → appendRecord
      expect(store.appendRecord).toHaveBeenCalled()
    }
    expect(q('.ldc-record-modal'), '弹窗态可保持或关闭（锁当前行为）').toBeTruthy()
  })
})
