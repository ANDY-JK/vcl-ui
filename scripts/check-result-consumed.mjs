#!/usr/bin/env node
/**
 * 闸口：**返回结果的动作函数，调用点必须消费返回值**（#267 / #269 的机械化）
 *
 * ## 为什么需要
 *
 * 同一类缺陷已经犯过两次：
 * - #267 `copyText()` 四处不检查返回值 → 复制失败却报"已复制"
 * - #269 `downloadScreenshot()` / `downloadBlob()` 四处不检查 → 下载失败却报"已下载"，
 *   其中一处还把预览弹窗关掉了（用户既没文件也没图）
 *
 * 两次的根因是同一条纪律：**返回 `boolean` / `Promise<boolean>` 的动作函数，
 * 调用点必须看结果**。靠"下次记得"是撑不住的 —— 做成闸口。
 *
 * ## 判据
 *
 * 对 REGISTRY 里的每个函数，扫描 src/components 下所有 .ts/.vue：
 * - **合法**：`const ok = await f(...)` / `void f(...).then(...)` / `return f(...)` /
 *   `if (...) f(...)` 里的条件 / `expect(f(...))` / `.then(` 链 / 箭头函数体
 * - **违规**：独立语句 `f(...)`（结果被丢弃）、`void f(...)` 后面**没有** `.then(`
 *
 * 注释与字符串里的内容不算（简单行级排除：`//` `*` 开头）。
 *
 * ## 加新函数
 *
 * 往 REGISTRY 加一行即可。选它的标准：**返回值表达"这次动作做成了没有"**，
 * 且失败时用户会看到假反馈或完全无反馈。
 */
import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'

/** 必须消费返回值的方法：函数名 → 未消费时的后果说明 */
const REGISTRY = {
  copyText: '复制失败却报"已复制"（#267）',
  copyScreenshotToClipboard: '截图没进剪贴板却报"已复制"',
  downloadScreenshot: '下载失败却报"已下载"（#269）',
  downloadBlob: '下载失败却报"已导出"（#269）',
}

const ROOT = process.cwd()
const files = globSync('src/components/**/*.{ts,vue}', { cwd: ROOT })
const offenders = []

for (const rel of files) {
  const text = readFileSync(`${ROOT}/${rel}`, 'utf8')
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 跳过注释行（粗略但够用：行首空白后是 // 或 * 或 /*）
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue
    for (const [fn, why] of Object.entries(REGISTRY)) {
      const re = new RegExp(`(^|[^\\w.])${fn}\\s*\\(`)
      if (!re.test(line)) continue
      // 声明处/定义处跳过（export function copyText / function downloadBlob）
      if (new RegExp(`function\\s+${fn}\\s*\\(`).test(line)) continue
      const trimmed = line.trim()
      const consumed =
        /^(const|let|var)\s+\w+.*=.*\b/.test(trimmed) ||
        /\bawait\s+/.test(trimmed) ||
        /\breturn\s+/.test(trimmed) ||
        /\.then\s*\(/.test(trimmed) ||
        /expect\s*\(/.test(trimmed) ||
        /^(if|while|switch)\s*\(/.test(trimmed) ||
        /^(const|let|var)\s/.test(trimmed) ||
        // 三元 / 赋值 / 比较里出现，说明结果被使用
        /(\?|:|\|\||&&|===|!==|!)\s*$/.test(trimmed) ||
        /^\w+\s*=/.test(trimmed)
      if (!consumed) {
        offenders.push({ file: rel, line: i + 1, text: trimmed, fn, why })
      }
    }
  }
}

if (offenders.length) {
  console.error(`\n✖ check:result-consumed 发现 ${offenders.length} 处"结果被丢弃"的调用：\n`)
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}`)
    console.error(`    ${o.text}`)
    console.error(`    → ${o.fn} 的返回值被丢弃：${o.why}\n`)
  }
  console.error('修法：`const ok = await f(...)` 后按 ok 分报文案，或 `void f(...).then(ok => ...)`。')
  process.exit(1)
}

console.log(`✅ check:result-consumed 通过 — ${Object.keys(REGISTRY).length} 个动作函数的调用点都消费了返回值（已扫 ${files.length} 个文件）`)