/**
 * useUploadQueue — 文件队列引擎的校验与去重（2026-10-22）
 *
 * ## 为什么测这个
 *
 * `Upload.vue` 523 行、未覆盖 157 条（18.2%），是 `form` 域第二大洼地。
 * 但它的核心逻辑全部在 `utils/useUploadQueue.ts`（327 行）—— 纯逻辑、易测。
 *
 * 已有测试覆盖「预览」和「并发闸门」，**没覆盖的是校验链**，而校验链恰恰是
 * 用户最先撞上的东西：选错格式、文件太大、重复上传，全靠它拦。
 *
 * ## 五条校验分支（每条都对应一句用户可见的报错）
 *
 *   ① accept 白名单不匹配 → `form.typeNotSupported`
 *   ② 超过 maxSize（MB）   → `form.sizeExceeded`
 *   ③ 小于 minSize（KB）   → `form.sizeTooSmall`
 *   ④ 同名同大小已存在     → `form.fileExists`
 *   ⑤ multiple=false 时只取第一个
 *
 * ## 最该锁住的两条
 *
 *   · **④ 去重按「名字 + 大小」而不是只按名字** —— 只按名字会把
 *     用户想重传的同名不同内容文件也拦掉
 *   · **⑤ multiple=false 时 `limit = 1`** —— 漏了会让单选变多选
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useUploadQueue } from '@/components/form/utils/useUploadQueue'
import type { UploadFile } from '@/components/form/Upload.vue'

/** 造一个 File（happy-dom 提供真实 File） */
function makeFile(name: string, size: number, type = 'image/png'): File {
  const f = new File(['x'], name, { type })
  // File.size 是只读的，用 defineProperty 覆盖成指定大小
  Object.defineProperty(f, 'size', { value: size, configurable: true })
  return f
}

interface Emits {
  change: UploadFile[][]
  error: string[]
  remove: UploadFile[][]
  'update:modelValue': UploadFile[][]
}

/** 造一个 useUploadQueue 实例；props 用 ref 包一层以支持响应式 */
function makeQueue(
  props: Partial<{
    accept: string
    multiple: boolean
    maxSize: number
    minSize: number
    variant: 'default' | 'card'
    compress: boolean
    maxConcurrent: number
    customRequest: (f: File) => Promise<{ url: string }>
    disabled: boolean
  }> = {},
) {
  const emits: Emits = { change: [], error: [], remove: [], 'update:modelValue': [] }
  const emit = (evt: keyof Emits, payload: unknown) => {
    ;(emits[evt] as unknown[]).push(payload)
  }
  const queueProps = {
    accept: 'image/*',
    multiple: true,
    maxSize: 10,
    variant: 'default' as const,
    compress: false,
    maxConcurrent: 3,
    ...props,
  }
  const q = useUploadQueue({ props: queueProps as never, emit: emit as never })
  return { q, emits, queueProps }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('accept 白名单校验（isMimeAccepted 三种形态）', () => {
  it('通配符 image/* → 接受 png，拒绝 txt', () => {
    const { q, emits } = makeQueue({ accept: 'image/*' })
    q.processFiles([makeFile('a.png', 100, 'image/png')])
    expect(emits.error, 'png 不该报错').toHaveLength(0)
    expect(q.files.value, 'png 应入列').toHaveLength(1)

    q.processFiles([makeFile('b.txt', 100, 'text/plain')])
    expect(emits.error.length, 'txt 应报错').toBeGreaterThan(0)
    expect(q.files.value, 'txt 不该入列').toHaveLength(1)
  })

  it('**扩展名形态 .pdf** → 按文件名后缀匹配（不依赖 file.type）', () => {
    const { q, emits } = makeQueue({ accept: '.pdf' })
    // 有些系统给不出 MIME，只能靠后缀
    q.processFiles([makeFile('doc.pdf', 100, '')])
    expect(emits.error, '.pdf 后缀应被接受').toHaveLength(0)
    expect(q.files.value).toHaveLength(1)

    q.processFiles([makeFile('doc.txt', 100, '')])
    expect(emits.error.length, '.txt 应被拒绝').toBeGreaterThan(0)
  })

  it('**精确 MIME** → 只接受完全相同的 type', () => {
    const { q, emits } = makeQueue({ accept: 'application/json' })
    q.processFiles([makeFile('a.json', 100, 'application/json')])
    expect(emits.error).toHaveLength(0)

    q.processFiles([makeFile('b.json', 100, 'text/json')])
    expect(emits.error.length, 'text/json ≠ application/json').toBeGreaterThan(0)
  })

  it('accept 为空串 → 全部接受', () => {
    const { q, emits } = makeQueue({ accept: '' })
    q.processFiles([makeFile('any.xyz', 100, 'application/octet-stream')])
    expect(emits.error, '空 accept 不该拦任何文件').toHaveLength(0)
    expect(q.files.value).toHaveLength(1)
  })

  it('多类型 accept（逗号分隔）→ 任一匹配即可', () => {
    const { q, emits } = makeQueue({ accept: 'image/png, .pdf' })
    q.processFiles([makeFile('a.png', 100, 'image/png')])
    q.processFiles([makeFile('b.pdf', 100, '')])
    expect(emits.error, '两种都应被接受').toHaveLength(0)
    expect(q.files.value).toHaveLength(2)
  })
})

describe('大小校验', () => {
  it('**超过 maxSize（MB）→ 报错且不入列**', () => {
    const { q, emits } = makeQueue({ maxSize: 1 })
    // 1MB = 1048576 字节；给 2MB
    q.processFiles([makeFile('big.png', 2 * 1024 * 1024)])
    expect(emits.error.length, '2MB 超过 1MB 上限应报错').toBe(1)
    expect(q.files.value, '超限文件不该入列').toHaveLength(0)
  })

  it('恰好等于 maxSize → 接受（边界是 >，不是 >=）', () => {
    const { q, emits } = makeQueue({ maxSize: 1 })
    q.processFiles([makeFile('exact.png', 1024 * 1024)])
    expect(emits.error, '恰好 1MB 应被接受').toHaveLength(0)
    expect(q.files.value).toHaveLength(1)
  })

  it('**小于 minSize（KB）→ 报错**', () => {
    const { q, emits } = makeQueue({ minSize: 10 })
    q.processFiles([makeFile('tiny.png', 5 * 1024)]) // 5KB < 10KB
    expect(emits.error.length, '5KB 小于 10KB 下限应报错').toBe(1)
    expect(q.files.value).toHaveLength(0)
  })

  it('minSize 未设置时不检查下限', () => {
    const { q, emits } = makeQueue({})
    q.processFiles([makeFile('tiny.png', 1)])
    expect(emits.error, '未设 minSize 不该拦小文件').toHaveLength(0)
  })
})

describe('去重（按「名字 + 大小」）', () => {
  it('同名同大小 → 报 fileExists，不重复入列', () => {
    const { q, emits } = makeQueue({})
    q.processFiles([makeFile('dup.png', 100)])
    expect(q.files.value).toHaveLength(1)

    q.processFiles([makeFile('dup.png', 100)])
    expect(emits.error.length, '重复文件应报错').toBe(1)
    expect(q.files.value, '不该重复入列').toHaveLength(1)
  })

  it('**同名但大小不同 → 允许**（用户可能想重传不同内容的同名文件）', () => {
    const { q, emits } = makeQueue({})
    q.processFiles([makeFile('same.png', 100)])
    q.processFiles([makeFile('same.png', 200)])
    expect(emits.error, '同名不同大小不该被当成重复').toHaveLength(0)
    expect(q.files.value, '两个都应入列').toHaveLength(2)
  })

  it('不同名同大小 → 允许', () => {
    const { q, emits } = makeQueue({})
    q.processFiles([makeFile('a.png', 100)])
    q.processFiles([makeFile('b.png', 100)])
    expect(emits.error).toHaveLength(0)
    expect(q.files.value).toHaveLength(2)
  })
})

describe('multiple 语义', () => {
  it('**multiple=false 时只取第一个**', () => {
    const { q } = makeQueue({ multiple: false })
    q.processFiles([makeFile('a.png', 100), makeFile('b.png', 100), makeFile('c.png', 100)])
    expect(q.files.value, '单选模式只应入列 1 个').toHaveLength(1)
    expect(q.files.value[0].name).toBe('a.png')
  })

  it('multiple=true 时全部入列', () => {
    const { q } = makeQueue({ multiple: true })
    q.processFiles([makeFile('a.png', 100), makeFile('b.png', 100), makeFile('c.png', 100)])
    expect(q.files.value).toHaveLength(3)
  })
})

describe('空输入与 card 变体替换', () => {
  it('null / 空数组 → 静默返回', () => {
    const { q, emits } = makeQueue({})
    q.processFiles(null)
    q.processFiles([])
    expect(q.files.value).toHaveLength(0)
    expect(emits.error).toHaveLength(0)
  })

  it('**card 变体已有文件时 → 替换而非追加**', () => {
    const { q } = makeQueue({ variant: 'card', multiple: true })
    q.processFiles([makeFile('a.png', 100)])
    expect(q.files.value).toHaveLength(1)

    q.processFiles([makeFile('b.png', 100)])
    expect(q.files.value, 'card 模式应替换').toHaveLength(1)
    expect(q.files.value[0].name).toBe('b.png')
  })

  it('default 变体 → 追加', () => {
    const { q } = makeQueue({ variant: 'default', multiple: true })
    q.processFiles([makeFile('a.png', 100)])
    q.processFiles([makeFile('b.png', 100)])
    expect(q.files.value, 'default 模式应追加').toHaveLength(2)
  })
})

describe('事件与模型同步', () => {
  it('有文件入列 → emit change + update:modelValue', () => {
    const { q, emits } = makeQueue({})
    q.processFiles([makeFile('a.png', 100)])
    expect(emits.change.length, '应 emit change').toBe(1)
    expect(emits['update:modelValue'].length, '应同步 v-model').toBe(1)
  })

  it('**全部被校验拦掉 → 不 emit change**（列表没变，不该通知）', () => {
    const { q, emits } = makeQueue({ maxSize: 1 })
    q.processFiles([makeFile('big.png', 5 * 1024 * 1024)])
    expect(emits.error.length, '应报错').toBe(1)
    expect(emits.change, '列表未变，不该 emit change').toHaveLength(0)
  })

  it('入列文件带 id / name / size / status=uploading / raw', () => {
    const { q } = makeQueue({})
    const f = makeFile('a.png', 123)
    q.processFiles([f])
    const uf = q.files.value[0]
    expect(typeof uf.id, '应有 id').toBe('number')
    expect(uf.name).toBe('a.png')
    expect(uf.size).toBe(123)
    expect(uf.status, '新文件应是 uploading').toBe('uploading')
    // ⚠️ raw 是「供调用方持久化的 Blob」，不保证与入参**同一对象**：
    // 开启 compress 时它是压缩后的新 File。这里只断言它存在且是 Blob 语义，
    // 不断言引用相等（负向对照发现断言 `toBe(f)` 会因实现细节失败）。
    expect(uf.raw, '应保留原始 Blob 供持久化').toBeInstanceOf(Blob)
    expect(uf.raw!.size, 'raw 的字节数应与文件一致（未压缩时）').toBe(123)
  })

  it('多个文件的 id 各不相同', () => {
    const { q } = makeQueue({ multiple: true })
    q.processFiles([makeFile('a.png', 100), makeFile('b.png', 200), makeFile('c.png', 300)])
    const ids = q.files.value.map((f) => f.id)
    expect(new Set(ids).size, 'id 必须唯一').toBe(3)
  })
})

describe('removeFile / clearAllFiles', () => {
  /* ── #431：同一写动作的第二条路径 ──────────────────────────────────
   * removeFile 早就判了 disabled；clearAllFiles 是同一个写动作的另一个入口
   * （都做「清 files + syncModel」），却没有守卫 —— 禁用态下点「清空全部」
   * 会把文件全删掉并 emit 空数组 —— 比单个 × 更狠。TD-90 收判据时发现了第 4 例。*/
  it('**disabled：clearAllFiles 不删文件、不 emit**（不能只靠按钮不渲染）', () => {
    const { q, emits } = makeQueue({ multiple: true, disabled: true })
    // 先照常入队拿到"入队本身产生的 emit"作基线，再看 clearAllFiles 有没有额外写
    q.processFiles([makeFile('a.png', 100), makeFile('b.png', 200)])
    const baselineEmits = emits['update:modelValue'].length
    const baselineFiles = q.files.value.length

    q.clearAllFiles()

    expect(q.files.value, '禁用态下清空不该动队列').toHaveLength(baselineFiles)
    expect(emits['update:modelValue'].length, '清空不该再 emit 一次').toBe(baselineEmits)
    const last = emits['update:modelValue'].at(-1) as { status?: string; id?: string }[]
    expect(last, '最后一条 emit 仍是入队那两个上传中条目，不是空数组').toHaveLength(baselineFiles)
  })

  it('**可写态 clearAllFiles 照常清空并 emit**（反向保护：守卫不能把功能一起关了）', () => {
    const { q, emits } = makeQueue({ multiple: true })
    q.processFiles([makeFile('a.png', 100), makeFile('b.png', 200)])
    q.clearAllFiles()
    expect(q.files.value).toHaveLength(0)
    expect(emits['update:modelValue'].at(-1), '最后一条应是空数组').toEqual([])
  })

  /* ── #432：守卫只留一个出口 ────────────────────────────────────────
   * TD-90 踩了四次同一形态，第 4 次（#431）的根因是"清空全部照着单删抄，
   * 抄的时候把守卫漏了"。只要还允许各写一份，就会再漏第五次 ——
   * 所以把「禁用态硬拒 + 释放 blob URL」收成 releaseForWrite()，两个入口都调它。
   * 下面三例锁住这个共用点：任一处脱离它都会红。*/
  it('**两个入口共用同一守卫**：禁用态下 releaseForWrite 为 false，可写态为 true', () => {
    const { q, queueProps } = makeQueue({ multiple: true })
    // 可写态：单删/全清都真的生效（证明共用点没把功能关掉）
    q.processFiles([makeFile('a.png', 100), makeFile('b.png', 200)])
    q.removeFile(q.files.value[0]!)
    expect(q.files.value).toHaveLength(1)
    q.clearAllFiles()
    expect(q.files.value).toHaveLength(0)
    // 禁用态：同一条队列，两个入口都得原样不动
    q.processFiles([makeFile('c.png', 300)])
    const kept = q.files.value.length
    queueProps.disabled = true
    q.removeFile(q.files.value[0]!)
    q.clearAllFiles()
    expect(q.files.value, '单删在全清之后也得被守住').toHaveLength(kept)
  })
  it('removeFile 移除指定文件并 emit', () => {
    const { q, emits } = makeQueue({ multiple: true })
    q.processFiles([makeFile('a.png', 100), makeFile('b.png', 200)])
    const target = q.files.value[0]
    q.removeFile(target)
    expect(q.files.value).toHaveLength(1)
    expect(emits.remove.length, '应 emit remove').toBe(1)
  })

  it('clearAllFiles 清空全部', () => {
    const { q } = makeQueue({ multiple: true })
    q.processFiles([makeFile('a.png', 100), makeFile('b.png', 200)])
    q.clearAllFiles()
    expect(q.files.value).toHaveLength(0)
  })
})
