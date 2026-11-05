/**
 * 结构化事件码扫描器（从 `gen-facts.mjs` 抽出，`check:event-codes` 与 `gen:facts` 共用）。
 *
 * ## 为什么单独成文件
 *
 * 事件码是**宿主建告警规则的契约**（`docs-site/guide/facts.md` 的清单直接对外）。
 * 这份清单被两处消费：`gen:facts`（生成文档）与 `check:event-codes`（防重命名/删除）。
 * 如果两边各写一份解析器，迟早会出现"文档说有、闸口看不到"的分叉 —— TD-79 的老毛病。
 *
 * ## 解析不变量
 *
 * 每个文件里"像 reportEvent 调用点"的行数，必须等于真正解析出来的条数；
 * 少一条就抛错。漏码 = 宿主永远不会给该告警配规则，比整条闸口红更糟。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

/** 递归收集 src/components 下的 ts/vue 文件 */
function collectFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) collectFiles(p, out)
    else if (/\.(ts|vue)$/.test(e.name)) out.push(p)
  }
  return out
}

/**
 * 扫描全部 reportEvent 调用点。
 * @param {{root: string}} opts root = 仓库根（绝对路径）
 * @returns {{code:string,message:string,level:string,context:string,at:string}[]}
 */
export function scanEventCodes({ root }) {
  const files = collectFiles(join(root, 'src', 'components'))
  const rows = []
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    const lines = text.split('\n')
    const expectedCalls = lines.filter(
      (l) => /reportEvent\(/.test(l) && !/function\s+reportEvent|reportEvent\s*:\s*\(|reportEvent\?:/.test(l),
    ).length
    const rowsBefore = rows.length
    for (const [i, line] of lines.entries()) {
      if (!/reportEvent\(/.test(line)) continue
      if (/function\s+reportEvent|reportEvent\s*:\s*\(|reportEvent\?:/.test(line)) continue
      // 跨行调用：从当前行到文件末尾拉平（不做固定行窗假设）
      const window = lines.slice(i).join(' ').replace(/\s+/g, ' ')
      const startIdx = window.indexOf('reportEvent(')
      let depth = 0
      let endIdx = -1
      for (let k = startIdx + 'reportEvent('.length; k < window.length; k++) {
        const ch = window[k]
        if (ch === '(' || ch === '[' || ch === '{') depth++
        else if (ch === ')' || ch === ']' || ch === '}') {
          if (depth === 0 && ch === ')') {
            endIdx = k
            break
          }
          depth--
        }
      }
      if (endIdx < 0) continue
      const argStr = window.slice(startIdx + 'reportEvent('.length, endIdx)
      const args = []
      let buf = ''
      let d = 0
      let inStr = null
      for (const ch of argStr) {
        if (inStr) {
          buf += ch
          if (ch === inStr) inStr = null
          continue
        }
        if (ch === "'" || ch === '"') {
          inStr = ch
          buf += ch
          continue
        }
        if (ch === '(' || ch === '[' || ch === '{') d++
        if (ch === ')' || ch === ']' || ch === '}') d--
        if (ch === ',' && d === 0) {
          args.push(buf.trim())
          buf = ''
          continue
        }
        buf += ch
      }
      if (buf.trim()) args.push(buf.trim())
      const unq = (s) => (s && /^['"]/.test(s) ? s.slice(1, -1) : s)
      const code = unq(args[0])
      const message = unq(args[1])
      if (!code || !message) continue
      const lv = unq(args[3])
      rows.push({
        code,
        message,
        level: lv === 'info' || lv === 'warn' || lv === 'error' ? lv : 'warn',
        context: args[2] && args[2] !== 'undefined' ? args[2] : '',
        at: `${relative(root, f).replaceAll('\\', '/')}:${i + 1}`,
      })
    }
    const parsed = rows.length - rowsBefore
    if (parsed !== expectedCalls) {
      throw new Error(
        `[event-codes] 解析不完整：${relative(root, f)} 有 ${expectedCalls} 个 reportEvent 调用点，` +
          `只解析出 ${parsed} 个。漏码 = 宿主永远不会给该告警配规则。`,
      )
    }
  }
  rows.sort((a, b) => a.code.localeCompare(b.code))
  return rows
}
