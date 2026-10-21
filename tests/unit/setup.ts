// 全局测试 setup：静默测试环境噪音，保留真实问题的 warn/error，并对它们**计数**
//
// 2026-10-21 增强（审查 R5-B18 / 路线图 6.2 #5「测试信号质量」）：
// 原来只静默三类已知噪音，其余原样打印 —— 但**打印不等于被看见**：
// 47 行 warn 混在几千行测试输出里，谁也不会逐行读。实测就藏着一个真缺陷
// （`Template ref "videoRef" used on a non-ref value. It will not work in the production build.`
// 每轮 29 次，说明 `CodeCapture.vue` 的模板 ref 在生产构建里会失效）。
//
// 所以这里做两件事：
//   ① 把**未静默**的 warn/error 按「归一化后的类别」计数；
//   ② 每个测试文件结束时把本文件的计数**追加**到一个汇总文件；全量跑完后由
//      scripts/check-console-noise.mjs 汇总比对基线，新增类别/计数上升即红。
//
// 为什么按"类别 + 计数"而不是"总数"：总数会随用例增减自然波动（加一个 spec 就多几条），
// 而"新类别出现"和"某一类突然变多"才是真正的信号。
//
// 为什么不用 process.on('exit') 直接比对：setup 在每个 worker 里都执行，跨文件的全局
// 总数在 worker 内拿不到；而且 exit 钩子里写文件在 vitest 的 teardown 时序下不可靠
// （实测基线一次都没写出来）。改成"各文件追加、独立脚本汇总"，每步都简单可验证。
import { vi, afterAll } from 'vitest'
import { appendFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
/** 各 worker 追加写入的汇总目录（跑完由 check-console-noise.mjs 汇总并清理） */
const SPOOL_DIR = join(HERE, '.noise-spool')

// ── 已知噪音：静默，且**不计入**统计 ──
// 判定标准：与"被测代码是否正确"无关，纯属测试环境的用法副作用。
const SILENCED = [
  // composable 在组件外直接调用时旧版 Vue 的"无活动组件实例"warn
  'no active component instance',
  // 测试 mount 少传 prop 的提示（已逐文件修复，此处兜底兼容旧用例）
  'Missing required prop',
  // Vue Test Utils 访问 wrapper.vm 时对 setup 返回对象枚举 keys 的提示
  'relying on enumerating keys',
]

const originalWarn = console.warn
const originalError = console.error

/** 未静默的噪音：类别 → 次数 */
const noiseCounts = new Map()

/**
 * 把一条 warn/error 归一化成"类别"。
 *
 * 归一化是为了让同类噪音合并计数：把引号里的具体名字、数字抹掉，只留结构性描述。
 * 这样"videoRef 这个 ref 名"与"canvasRef 这个 ref 名"算同一类（背后是同一个编译期约束），
 * 而不会因为名字不同各算一类。
 */
function classify(args) {
  const raw = args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : '')).join(' ')
  const text = raw
    .replace(/"[^"]*"/g, '"…"') // 引号内具体名字
    .replace(/'[^']*'/g, "'…'")
    // 分享码 / 存储 key 里的随机片段：`fd_share_S.f_mvhijen7o2rahz`、`fd_share_FD1.<base64>`
    // 这些是**每次运行都不同**的随机值，不抹掉会让每次跑都产生"新类别"（实测正是如此）
    .replace(/\bfd_share[A-Za-z0-9_]*\.[A-Za-z0-9_+/=.-]{4,}/g, 'fd_share_…')
    // 全角括号里的可变内容：`图标未收录: （activity）` / `（）` —— 不同图标名会各成一类
    .replace(/（[^）]*）/g, '（…）')
    .replace(/\b[A-Za-z0-9_-]{12,}\b/g, '…') // 其余长随机串（base64/随机 id）
    .replace(/\b\d+\b/g, 'N') // 数字
    .replace(/\s+/g, ' ')
    .trim()
  // 只保留前 120 字符作为类别键：长堆栈会把同类拆成多类
  return text.slice(0, 120) || '(empty)'
}

function record(args) {
  const key = classify(args)
  noiseCounts.set(key, (noiseCounts.get(key) ?? 0) + 1)
}

vi.spyOn(console, 'warn').mockImplementation((...args) => {
  const msg = String(args[0] ?? '')
  if (SILENCED.some((s) => msg.includes(s))) return // 静默测试噪音，不计入
  record(args)
  originalWarn(...args)
})

vi.spyOn(console, 'error').mockImplementation((...args) => {
  record(args)
  originalError(...args)
})

/**
 * 本文件跑完时把计数追加到 spool，然后**清空**计数。
 *
 * 为什么要清空：`noiseCounts` 是模块级的（每 worker 一份），而 `afterAll` 在**每个测试文件**
 * 结束都触发。若不清空，同一 worker 里第二个文件会把第一个文件的计数**再写一遍** ——
 * 实测就是因此出现整体 ×3 的假上涨（worker 数与文件数叠加）。
 */
function flushToSpool() {
  if (!noiseCounts.size) return
  if (!existsSync(SPOOL_DIR)) mkdirSync(SPOOL_DIR, { recursive: true })
  const name = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
  appendFileSync(join(SPOOL_DIR, name), JSON.stringify(Object.fromEntries(noiseCounts)), 'utf8')
  noiseCounts.clear()
}

// vitest 的 afterAll 在"每个测试文件"结束时调用一次，正是我们要的粒度
afterAll(flushToSpool)

// 清空 spool 的辅助（由 check 脚本通过环境变量触发，在**第一个** setup 执行时清理一次）
if (process.env.VCL_NOISE_RESET === '1' && !existsSync(join(SPOOL_DIR, '.reset'))) {
  rmSync(SPOOL_DIR, { recursive: true, force: true })
  mkdirSync(SPOOL_DIR, { recursive: true })
  appendFileSync(join(SPOOL_DIR, '.reset'), '', 'utf8')
}
