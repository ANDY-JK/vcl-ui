// 闸口：demo 的 Props 文档表必须与组件真实 defineProps 对账
// 用法：node scripts/check-demo-props.mjs [--verbose]
//
// 为什么要这道闸：每个 demo 手写一张 HTML Props 表，和组件的 defineProps 之间没有任何机械对账，
// 于是「表里列了组件根本没有的 prop」「必填无默认却在表里写了默认值」这类谎报能长期存在
// （实测抓到 AvatarDemo 列 color、StepsDemo 给必填的 current 写默认 1）。
// 判据只卡「谎报」两档，不卡「漏写」——漏写是文档欠账，一次性铺给 32 张表会变成没人维护的死表。
import fs from 'node:fs'
import path from 'node:path'

const VERBOSE = process.argv.includes('--verbose')

const walk = (d, o = []) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name)
    if (f.isDirectory()) walk(p, o)
    else o.push(p)
  }
  return o
}
const rel = (p) => p.replace(/\\/g, '/')
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '')

const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())

// ---------- 组件侧：解析 props 名单 ----------
function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return null
  const base = spec.startsWith('@/') ? path.join('src', spec.slice(2)) : path.resolve(path.dirname(fromFile), spec)
  for (const c of [base, base + '.vue', base + '.ts', path.join(base, 'index.ts'), path.join(base, 'index.vue')]) {
    if (fs.existsSync(c) && !fs.statSync(c).isDirectory()) return rel(c)
  }
  return null
}

/** 从一段 interface/type 字面量文本里取顶层成员名与是否必填（按括号深度只认第一层） */
function membersOf(body) {
  const out = new Map()
  if (!body) return out
  let depth = 0
  for (const line of body.split('\n')) {
    const t = line.trim()
    if (depth === 0) {
      const m = /^(\w+)(\?)?\s*:/.exec(t)
      if (m) out.set(m[1], !m[2]) // value = required
    }
    for (const ch of t) {
      if ('{['.includes(ch)) depth++
      else if ('}]'.includes(ch)) depth--
    }
    if (depth < 0) depth = 0
  }
  return out
}

/** 按顶层 & 拆分泛型参数（花括号内的 & 不算分界） */
function splitIntersection(s) {
  const parts = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '{') depth++
    else if (ch === '}') depth--
    if (ch === '&' && depth === 0) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  parts.push(cur)
  return parts.map((p) => p.trim()).filter(Boolean)
}

/** 抓 interface X {...} / type X = {...} 块（含跨文件一跳） */
function findInterface(file, name, depth = 0) {
  if (depth > 2 || !file) return null
  const src = read(file)
  const re = new RegExp(`(?:export\\s+)?(?:interface|type)\\s+${name}\\s*(?:=\\s*)?\\{`, 'g')
  const m = re.exec(src)
  if (!m) {
    // 名字可能从别的文件 import 进来，跟一跳
    const imp = new RegExp(`import\\s+(?:type\\s+)?\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`).exec(src)
    if (imp) return findInterface(resolveSpec(file, imp[1]), name, depth + 1)
    return null
  }
  const i = m.index + m[0].length - 1
  const end = matchBalanced(src, i, '{', '}')
  if (end < 0) return null
  return src.slice(m.index + m[0].length, end)
}

/** 从 fromIdx 处的开字符起，配平地找到对应闭字符的下标；找不到返回 -1
 *  注释与字符串里的括号一律不计数 —— DataTable 的 props 块里有
 *  「总行数 > 可视行数」这样的散文比较号，早先它把泛型体截断在半路，
 *  58 个 prop 只认得 26 个，后半全被当成谎报。 */
function matchBalanced(src, fromIdx, open, close) {
  const i0 = src.indexOf(open, fromIdx)
  if (i0 < 0) return -1
  let d = 0
  let block = false
  let lineCmt = false
  let quote = ''
  for (let i = i0; i < src.length; i++) {
    const ch = src[i]
    const next = src[i + 1]
    if (block) {
      if (ch === '*' && next === '/') {
        block = false
        i++
      }
      continue
    }
    if (lineCmt) {
      if (ch === '\n') lineCmt = false
      continue
    }
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === '/' && next === '*') {
      block = true
      i++
      continue
    }
    if (ch === '/' && next === '/') {
      lineCmt = true
      i++
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    if (open === '<' && ch === '=' && next === '>') {
      i++
      continue // 箭头函数的 => 不是泛型收尾
    }
    if (ch === open) d++
    else if (ch === close) {
      d--
      if (d === 0) return i
    }
  }
  return -1
}

/** 对象式 props 声明：逐个顶层条目取 required / default（defineProps({...}) 与 defineComponent({props:{...}}) 共用） */
function parseObjectProps(body) {
  const out = new Map()
  if (!body) return out
  let i = 0
  while (i < body.length) {
    const m = /(\w+)\s*:\s*\{/.exec(body.slice(i))
    if (!m) break
    const name = m[1]
    const open = i + m.index + m[0].length - 1
    const close = matchBalanced(body, open, '{', '}')
    if (close < 0) break
    const entry = body.slice(open + 1, close)
    out.set(name, { required: /required:\s*true/.test(entry), hasDefault: /\bdefault\s*:/.test(entry) })
    i = close + 1
  }
  return out
}

/** 组件的 props：名字 -> { required, hasDefault, loose }；解析不出返回 null */
function propsOf(file) {
  const src = read(file)
  const at = src.search(/defineProps\s*[<(]/)
  const members = new Map()
  const put = (name, info) => {
    if (!members.has(name)) members.set(name, { required: false, hasDefault: false, ...info })
  }
  let loose = false

  if (at >= 0) {
    const head = src.slice(at)
    if (/^defineProps\s*</.test(head)) {
      // 泛型形态：defineProps<A>()、defineProps<A & B>()、defineProps<{ 内联 }>()
      const lt = head.indexOf('<')
      const gt = matchBalanced(head, lt, '<', '>')
      for (const part of splitIntersection(head.slice(lt + 1, gt))) {
        let body = null
        if (part.startsWith('{')) body = part.slice(1, matchBalanced(part, 0, '{', '}'))
        else {
          const name = /^[\w.]+/.exec(part)?.[0]
          if (name) body = findInterface(file, name)
        }
        for (const [k, required] of membersOf(body ?? '')) put(k, { required })
      }
    } else {
      const lp = head.indexOf('(')
      const rp = matchBalanced(head, lp, '(', ')')
      for (const [k, v] of parseObjectProps(head.slice(lp + 1, rp))) put(k, v)
    }
  }

  if (!members.size) {
    // defineComponent({ props: { name: { type, required, default } } }) —— 无 SFC 宏的写法（IconSvg 就是这类）
    const pm = /(?:^|[\s({])props\s*:\s*\{/.exec(src)
    if (pm) {
      const open = pm.index + pm[0].length - 1
      const close = matchBalanced(src, open, '{', '}')
      for (const [k, v] of parseObjectProps(src.slice(open + 1, close))) put(k, v)
    }
  }

  if (!members.size) {
    // 兜底：把文件里所有 interface / 内联 type 的成员都收进来（宁可宽收也不误报），并标 loose
    for (const m of src.matchAll(/(?:interface|type)\s+\w+\s*(?:=\s*)?\{/g)) {
      const open = m.index + m[0].length - 1
      const close = matchBalanced(src, open, '{', '}')
      for (const [k, required] of membersOf(src.slice(open + 1, close))) put(k, { required })
    }
    loose = members.size > 0
  }

  // withDefaults 的键 = 有默认值
  const defaults = new Set()
  const wAt = src.search(/withDefaults\s*\(\s*defineProps/)
  if (wAt >= 0) {
    const lp = src.indexOf('(', wAt)
    const rp = matchBalanced(src, lp, '(', ')')
    const args = src.slice(lp + 1, rp)
    const ob = args.indexOf('{', args.indexOf(')'))
    if (ob > 0) {
      const oc = matchBalanced(args, ob, '{', '}')
      for (const m of args.slice(ob + 1, oc).matchAll(/^\s*(\w+)\s*:/gm)) defaults.add(m[1])
    }
  }

  const out = new Map()
  for (const [name, info] of members)
    out.set(name, { required: info.required, hasDefault: info.hasDefault || defaults.has(name), loose })
  return out
}

// ---------- demo 侧：拿到它涉及的组件 ----------
function componentsOfDemo(file) {
  const src = read(file)
  const files = new Set()
  for (const m of src.matchAll(/import\s+(?:type\s+)?(\w+|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g)) {
    const spec = m[2]
    if (!/\.vue$/.test(spec) && !/^@\/components(\/.*)?$/.test(spec) && !spec.startsWith('@/components/')) continue
    const resolved = resolveSpec(file, spec)
    if (!resolved) continue
    if (resolved.endsWith('.vue')) {
      files.add(resolved)
      continue
    }
    // barrel：把命名导入逐个解析回定义文件
    const barrel = read(resolved)
    const names = m[1].startsWith('{') ? m[1].slice(1, -1) : m[1]
    for (const raw of names.split(',')) {
      const nm = raw
        .trim()
        .split(/\s+as\s+/)
        .pop()
        .trim()
      if (!nm) continue
      const ex = new RegExp(
        `export\\s+(?:default\\s+as|type\\s+)?\\{?[^\\n]*?\\b${nm}\\b[^\\n]*?from\\s*['"]([^'"]+)['"]`,
      ).exec(barrel)
      if (!ex) {
        const def = new RegExp(
          `export\\s*\\{\\s*default\\s+as\\s+${nm}\\s*,?\\s*\\}?\\s*from\\s*['"]([^'"]+)['"]`,
        ).exec(barrel)
        if (def) {
          const r = resolveSpec(resolved, def[1])
          if (r && r.endsWith('.vue')) files.add(r)
        }
        continue
      }
      const r = resolveSpec(resolved, ex[1])
      if (r && r.endsWith('.vue')) files.add(r)
    }
  }
  return [...files]
}

/** 抽 demo 里所有 Props 表的行：返回 [{ name, defCell, line, table }] */
function tableRows(file) {
  const src = read(file)
  const lineOf = (idx) => src.slice(0, idx).split('\n').length
  const rows = []
  let table = -1
  let inPropTable = false
  let defIdx = -1
  // 表头可能一行一个 th，故整块取 tr 再分单元格，不逐行判
  for (const tr of src.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<t([hd])[^>]*>([\s\S]*?)<\/t\1>/g)].map((m) => ({
      tag: m[1],
      text: m[2]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    }))
    if (!cells.length) continue
    if (cells.every((c) => c.tag === 'h')) {
      const texts = cells.map((c) => c.text)
      inPropTable = texts.some((c) => /^(prop|属性|prop\s*名)$/i.test(c))
      defIdx = texts.findIndex((c) => /^默认(值)?$/.test(c))
      if (inPropTable) table++
      continue
    }
    if (!inPropTable) continue
    const name = (cells[0]?.text || '').replace(/`/g, '').trim()
    const id = /^([a-z][A-Za-z0-9-]{1,40})$/.exec(name)
    if (!id) continue
    rows.push({ name: id[1], defCell: defIdx >= 0 ? (cells[defIdx]?.text ?? '') : '', line: lineOf(tr.index), table })
  }
  return rows
}

// ---------- 对账 ----------
const demos = walk('src/demos')
  .filter((p) => rel(p).endsWith('.vue'))
  .map(rel)
  .sort()

const lies = []
let tables = 0
let checkedRows = 0
const unparsed = []

for (const d of demos) {
  const rows = tableRows(d)
  if (!rows.length) continue
  tables++
  const comps = componentsOfDemo(d)
  const propSets = []
  for (const c of comps) {
    const p = propsOf(c)
    if (p && p.size) propSets.push({ c, p })
    // 组件本身不声明任何 prop（纯事件驱动）是正常形态，不算判据没覆盖到
    else if (read(c).includes('defineProps') || read(c).includes('props:'))
      unparsed.push(`${c}（被 ${d} 引用，props 没解析出来）`)
  }
  if (!propSets.length) {
    unparsed.push(`${d}：表有 ${rows.length} 行，但一个组件 props 都没解析到 —— 判据在此空转`)
    continue
  }
  // 按表归属组件：一张表的行若被某个组件覆盖到 60% 以上且无并列，这张表就判给它；
  // 否则退回并集宽判。不这么做的话，AvatarDemo 那种「表里多列一个 color」会被
  // 同 demo 顺手 import 的 Card（它真有 color）掩盖掉 —— 判据等于没立。
  const byTable = new Map()
  for (const r of rows) {
    if (!byTable.has(r.table)) byTable.set(r.table, [])
    byTable.get(r.table).push(r)
  }
  for (const group of byTable.values()) {
    const scored = propSets.map((s) => ({ s, hit: group.filter((r) => s.p.has(camel(r.name))).length }))
    const best = Math.max(0, ...scored.map((x) => x.hit))
    const owners = scored.filter((x) => x.hit === best && best > 0)
    const attributed = owners.length === 1 && best >= Math.ceil(group.length * 0.6)
    const scope = attributed ? [owners[0].s] : propSets
    for (const r of group) {
      checkedRows++
      const key = camel(r.name)
      const owner = scope.find((x) => x.p.has(key))
      if (!owner) {
        lies.push(
          `${d}:${r.line}  表里列了 ${r.name}，但 ${attributed ? `该表判归 ${owners[0].s.c}` : '该 demo 引用的组件'}都没有这个 prop`,
        )
        continue
      }
      if (!r.defCell || /^[—\-－]|^(无|自动|必填)$/.test(r.defCell)) continue
      const info = owner.p.get(key)
      if (info.required && !info.hasDefault)
        lies.push(`${d}:${r.line}  ${r.name} 在 ${owner.c} 里是必填且无默认，表里却写默认「${r.defCell}」`)
    }
  }
}

console.log(`[demo 文档表对账] 表 ${tables} 张 / 行 ${checkedRows} 条 / 谎报 ${lies.length} 条`)
for (const l of lies) console.log('  ✗ ' + l)
if (VERBOSE) {
  console.log('\n-- props 未解析出的组件（不计入判定，仅供补判据）--')
  for (const u of [...new Set(unparsed)]) console.log('  · ' + u)
}
if (!tables || !checkedRows) {
  console.error('❌ 一条表行都没扫到 —— 判据失效，不能因为正则没命中就假绿')
  process.exit(1)
}
if (lies.length) {
  console.error(`❌ check:demo-props 不过：${lies.length} 条谎报`)
  process.exit(1)
}
console.log('\n✅ check:demo-props 通过')
