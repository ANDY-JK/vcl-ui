// 找出组件层覆盖率最低的文件（读 reports/coverage/coverage-final.json）
import { readFileSync } from 'node:fs'

const raw = JSON.parse(readFileSync('reports/coverage/coverage-final.json', 'utf8'))
const rows = []
for (const [file, d] of Object.entries(raw)) {
  const p = file.split('\\').join('/')
  const i = p.indexOf('/src/')
  if (i < 0) continue
  const st = Object.values(d.s ?? {})
  const br = Object.values(d.b ?? {}).flat()
  const sb = st.filter((x) => x > 0).length
  const bb = br.filter((x) => x > 0).length
  rows.push({
    file: p.slice(i + 5),
    stmt: st.length ? sb / st.length : 1,
    st: st.length,
    brPct: br.length ? bb / br.length : 1,
    bs: br.length,
  })
}
rows.sort((a, b) => a.stmt - b.stmt)
console.log(`  文件数 ${rows.length}`)
console.log('  ── 语句覆盖率最低 16 个 ──')
for (const r of rows.slice(0, 16)) {
  console.log(
    `   ${r.file.padEnd(52)} 语句(${r.st}) ${(r.stmt * 100).toFixed(1)}%  分支(${r.bs}) ${(r.brPct * 100).toFixed(1)}%`,
  )
}