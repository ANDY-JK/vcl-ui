/**
 * 变异清单漂移的**诊断**（纯函数，供 `check:mutation-audit --check-manifest` 使用）
 *
 * 为什么单独成模块并写成纯函数（#420）：
 * 本轮实测踩到一次 —— 清单里的 `find` 是三行写法，提交钩子的 prettier 把多行压成一行，
 * 于是闸口只报「目标片段出现 0 次」。**这句话本身没错，但它把"格式化"和"实现改了"
 * 混成同一个症状**：前者只要把片段换成当前源码的写法，后者才需要重写变异。当时是按
 * "实现改了"去查的，代价是多跑一次整链（第 10 步断）。
 *
 * 判据：把两边都**归一**（折叠空白 + 去掉只为换行服务的行尾逗号）后再比对。
 * 归一后能对上 → 片段没失效，直接把**当前源码里的那段原文**作为建议返回（可粘贴）。
 */

/** 折叠空白（含换行/制表）为单个空格并去首尾 */
export function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * 去掉"只为换行服务"的行尾逗号：`,)`, `,]`, `,}`, `,>` 前的逗号。
 * prettier 把多行压成一行时会顺手删掉它（本轮实测），所以它不属于"实现改了"的证据。
 */
export function stripTrailingCommas(text) {
  return text.replace(/,\s*([)\]}>])/g, '$1')
}

/**
 * 归一：**抹掉全部空白** + 去掉只为换行服务的行尾逗号。
 *
 * 为什么要抹掉（而不是折叠成单空格）：格式化不只是把换行变空格 —— 它还会顺手删掉
 * `sort(` 与 `(a, b)` 之间那个引气味的空格，折叠做法于是仍然对不上。
 * 归一结果只用于判断"是不是同一段代码"，不用于生成建议（建议取源码原文）。
 */
export function normalizeFragment(text) {
  return stripTrailingCommas(text.replace(/\s+/g, ''))
}

/**
 * 诊断一个 `find` 片段在当前源码里为什么对不上。
 *
 * @param {string} src 当前源码全文
 * @param {string} find 清单里的目标片段
 * @returns {{kind: 'exact', count: number}
 *          | {kind: 'whitespace', count: number, suggestion: string}
 *          | {kind: 'missing'}}
 *   · exact      —— 逐字节出现 count 次
 *   · whitespace —— 只在归一口径下出现（写法被格式化过），suggestion 是当前源码里的原文
 *   · missing    —— 归一后也没有：实现真的改了
 */
export function diagnoseFragment(src, find) {
  const exact = src.split(find).length - 1
  if (exact > 0) return { kind: 'exact', count: exact }

  const target = normalizeFragment(find)
  if (!target) return { kind: 'missing' }

  // 逐行窗口扫描：窗口大小从"片段行数"起步，往上留 3 行余量（格式化可能把行数改多或改少）。
  // 命中即返回该窗口的**原文**作为建议 —— 建议必须能直接粘回清单，不能是归一后的变体。
  const lines = src.split('\n')
  const findLines = Math.max(1, find.split('\n').length)
  let count = 0
  let suggestion = ''
  for (let size = 1; size <= findLines + 3; size++) {
    for (let i = 0; i + size <= lines.length; i++) {
      const window = lines.slice(i, i + size).join('\n')
      if (normalizeFragment(window).includes(target)) {
        count++
        if (!suggestion) suggestion = window.trim()
      }
    }
    if (count) break // 最小的窗口优先：更大窗口的命中只是同一处的超集
  }
  if (count) return { kind: 'whitespace', count, suggestion }
  return { kind: 'missing' }
}
