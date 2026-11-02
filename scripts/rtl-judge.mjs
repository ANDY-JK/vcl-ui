/**
 * RTL 三条判定的**纯函数版**（#368，从 check-rtl.mjs 拆出）
 *
 * ## 为什么单独成文件而不是留在 check-rtl.mjs 里
 *
 * check-rtl.mjs 顶层会 **起 dev server + 启浏览器**（为了取证），任何 import 它的人
 * 都会连带把浏览器拉起来 —— 那样判据就没法单独自测。拆出来之后：
 * · 取证（check-rtl.mjs）负责采集 rows
 * · 判定（本文件）只读 rows，纯函数、零副作用
 *
 * ## 三道判据里 ① 是"防假绿"的那道
 *
 * 方向没切过去时，②③ 量的其实是 LTR —— 全绿毫无意义。
 * 这种"守卫判据"最该被自测：它一旦失效，后面的绿都是假的。
 */
export function judgeRows(rows) {
  const failures = []
  // ① 方向必须真的切过去了（否则后面的断言测的是 LTR，等于假绿）
  for (const r of rows) {
    if (r.error) continue
    if (r.direction !== r.dir) {
      failures.push(`#/${r.route} [${r.dir}] 方向未生效（实测 direction=${r.direction}）—— 断言会假绿`)
    }
  }
  // ② 零横向溢出（双向都要）
  for (const r of rows) {
    if (r.error) continue
    if (r.overflowX > 0) failures.push(`#/${r.route} [${r.dir}] 横向溢出 ${r.overflowX}px`)
  }
  // ③ 零越界（双向都要）
  for (const r of rows) {
    if (r.error) continue
    if (r.offenders.length) {
      const sample = r.offenders
        .slice(0, 3)
        .map((o) => `<${o.tag}${o.cls ? `.${o.cls}` : ''}>`)
        .join(' ')
      failures.push(`#/${r.route} [${r.dir}] ${r.offenders.length} 个元素越界（${sample}）`)
    }
  }
  return failures
}

