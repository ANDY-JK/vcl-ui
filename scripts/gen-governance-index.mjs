#!/usr/bin/env node
/**
 * gen-governance-index —— 生成「索引层」文档：`docs/protected-files.md`
 *
 *   把散在各文件头部的 `⛔ 保护 — …` 变更控制注释汇总成一张表。
 *   此前 84 个文件都带这行注释，却没有任何地方能"一览"——新人只能靠全局搜索撞见。
 *
 * 本脚本是**生成器**：改完源注释后重跑本脚本即可，别手改产物。
 * 用法：node scripts/gen-governance-index.mjs
 *
 * ## 为什么抽成 `renderGovernanceIndex()`（TD-103，#388）
 *
 * 这份产物此前**只有写、没有校验**：`check:docs` 的扫描范围只有 `docs-site/components/`，
 * 于是索引可以静默漂移 —— #387 重跑时才发现 `Toast.vue` 头部带 `⛔ 保护` 却不在索引里
 * （82 → 83）。抽成纯函数后 `check-docs.mjs` 可以"重新算一遍再逐字节比对"，
 * 漂移当场变红，且**不需要新增质量链步骤**。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const MARK = '⛔ 保护'

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|vue)$/.test(name)) out.push(p)
  }
  return out
}

/** 取头注里的 `禁止：…` 与 `需我确认：…` 片段（只在**头部注释块内**取，不越界到代码） */
function protectionDetail(text) {
  const lines = text.split('\n').slice(0, 24)
  const idx = lines.findIndex((l) => l.includes(MARK))
  if (idx < 0) return null
  // 从标记行起，取到注释块结束（`*/`）或最多 5 行，且每行先去掉行首注释符
  const chunkLines = []
  for (let i = idx; i < Math.min(lines.length, idx + 6); i++) {
    const raw = lines[i]
    const isComment = /^\s*(\/\/|\/\*|\*)/.test(raw)
    if (i > idx && !isComment) break // 注释块结束，别把后面的代码吃进来
    chunkLines.push(raw.replace(/^\s*(\/\/|\/\*+|\*)\s?/, ''))
    if (/\*\//.test(raw)) break
  }
  const chunk = chunkLines.join(' ')
  const grab = (label) => {
    const m = chunk.match(new RegExp(`${label}[：:]\\s*([^*/]*)`))
    return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 80) : ''
  }
  return { forbid: grab('禁止'), confirm: grab('需我确认'), raw: lines[idx].trim() }
}

/** 受保护文件清单（纯读：只读源码，不写任何东西） */
function collectProtected(root) {
  const rows = []
  for (const f of walk(join(root, 'src'))) {
    const rel = relative(root, f).replaceAll('\\', '/')
    const d = protectionDetail(readFileSync(f, 'utf8'))
    if (d) rows.push({ rel, ...d })
  }
  rows.sort((a, b) => a.rel.localeCompare(b.rel))
  return rows
}

/**
 * 算出索引文档的**完整内容**（不落盘）。
 *
 * @param {string} root 仓库根目录（默认 `process.cwd()`）
 * @returns {{ files: Record<string, string>, stats: { protectedCount: number, needConfirm: number } }}
 *   `files` 的键是仓库相对路径（`/` 分隔），值与生成器写出的内容**逐字节一致**。
 */
export function renderGovernanceIndex(root = process.cwd()) {
  const rows = collectProtected(root)
  const needConfirm = rows.filter((r) => r.confirm)
  const md = [
    '# 受保护文件索引（变更控制注释汇总）',
    '',
    '> **本文件由 `node scripts/gen-governance-index.mjs` 生成，请勿手改。**',
    '> ',
    '> 这些文件的头部带 `⛔ 保护 — <组件>，禁止：… / 需我确认：…` 注释，表示修改前需要人工确认。',
    '> 本索引只是把它们**列出来**；判定规则本身仍以各文件头部注释为准。',
    '',
    `- 受保护文件：**${rows.length}** 个（\`.vue\` ${rows.filter((r) => r.rel.endsWith('.vue')).length} + \`.ts\` ${rows.filter((r) => r.rel.endsWith('.ts')).length}）`,
    `- 其中写明「需我确认」的：**${needConfirm.length}** 个`,
    '',
    '> **计数口径**：判定条件是「文件**头 24 行内**出现 `⛔ 保护` 标记」。全内容扫描会多出 2 个（正文里提到该约定',
    '> 的文件），那类不算受保护文件——口径写在这里，免得两个数字打架。',
    '',
    '## 全量清单',
    '',
    '| 文件 | 禁止 | 需我确认 |',
    '|---|---|---|',
    ...rows.map((r) => `| \`${r.rel}\` | ${r.forbid || '—'} | ${r.confirm || '—'} |`),
    '',
  ].join('\n')

  return {
    files: {
      'docs/protected-files.md': md,
    },
    stats: { protectedCount: rows.length, needConfirm: needConfirm.length },
  }
}

/** 直接运行（`node scripts/gen-governance-index.mjs`）时落盘；被 import 时什么都不做 */
const invokedDirectly = (() => {
  const entry = process.argv[1]
  return !!entry && import.meta.url === new URL(`file://${entry.replaceAll('\\', '/')}`).href
})()

if (invokedDirectly) {
  const root = process.cwd()
  const { files, stats } = renderGovernanceIndex(root)
  for (const [rel, content] of Object.entries(files)) writeFileSync(join(root, rel), content, 'utf8')
  console.log(`[gen-governance-index] docs/protected-files.md：${stats.protectedCount} 个受保护文件（需我确认 ${stats.needConfirm}）`)
}
