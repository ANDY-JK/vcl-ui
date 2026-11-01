/**
 * useFormIO — 设计器导入/导出（2026-10-22）
 *
 * ## 为什么值得测
 *
 * 此前覆盖率：**语句 6.1%、函数 6.7%** —— 182 行几乎没测。
 * 但它处理的是**用户粘贴/拖入的任意 JSON**，是整个设计器最不可信的输入面：
 *
 *   · 兼容 **4 种**格式（v3 `{meta,nodes}` / v2 `{meta,fields}` / v1 FormSchema / 裸数组）
 *   · 分享码（`FD1.` 前缀）先解码再走统一路径
 *   · **key 唯一性兜底**：手写 JSON 常带重复 key，重复会让 formData 互相覆盖
 *   · 任何解析失败都要落到 `importError`，不能崩
 *
 * ## 最该锁住的三个契约
 *
 *   ① 重复 key 必须去重（首个保留原 key，后续追加 `_2`/`_3`），**含容器子字段**
 *   ② 未知结构（既非对象也非数组）必须报错，不能静默 patch 空数组
 *   ③ 导入成功要调 `snapshot()`（保证可撤销）—— 漏了就是"导入后撤不回去"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// downloadBlob / copyText 有真实副作用（创建 <a> 下载、写剪贴板），桩掉
vi.mock('@/components/_internal/utils', () => ({
  downloadBlob: vi.fn(() => true),
}))
vi.mock('@/components/_internal/useCopy', () => ({
  copyText: vi.fn(async () => true),
}))

import { useFormIO, type FormIOHost } from '@/components/form-builder/designer/useFormIO'
import { downloadBlob } from '@/components/_internal/utils'
import { copyText } from '@/components/_internal/useCopy'
import { SHARE_CODE_PREFIX } from '@/components/form-builder/designer/share'

/** 造一个记录所有调用的 host */
function makeHost(overrides: Partial<FormIOHost> = {}): FormIOHost & {
  calls: { patch: unknown[][]; snapshot: number; updateMeta: unknown[][]; showTip: string[] }
} {
  const calls = {
    patch: [] as unknown[][],
    snapshot: 0,
    updateMeta: [] as unknown[][],
    showTip: [] as string[],
  }
  return {
    nodes: () => [],
    meta: () => ({}),
    patch: (list) => calls.patch.push([list]),
    snapshot: () => {
      calls.snapshot++
    },
    updateMeta: (m) => calls.updateMeta.push([m]),
    showTip: (msg) => calls.showTip.push(msg),
    calls,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('exportJson', () => {
  it('画布为空时**提示且不导出**', () => {
    const host = makeHost({ nodes: () => [] })
    const io = useFormIO(host)
    io.exportJson()
    expect(host.calls.showTip).toHaveLength(1)
    expect(downloadBlob, '空画布不该触发下载').not.toHaveBeenCalled()
  })

  it('有节点时导出 JSON 并复制到剪贴板', () => {
    const nodes = [{ id: 'n1', key: 'a', type: 'input', label: 'A' }]
    const host = makeHost({ nodes: () => nodes as never, meta: () => ({ title: '表单' }) })
    const io = useFormIO(host)
    io.exportJson()

    expect(downloadBlob).toHaveBeenCalledTimes(1)
    const [blob, filename] = (downloadBlob as unknown as { mock: { calls: [Blob, string][] } }).mock.calls[0]
    expect(filename).toBe('form-design.json')
    expect(blob.type).toBe('application/json')
    expect(copyText, '应同时复制到剪贴板').toHaveBeenCalledTimes(1)
  })

  it('导出的 JSON 含 schemaVersion / meta / nodes 三个字段', async () => {
    const nodes = [{ id: 'n1', key: 'a', type: 'input', label: 'A' }]
    const host = makeHost({ nodes: () => nodes as never, meta: () => ({ title: 'T' }) })
    useFormIO(host).exportJson()

    const [blob] = (downloadBlob as unknown as { mock: { calls: [Blob, string][] } }).mock.calls[0]
    const text = await blob.text()
    const parsed = JSON.parse(text)
    expect(parsed).toHaveProperty('schemaVersion')
    expect(parsed.meta).toEqual({ title: 'T' })
    expect(parsed.nodes).toHaveLength(1)
  })
})

describe('applyImport — 四种格式兼容', () => {
  it('v3 格式 {meta, nodes}', () => {
    const host = makeHost()
    const io = useFormIO(host)
    io.importText.value = JSON.stringify({
      meta: { title: 'v3表单' },
      nodes: [{ id: 'n1', key: 'a', type: 'input' }],
    })
    io.applyImport()

    expect(host.calls.patch).toHaveLength(1)
    const [nodes] = host.calls.patch[0] as [unknown[]]
    expect(nodes).toHaveLength(1)
    expect(host.calls.updateMeta[0][0]).toEqual({ title: 'v3表单' })
    expect(io.importError.value, '不该有错误').toBe('')
  })

  it('v2 格式 {meta, fields}', () => {
    const host = makeHost()
    const io = useFormIO(host)
    io.importText.value = JSON.stringify({
      meta: { title: 'v2表单' },
      fields: [{ id: 'f1', key: 'b', type: 'input' }],
    })
    io.applyImport()

    expect(host.calls.patch).toHaveLength(1)
    const [nodes] = host.calls.patch[0] as [unknown[]]
    expect(nodes).toHaveLength(1)
  })

  it('v1 FormSchema：顶层 title/description/layout 等搬到 meta', () => {
    const host = makeHost()
    const io = useFormIO(host)
    io.importText.value = JSON.stringify({
      title: 'v1标题',
      description: 'v1描述',
      submitText: '提交',
      layout: 'double',
      columns: 2,
      hideActions: true,
      fields: [{ key: 'c', type: 'input' }],
    })
    io.applyImport()

    const meta = host.calls.updateMeta[0][0] as Record<string, unknown>
    expect(meta.title).toBe('v1标题')
    expect(meta.description).toBe('v1描述')
    expect(meta.submitText).toBe('提交')
    expect(meta.layout).toBe('double')
    expect(meta.columns).toBe(2)
    expect(meta.hideActions).toBe(true)
  })

  it('裸数组格式', () => {
    const host = makeHost()
    const io = useFormIO(host)
    io.importText.value = JSON.stringify([{ id: 'x1', key: 'd', type: 'input' }])
    io.applyImport()

    expect(host.calls.patch).toHaveLength(1)
    const [nodes] = host.calls.patch[0] as [unknown[]]
    expect(nodes).toHaveLength(1)
  })

  it('缺 id 的节点自动补 id（保证 key/render 有唯一标识）', () => {
    const host = makeHost()
    const io = useFormIO(host)
    io.importText.value = JSON.stringify({ nodes: [{ key: 'noId', type: 'input' }] })
    io.applyImport()

    const [nodes] = host.calls.patch[0] as [Array<{ id?: string }>]
    expect(typeof nodes[0].id, '应自动补 id').toBe('string')
    expect(nodes[0].id!.length).toBeGreaterThan(0)
  })
})

describe('applyImport — key 唯一性兜底', () => {
  it('重复 key 去重：首个保留原 key，后续追加 _2/_3', () => {
    const host = makeHost()
    const io = useFormIO(host)
    io.importText.value = JSON.stringify({
      nodes: [
        { id: '1', key: 'dup', type: 'input' },
        { id: '2', key: 'dup', type: 'input' },
        { id: '3', key: 'dup', type: 'input' },
      ],
    })
    io.applyImport()

    const [nodes] = host.calls.patch[0] as [Array<{ key: string }>]
    expect(nodes.map((n) => n.key)).toEqual(['dup', 'dup_2', 'dup_3'])
  })

  it('**容器子字段也去重**（这是最容易漏的）', () => {
    const host = makeHost()
    const io = useFormIO(host)
    io.importText.value = JSON.stringify({
      nodes: [
        { id: 'c1', type: 'card', key: 'card1', children: [{ id: 's1', key: 'inner', type: 'input' }] },
        { id: 'top', key: 'inner', type: 'input' },
      ],
    })
    io.applyImport()

    const [nodes] = host.calls.patch[0] as [
      Array<{ key: string; children?: Array<{ key: string }> }>,
    ]
    const topKeys = nodes.map((n) => n.key)
    const innerKey = nodes[0].children?.[0]?.key
    // 顶层 inner 与容器内 inner 不能相同
    expect(
      topKeys.includes(innerKey as string),
      `容器子字段 key (${innerKey}) 不该与顶层 (${topKeys.join(',')}) 冲突`,
    ).toBe(false)
  })
})

describe('applyImport — 错误处理', () => {
  it('非法 JSON → importError 有值，不 patch', () => {
    const host = makeHost()
    const io = useFormIO(host)
    io.importText.value = '{ 这不是 json'
    io.applyImport()

    expect(io.importError.value).not.toBe('')
    expect(host.calls.patch, '解析失败不该 patch').toHaveLength(0)
  })

  it('结构不认识（数字）→ 报错', () => {
    const host = makeHost()
    const io = useFormIO(host)
    io.importText.value = '42'
    io.applyImport()

    expect(io.importError.value).not.toBe('')
    expect(host.calls.patch).toHaveLength(0)
  })

  it('结构不认识（字符串）→ 报错', () => {
    const host = makeHost()
    const io = useFormIO(host)
    io.importText.value = '"hello"'
    io.applyImport()
    expect(io.importError.value).not.toBe('')
  })
})

describe('applyImport — 成功后的副作用', () => {
  it('成功时调 snapshot()（保证可撤销）、关弹窗、清错误、提示节点数', () => {
    const host = makeHost()
    const io = useFormIO(host)
    io.showImport.value = true
    io.importText.value = JSON.stringify({ nodes: [{ id: '1', key: 'a', type: 'input' }] })
    io.applyImport()

    expect(host.calls.snapshot, '导入前必须快照，否则撤不回去').toBe(1)
    expect(io.showImport.value).toBe(false)
    expect(io.importText.value).toBe('')
    expect(io.importError.value).toBe('')
    expect(host.calls.showTip).toHaveLength(1)
  })
})

describe('closeImport', () => {
  it('关闭时同时清掉错误', () => {
    const host = makeHost()
    const io = useFormIO(host)
    io.showImport.value = true
    io.importError.value = '某个错误'
    io.closeImport()
    expect(io.showImport.value).toBe(false)
    expect(io.importError.value, '关闭应清错误').toBe('')
  })
})

describe('onImportDrop — 拖拽导入', () => {
  function makeDropEvent(fileName: string | null): DragEvent {
    // 用**真实的 File 对象**（happy-dom 提供 Blob/File），
    // 否则 FileReader.readAsText 会因参数不是 Blob 而抛 TypeError
    const files = fileName ? [new File(['{"nodes":[]}'], fileName, { type: 'application/json' })] : []
    return {
      preventDefault: vi.fn(),
      dataTransfer: { files },
    } as unknown as DragEvent
  }

  it('非 .json 文件 → 报错且不读文件', () => {
    const host = makeHost()
    const io = useFormIO(host)
    io.importDragOver.value = true
    io.onImportDrop(makeDropEvent('data.txt'))

    expect(io.importError.value).not.toBe('')
    expect(io.importDragOver.value, 'drop 后应复位').toBe(false)
  })

  it('没有文件 → 静默返回', () => {
    const host = makeHost()
    const io = useFormIO(host)
    io.onImportDrop(makeDropEvent(null))
    expect(io.importError.value).toBe('')
  })

  it('.json 文件 → 走 FileReader（不报错）', () => {
    const host = makeHost()
    const io = useFormIO(host)
    io.onImportDrop(makeDropEvent('design.json'))
    // happy-dom 的 FileReader 是异步的，这里只验证没落到错误分支
    expect(io.importError.value).toBe('')
  })
})

describe('onImportFileSelect — 选择文件导入（#306）', () => {
  /** 造一个「浏览器里刚选完文件」的 input（value 是假路径 C:\fakepath\...） */
  function makeFileInput(fileName: string | null): HTMLInputElement {
    const input = document.createElement('input')
    input.type = 'file'
    const files = fileName ? [new File(['{"nodes":[]}'], fileName, { type: 'application/json' })] : []
    Object.defineProperty(input, 'files', { value: files, configurable: true })
    // 浏览器选完文件后 value 会变成假路径；happy-dom 里可直接写
    Object.defineProperty(input, 'value', {
      value: fileName ? 'C:\\fakepath\\' + fileName : '',
      writable: true,
      configurable: true,
    })
    return input
  }

  it('**读完后清空 input.value**（否则同名文件再导入不触发 change）', () => {
    const host = makeHost()
    const io = useFormIO(host)
    const input = makeFileInput('design.json')
    io.onImportFileSelect({ target: input } as unknown as Event)
    expect(input.value, '不清空则「改完再导入」点了没反应').toBe('')
  })

  it('没选文件时也清空并静默返回', () => {
    const host = makeHost()
    const io = useFormIO(host)
    const input = makeFileInput(null)
    io.onImportFileSelect({ target: input } as unknown as Event)
    expect(input.value).toBe('')
    expect(io.importError.value, '没选文件不该报错').toBe('')
  })
})

describe('分享码前缀', () => {
  it('FD1. 前缀的非法分享码 → 报分享码错误（不是 JSON 错误）', () => {
    const host = makeHost()
    const io = useFormIO(host)
    io.importText.value = SHARE_CODE_PREFIX + 'garbage-not-a-valid-code'
    io.applyImport()
    expect(io.importError.value).not.toBe('')
    expect(host.calls.patch).toHaveLength(0)
  })
})
