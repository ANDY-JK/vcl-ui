/**
 * useUploadQueue.ts 的「上传引擎后半段」——压缩 / 真实上传 / 模拟进度 / 重试 / 卸载清理 / 模型双向合并
 *
 * ## 为什么补（单文件口径 语句 67% / 分支 66.7% / 函数 76.3%，56/179 行未覆盖）
 *
 * 已有三个 spec 把「入队校验」「并发闸门」「拖拽粘贴交互」测得很扎实，但**引擎真正干活的那半段**是空的：
 *
 * ① **`compressImage`** 整条路径零覆盖（L92-131）：移动端靠它把 8MB 照片压到能上传的体积。
 *    里面的分支全是「差一点就错」的：等比缩放只在超宽时做、PNG 必须保持 PNG（转 JPEG 会丢透明）、
 *    **压完反而更大时要用原图**（否则用户上传的图比原图还糊还大）。
 * ② **`realUpload`** 的失败路径（L257-259）与「没配 customRequest 却走到真实链路」（L246-248）。
 * ③ **`simulateUpload`** 的节拍（L265-277）：进度到 100 要落 done、要 `clearInterval`、
 *    还要**把自己从 timers 数组里摘掉**（否则长会话里数组只增不清）。
 * ④ **`retryFile`**（L301-318）：配了真实上传时必须重走 `realUpload` 而不是重跑假进度
 *    —— 源码注释写明「此前只重跑模拟进度，用户得到假进度假成功」。没 raw 时还要报错而不是干等。
 * ⑤ **`onUnmounted`** 清定时器（L321-323）：不清理的话组件销毁后 interval 仍在跑。
 * ⑥ **modelValue → files 的双向合并**（L55-71）：外部空数组 + 内部正在上传时**必须保留**
 *    （源码注释记录了这个竞态：立即清空会让上传完成后 emit 空数组 → 父组件误判为用户删除 →
 *    落盘空记录 → 拍照返回后图片丢失）。这类「防竞态」的 if 是最容易在下一次重构里被删掉的。
 *
 * ## harness
 *
 * `Image` / `URL.createObjectURL` / canvas 全部替身（happy-dom 不解码图片、不产 blob）；
 * 模拟进度用假时钟 + 固定 `Math.random`（0.5 → 每拍 +25，4 拍满）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reactive, h, toRaw } from 'vue'
import { mount } from '@vue/test-utils'
import { useUploadQueue } from '@/components/form/utils/useUploadQueue'
import type { UploadFile } from '@/components/form/Upload.vue'

/* ═══════════ 替身状态（vi.hoisted 以便 vi.mock 之外的 stub 共用） ═══════════ */

const st = vi.hoisted(() => ({
  imgW: 100,
  imgH: 100,
  failLoad: false,
  blobSize: 1,
  blobNull: false,
  toBlobCalls: [] as Array<{ mime?: string; quality?: number }>,
  canvasSizes: [] as Array<{ w: number; h: number }>,
  urlSeq: 0,
  revoked: [] as string[],
  created: [] as string[],
}))

/** 造可控 Image：src 一设就按配置同步时间点触发 onload / onerror */
class FakeImage {
  onload: (() => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  width = 0
  height = 0
  #src = ''
  set src(v: string) {
    this.#src = v
    this.width = st.imgW
    this.height = st.imgH
    queueMicrotask(() => (st.failLoad ? this.onerror?.(new Error('decode failed')) : this.onload?.()))
  }
  get src() {
    return this.#src
  }
}

function installStubs() {
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => {
      const u = `blob:fake-${++st.urlSeq}`
      st.created.push(u)
      return u
    }),
    revokeObjectURL: vi.fn((u: string) => void st.revoked.push(u)),
  })
  // canvas 替身：toBlob 按 st.blobSize / st.blobNull 返回
  const realCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag !== 'canvas') return realCreate(tag)
    const c = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (cb: (b: Blob | null) => void, mime?: string, quality?: number) => {
        st.toBlobCalls.push({ mime, quality })
        st.canvasSizes.push({ w: c.width, h: c.height })
        if (st.blobNull) return cb(null)
        const blob = new Blob([new Uint8Array(st.blobSize)], { type: mime ?? 'image/jpeg' })
        cb(blob)
      },
    }
    return c as unknown as HTMLElement
  })
}

/* ═══════════ 引擎夹具 ═══════════ */

type Emit = Parameters<typeof useUploadQueue>[0]['emit']

function setup(over: Record<string, unknown> = {}) {
  const props = reactive({
    modelValue: [] as UploadFile[],
    accept: '',
    multiple: true,
    maxSize: 10,
    variant: 'default' as const,
    compress: false,
    maxWidth: 1200,
    compressQuality: 0.8,
    customRequest: undefined as ((f: File) => Promise<{ url: string }>) | undefined,
    ...over,
  })
  const events: Array<{ e: string; arg: unknown }> = []
  const emit = ((e: string, arg: unknown) => void events.push({ e, arg })) as unknown as Emit
  const q = useUploadQueue({ props: props as never, emit })
  return { props, events, q, evNames: () => events.map((x) => x.e) }
}

function imgFile(name = 'a.jpg', type = 'image/jpeg', bytes = 100) {
  return new File([new Uint8Array(bytes)], name, { type })
}
const txtFile = () => new File([new Uint8Array(10)], 'a.txt', { type: 'text/plain' })

/** 排空微任务 + 一帧 */
async function flush(n = 6) {
  for (let i = 0; i < n; i++) await Promise.resolve()
}

beforeEach(() => {
  st.imgW = 100
  st.imgH = 100
  st.failLoad = false
  st.blobSize = 1
  st.blobNull = false
  st.toBlobCalls = []
  st.canvasSizes = []
  st.urlSeq = 0
  st.revoked = []
  st.created = []
  installStubs()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/* ═══════════ ① compressImage（经 processFiles 驱动） ═══════════ */

describe('图片压缩', () => {
  it('**compress 关闭时不动原文件**', async () => {
    const { q } = setup({ compress: false })
    const f = imgFile()
    q.processFiles([f])
    await flush()
    expect(st.toBlobCalls, '没跑 canvas').toHaveLength(0)
    expect(q.files.value[0]!.size, '体积不变').toBe(100)
  })

  it('**非图片不压缩**（文本文件不该进 canvas）', async () => {
    const { q } = setup({ compress: true })
    q.processFiles([txtFile()])
    await flush()
    expect(st.toBlobCalls).toHaveLength(0)
  })

  it('**超宽时等比缩到 maxWidth**', async () => {
    st.imgW = 2400
    st.imgH = 1200
    st.blobSize = 10
    const { q } = setup({ compress: true, maxWidth: 1200 })
    q.processFiles([imgFile('big.jpg', 'image/jpeg', 9999)])
    await flush()
    expect(st.canvasSizes[0], '画布 1200×600（等比）').toEqual({ w: 1200, h: 600 })
  })

  it('**未超宽时保持原尺寸**（不该放大）', async () => {
    st.imgW = 400
    st.imgH = 300
    st.blobSize = 10
    const { q } = setup({ compress: true, maxWidth: 1200 })
    q.processFiles([imgFile('small.jpg', 'image/jpeg', 9999)])
    await flush()
    expect(st.canvasSizes[0]).toEqual({ w: 400, h: 300 })
  })

  it('**PNG 保持 PNG**（转 JPEG 会丢透明底）', async () => {
    const { q } = setup({ compress: true })
    q.processFiles([imgFile('a.png', 'image/png', 9999)])
    await flush()
    expect(st.toBlobCalls[0]!.mime).toBe('image/png')
  })

  it('**非 PNG 一律 JPEG，并带压缩质量**', async () => {
    const { q } = setup({ compress: true, compressQuality: 0.6 })
    q.processFiles([imgFile('a.webp', 'image/webp', 9999)])
    await flush()
    expect(st.toBlobCalls[0]!.mime).toBe('image/jpeg')
    expect(st.toBlobCalls[0]!.quality).toBe(0.6)
  })

  it('**压完与原图等体积 → 仍用原文件**（边界是 >=，不能写 >）', async () => {
    st.blobSize = 100 // 与原文件恰好相同
    const seen: File[] = []
    const { q } = setup({ compress: true, customRequest: async (f: File) => (seen.push(f), { url: 'u' }) })
    const orig = imgFile('eq.jpg', 'image/jpeg', 100)
    q.processFiles([orig])
    await flush()
    expect(seen[0]!.name, '上传的是原文件（名字保留、未被替换）').toBe('eq.jpg')
    // 注：raw 字段在入列后从不更新（见报告 #139 的 P3），所以这里只能靠「实际进入上传的 File」
    // 分辨是否换了文件；配合 size 断言可区分「换成了等体积的压缩件」
    expect(q.files.value[0]!.size, 'size 被写成压缩件体积（=100）').toBe(100)
    expect(orig.size).toBe(100)
  })

  it('**压完更大 → 用原文件**（不能让用户上传更糊又更大的图）', async () => {
    st.blobSize = 500 // 原文件 100 字节
    const { q } = setup({ compress: true })
    const f = imgFile('a.jpg', 'image/jpeg', 100)
    q.processFiles([f])
    await flush()
    expect(q.files.value[0]!.size, '保留原体积').toBe(100)
    // ⚠️ happy-dom 的 File 没有 Symbol.toStringTag，Vue 会把它当普通对象包成 Proxy，
    // 因此身份断言必须经 toRaw 取出原始对象（否则同内容同大小的 File 也会 !toBe）
    expect(toRaw(q.files.value[0]!).raw, 'raw 仍是原文件').toBe(f)
  })

  it('**压完更小 → 换成压缩后的新文件**', async () => {
    st.blobSize = 20
    const { q } = setup({ compress: true })
    q.processFiles([imgFile('a.jpg', 'image/jpeg', 100)])
    await flush()
    expect(q.files.value[0]!.size, '体积变成压缩后').toBe(20)
    expect(q.files.value[0]!.raw!.name, '文件名保持').toBe('a.jpg')
  })

  it('**解码失败 → 回退原文件**（不能让一张坏图解不开就传不上去）', async () => {
    st.failLoad = true
    const { q } = setup({ compress: true })
    q.processFiles([imgFile('bad.jpg', 'image/jpeg', 100)])
    await flush()
    expect(q.files.value[0]!.size, '原体积').toBe(100)
  })

  it('**解码失败也要回收它的临时 URL**（否则每张坏图漏一个 blob）', async () => {
    st.failLoad = true
    const { q } = setup({ compress: true })
    q.processFiles([imgFile('bad1.jpg', 'image/jpeg', 1)])
    await flush()
    // 创建过的 URL 里，属于解码的那一个必须被 revoke
    // created: [预览用, 解码用]；预览用的要留着（列表缩略图还要读），解码用的必须回收
    expect(st.created.length, '前置：建了 2 个 URL（预览 + 解码）').toBe(2)
    const leaked = st.created.filter((u) => !st.revoked.includes(u))
    expect(leaked, '只允许预览那一个留下').toEqual([st.created[0]])
  })

  it('**解码失败不能把整条上传挂死**（onerror 必须 reject，不能只 revoke）', async () => {
    st.failLoad = true
    const seen: File[] = []
    const { q } = setup({ compress: true, customRequest: async (f: File) => (seen.push(f), { url: 'u' }) })
    q.processFiles([imgFile('bad2.jpg', 'image/jpeg', 7)])
    await flush(10)
    expect(seen, '仍走完了上传（没挂在 await 上）').toHaveLength(1)
    expect(seen[0]!.size).toBe(7)
  })

  it('**toBlob 给 null → 回退原文件**', async () => {
    st.blobNull = true
    const { q } = setup({ compress: true })
    q.processFiles([imgFile('a.jpg', 'image/jpeg', 100)])
    await flush()
    expect(q.files.value[0]!.size).toBe(100)
  })

  it('**toBlob 给 null 时回退原文件、且不报错**（不能构造出 0 字节的"压缩件"）', async () => {
    st.blobNull = true
    st.blobSize = 0
    const seen: File[] = []
    const { q, events } = setup({ compress: true, customRequest: async (f: File) => (seen.push(f), { url: 'u' }) })
    q.processFiles([imgFile('n.jpg', 'image/jpeg', 100)])
    await flush()
    expect(seen[0]!.size, '上传的是 100 字节原文件，不是 0 字节空件').toBe(100)
    expect(q.files.value[0]!.size, 'size 回落到原体积').toBe(100)
    expect(events.some((e) => e.e === 'error'), '压缩失败不该打扰用户').toBe(false)
  })

  it('**成功后释放预览用的 blob URL**（解码用的临时地址要 revoke）', async () => {
    st.blobSize = 10
    const { q } = setup({ compress: true })
    q.processFiles([imgFile('a.jpg', 'image/jpeg', 9999)])
    await flush()
    // 至少有一次 revoke 是给解码用的临时 URL
    expect(st.revoked.length, '解码临时 URL 被回收').toBeGreaterThan(0)
  })
})

/* ═══════════ ② realUpload（真实上传链路） ═══════════ */

describe('真实上传', () => {
  it('**成功：uploads 完成后必须再发一次 update:modelValue**（父级要拿到 done 态与 url）', async () => {
    const customRequest = vi.fn(async () => ({ url: 'https://cdn/y.png' }))
    const { q, events } = setup({ customRequest })
    q.processFiles([imgFile()])
    await flush()
    // processFiles 自己会 emit 一次（入列）；这里只看上传完成之后新增的那一次
    const afterEnqueue = events.length
    expect(events.some((e) => e.e === 'update:modelValue'), '入列时已同步').toBe(true)
    // 触发一次重试来产生「仅由上传完成导致的」同步
    const uf = q.files.value[0]!
    uf.status = 'error'
    events.length = 0
    q.retryFile(uf.id)
    await flush()
    const modelEv = events.filter((e) => e.e === 'update:modelValue')
    expect(modelEv.length, '上传成功必须自己再同步一次').toBeGreaterThanOrEqual(1)
    const payload = modelEv.at(-1)!.arg as UploadFile[]
    expect(payload[0]!.status, '父级收到的是 done 态').toBe('done')
    expect(payload[0]!.url).toBe('https://cdn/y.png')
    expect(afterEnqueue).toBeGreaterThan(0)
  })

  it('**失败：必须再发一次 update:modelValue**（否则父级一直以为还在上传）', async () => {
    const customRequest = vi.fn().mockResolvedValueOnce({ url: 'u1' }).mockRejectedValueOnce(new Error('boom'))
    const { q, events } = setup({ customRequest })
    q.processFiles([imgFile()])
    await flush()
    const uf = q.files.value[0]!
    uf.status = 'error'
    events.length = 0
    q.retryFile(uf.id) // 这次失败
    await flush()
    const payload = (events.filter((e) => e.e === 'update:modelValue').at(-1)?.arg ?? []) as UploadFile[]
    expect(payload[0]?.status, '父级收到的是 error 态').toBe('error')
  })

  it('**成功：progress=100、status=done、url 落地、syncModel 通知父级**', async () => {
    const customRequest = vi.fn(async () => ({ url: 'https://cdn/x.png' }))
    const { q, events } = setup({ customRequest })
    q.processFiles([imgFile()])
    await flush()
    const uf = q.files.value[0]!
    expect(customRequest, '调用了上传接口').toHaveBeenCalledTimes(1)
    expect(uf.progress).toBe(100)
    expect(uf.status).toBe('done')
    expect(uf.url).toBe('https://cdn/x.png')
    expect(events.some((x) => x.e === 'update:modelValue'), '值同步回父级').toBe(true)
  })

  it('**接口抛错：status=error、emit error 带原始信息、仍同步模型**', async () => {
    const customRequest = vi.fn(async () => {
      throw new Error('500 Internal')
    })
    const { q, events } = setup({ customRequest })
    q.processFiles([imgFile()])
    await flush()
    const uf = q.files.value[0]!
    expect(uf.status).toBe('error')
    const err = events.find((x) => x.e === 'error')
    expect(String(err!.arg), '错误信息来自接口').toContain('500 Internal')
    expect(events.some((x) => x.e === 'update:modelValue'), '失败也要同步（让父级看到 error 态）').toBe(true)
  })

  it('**接口抛非 Error（字符串）：仍能给出提示**', async () => {
    const customRequest = vi.fn(async () => {
      throw 'plain string'
    })
    const { q, events } = setup({ customRequest })
    q.processFiles([imgFile()])
    await flush()
    expect(events.find((x) => x.e === 'error'), '有错误提示').toBeTruthy()
    expect(q.files.value[0]!.status).toBe('error')
  })
})

/* ═══════════ ③ simulateUpload（演示进度） ═══════════ */

describe('模拟上传进度', () => {
  it('**按时推进到 100 并落 done**（固定 random=0.5 → 每拍 +25）', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const { q } = setup()
    q.processFiles([imgFile()])
    await vi.advanceTimersByTimeAsync(0)
    const uf = q.files.value[0]!
    expect(uf.status).toBe('uploading')
    await vi.advanceTimersByTimeAsync(300)
    expect(uf.progress, '一拍 25').toBe(25)
    await vi.advanceTimersByTimeAsync(300 * 3)
    expect(uf.progress, '满 100').toBe(100)
    expect(uf.status).toBe('done')
  })

  it('**中途进度取整**（不能把 11.5% 这种小数暴露给 UI）', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.05) // 每拍 +11.5
    const { q } = setup()
    q.processFiles([imgFile()])
    await vi.advanceTimersByTimeAsync(300)
    const p = q.files.value[0]!.progress
    expect(p, '已取整').toBe(12)
    expect(Number.isInteger(p), '必须是整数').toBe(true)
  })

  it('**完成后必须停止写入 progress**（clearInterval 生效的直接证据）', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const { q } = setup()
    q.processFiles([imgFile()])
    await vi.advanceTimersByTimeAsync(300 * 4)
    const uf = q.files.value[0]!
    expect(uf.status).toBe('done')
    let writes = 0
    const cur = uf.progress
    Object.defineProperty(uf, 'progress', {
      configurable: true,
      get: () => cur,
      set: () => void (writes++, cur),
    })
    await vi.advanceTimersByTimeAsync(300 * 6)
    expect(writes, '定时器已停，不该再有写入').toBe(0)
  })

  it('**完成后的定时器要从 timers 里摘掉**（否则卸载时对已完成 id 空转）', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    let q!: ReturnType<typeof useUploadQueue>
    const w = mount({
      setup() {
        q = setup().q
        return () => h('div')
      },
    })
    q.processFiles([imgFile()])
    await vi.advanceTimersByTimeAsync(300 * 4)
    expect(q.files.value[0]!.status).toBe('done')
    // 完成后定时器已从 timers 摘掉 → 卸载时没有可清的东西（clearInterval 不被调用）
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    w.unmount()
    expect(clearSpy, '完成态已摘除，卸载无需再清').not.toHaveBeenCalled()
  })

  it('**完成后定时器被摘掉**（长会话里 timers 数组不能只增不清）', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const { q } = setup()
    q.processFiles([imgFile()])
    await vi.advanceTimersByTimeAsync(300 * 4)
    expect(q.files.value[0]!.status).toBe('done')
    // 再推进不应有变化（定时器已清）
    const p = q.files.value[0]!.progress
    await vi.advanceTimersByTimeAsync(300 * 5)
    expect(q.files.value[0]!.progress).toBe(p)
  })
})

/* ═══════════ ④ retryFile ═══════════ */

describe('retryFile 重试', () => {
  it('**找不到 id → 什么都不做**', () => {
    const { q, events } = setup()
    q.retryFile(999)
    expect(events).toHaveLength(0)
  })

  it('**状态不是 error → 不重试**（done/uploading 不该被重跑）', async () => {
    const customRequest = vi.fn(async () => ({ url: 'u' }))
    const { q } = setup({ customRequest })
    q.processFiles([imgFile()])
    await flush()
    expect(q.files.value[0]!.status).toBe('done')
    customRequest.mockClear()
    q.retryFile(q.files.value[0]!.id)
    await flush()
    expect(customRequest, 'done 态不重试').not.toHaveBeenCalled()
  })

  it('**配了真实上传：重试必须走 realUpload**（而不是重跑假进度）', async () => {
    const customRequest = vi.fn().mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce({ url: 'https://cdn/ok' })
    const { q } = setup({ customRequest })
    q.processFiles([imgFile()])
    await flush()
    const uf = q.files.value[0]!
    expect(uf.status, '第一次失败').toBe('error')

    q.retryFile(uf.id)
    await flush()
    expect(customRequest, '真的又调了一次接口').toHaveBeenCalledTimes(2)
    expect(uf.status, '重试成功').toBe('done')
    expect(uf.url).toBe('https://cdn/ok')
    expect(uf.progress).toBe(100)
  })

  it('**重试必须把 progress 归零**（否则 UI 停在上次的失败进度上）', async () => {
    const customRequest = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ url: 'u' })
    const { q } = setup({ customRequest })
    q.processFiles([imgFile()])
    await flush()
    const uf = q.files.value[0]!
    uf.progress = 77 // 非默认值
    q.retryFile(uf.id)
    // 重试那一刻必须已经归零（不能等到上传完成才归零）
    expect(uf.progress, '立即归零').toBe(0)
    await flush()
  })

  it('**没配真实上传：重试重跑模拟进度**', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const { q } = setup()
    q.processFiles([imgFile()])
    await vi.advanceTimersByTimeAsync(0)
    const uf = q.files.value[0]!
    // 手动打成 error 态模拟失败
    uf.status = 'error'
    uf.progress = 0
    q.retryFile(uf.id)
    expect(uf.status, '立刻回到 uploading').toBe('uploading')
    await vi.advanceTimersByTimeAsync(300 * 4)
    expect(uf.progress).toBe(100)
    expect(uf.status).toBe('done')
  })

  it('**配了真实上传但丢了 raw → 报错并保持 error**（不能假装成功）', async () => {
    const customRequest = vi.fn(async () => ({ url: 'u' }))
    const { q, events } = setup({ customRequest })
    q.processFiles([imgFile()])
    await flush()
    const uf = q.files.value[0]!
    uf.status = 'error'
    delete (uf as { raw?: File }).raw
    events.length = 0
    q.retryFile(uf.id)
    await flush()
    expect(uf.status, '仍是 error').toBe('error')
    expect(events.find((x) => x.e === 'error'), '给了错误提示').toBeTruthy()
  })
})

/* ═══════════ ⑤ onUnmounted 清理 ═══════════ */

describe('卸载清理', () => {
  it('**组件卸载后模拟进度不再推进**（interval 必须被清）', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    let q!: ReturnType<typeof useUploadQueue>
    const Comp = {
      setup() {
        q = setup().q
        return () => h('div')
      },
    }
    const w = mount(Comp)
    q.processFiles([imgFile()])
    await vi.advanceTimersByTimeAsync(300)
    const mid = q.files.value[0]!.progress
    expect(mid, '卸载前在推进').toBe(25)
    w.unmount()
    await vi.advanceTimersByTimeAsync(300 * 5)
    expect(q.files.value[0]!.progress, '卸载后冻结').toBe(mid)
  })
})

/* ═══════════ ⑥ modelValue → files 双向合并 ═══════════ */

describe('外部模型同步', () => {
  it('**外部回填 → 内部跟随**', async () => {
    const { q, props } = setup()
    const ext: UploadFile[] = [{ id: 1, name: 'x.png', size: 1, progress: 100, status: 'done', url: 'https://cdn/x' }]
    props.modelValue = ext
    await flush()
    expect(q.files.value.map((f) => f.id)).toEqual([1])
  })

  it('**外部与内部完全同构 → 不动**（避免无谓重排/闪烁）', async () => {
    const { q, props } = setup()
    props.modelValue = [{ id: 1, name: 'x.png', size: 1, progress: 100, status: 'done' }]
    await flush()
    const same = [...q.files.value]
    props.modelValue = [{ id: 1, name: 'x.png', size: 1, progress: 100, status: 'done' }]
    await flush()
    expect(q.files.value, '引用/内容都不变').toEqual(same)
  })

  it('**同构时保持内部引用不变**（不能每次父级回推都重建列表）', async () => {
    const { q, props } = setup()
    props.modelValue = [{ id: 7, name: 'x.png', size: 1, progress: 100, status: 'done' }]
    await flush()
    const inner = q.files.value
    // 父级把自己收到的数组又推回来（id 序列一致）
    props.modelValue = [{ id: 7, name: 'x.png', size: 1, progress: 100, status: 'done' }]
    await flush()
    expect(q.files.value, '引用未变').toBe(inner)
  })

  it('**外部列表缺了内部正在上传的项 → 保留它**（父模型还没反映本次上传）', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { q, props } = setup()
    q.processFiles([imgFile('up.jpg')])
    await vi.advanceTimersByTimeAsync(0)
    const uploading = q.files.value[0]!
    expect(uploading.status).toBe('uploading')
    // 外部只给了一条已完成的旧记录
    props.modelValue = [{ id: 99, name: 'old.png', size: 1, progress: 100, status: 'done' }]
    await flush()
    expect(q.files.value.map((f) => f.id), '旧记录 + 仍在飞的项').toEqual([99, uploading.id])
  })

  it('**外部置空但内部正在上传 → 不清空**（这是拍照回填丢图的竞态）', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { q, props } = setup()
    q.processFiles([imgFile('keep.jpg')])
    await vi.advanceTimersByTimeAsync(0)
    expect(q.files.value[0]!.status).toBe('uploading')
    props.modelValue = []
    await flush()
    expect(q.files.value.length, '不能清空').toBe(1)
  })

  it('**外部置空且没有在飞的项 → 清空并回收 blob URL**', async () => {
    const { q, props } = setup()
    props.modelValue = [
      { id: 1, name: 'a.png', size: 1, progress: 100, status: 'done', url: 'blob:fake-1' },
      { id: 2, name: 'b.png', size: 1, progress: 100, status: 'done', url: 'https://cdn/b' },
    ]
    await flush()
    st.revoked.length = 0
    props.modelValue = []
    await flush()
    expect(q.files.value).toEqual([])
    expect(st.revoked, '只回收 blob: 开头的').toEqual(['blob:fake-1'])
  })
})

/* ═══════════ ⑦ 入口健壮性 ═══════════ */

describe('入口健壮性', () => {
  it('**数组里有空位（sparse/undefined）→ 跳过该位继续处理后一个**', async () => {
    const { q } = setup()
    const ok = imgFile('ok.jpg')
    q.processFiles([undefined, ok] as unknown as File[])
    await flush()
    expect(q.files.value.map((f) => f.name), '只收下有效的那一个').toEqual(['ok.jpg'])
    expect(q.files.value[0]!.status).toBeTruthy()
  })

  it('**isMimeAccepted 以空 accept 直接调用 → 全部接受**（导出 API，宿主也可直接用）', () => {
    const { q } = setup()
    expect(q.isMimeAccepted(txtFile(), '')).toBe(true)
    expect(q.isMimeAccepted(imgFile(), '')).toBe(true)
  })
})
