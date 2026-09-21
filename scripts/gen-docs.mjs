// 组件 API 文档生成器（Q9-半）—— 从源码生成 docs-site/components/*.md
//
// 为什么生成而不是手写：99 个组件的 props/emits 手抄必然漂移（demo 表 276 行已有
// check:demo-props 守谎报，但库自己的参考文档此前为零）。本脚本用 TypeScript 编译器
// API 解析 <script setup>：defineProps<Props>（本地/导入 interface 或内联字面量）+
// withDefaults 默认值 + defineEmits 载荷 + 成员 JSDoc，产物提交入库，
// check:docs 闸口「重新生成必须无 diff」防漂移。
//
// 解析不了的组件不静默跳过：进 manifest.unparsed，由 check-docs 判红（宁缺毋假）。
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOT = process.cwd()
const OUT = path.join(ROOT, 'docs-site/components')
const DOMAINS = [
  'basic', 'data', 'form', 'feedback', 'nav', 'layout', 'chart', 'login',
  'storage', 'wc', 'form-builder', 'amap', 'route-planner',
]
const DOMAIN_TITLES = {
  basic: '基础组件', data: '数据展示', form: '表单输入', feedback: '反馈提示',
  nav: '导航', layout: '布局', chart: '图表', login: '登录',
  storage: '存储', wc: 'Web Components', 'form-builder': '低代码表单',
  amap: '地图', 'route-planner': '路线规划',
}

// ---------- 工具 ----------
const read = (p) => {
  if (!fs.existsSync(p)) return ''
  try {
    if (fs.statSync(p).isDirectory()) return ''
    return fs.readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}

function extractScripts(vuePath) {
  const src = read(vuePath)
  // 合并所有 script 块：有的组件把 Props 接口放普通 <script>（避开 TS1184，
  // 见 Toast.vue 头注），defineProps 调用在 <script setup>——只读一个块会两边都看不到
  const blocks = [...src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  return blocks.length ? blocks.join('\n') : null
}

/** 收集一个 TS 源文本里的 interface/type 声明（同名后者覆盖前者） */
function collectDeclarations(text) {
  const sf = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const out = new Map()
  const visit = (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name) out.set(node.name.text, node)
    if (ts.isTypeAliasDeclaration(node) && node.name) out.set(node.name.text, node)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { sf, decls: out }
}

/** 解析 `import type { A, B } from './x'` → { A: './x' }，一层相对路径 */
function collectTypeImports(text, fromDir) {
  const sf = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const map = new Map()
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && node.importClause && node.importClause.isTypeOnly) {
      const spec = node.moduleSpecifier?.text
      if (!spec?.startsWith('.')) return
      const clause = node.importClause
      const bindings = clause.namedBindings
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          map.set(el.name.text, resolveModule(spec, fromDir))
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return map
}

/** 从接口/类型别名节点取成员表 [{ name, optional, type, doc }] */
function membersOfDecl(decl) {
  const members = []
  for (const m of decl.members ?? []) {
    if (!ts.isPropertySignature(m) || !m.name) continue
    const name = m.name.getText?.() ?? String(m.name.text ?? '')
    const type = m.type ? m.type.getText() : 'unknown'
    const doc = ts.getJSDocCommentsAndTags(m).filter((t) => ts.isJSDoc(t)).map((t) => t.getText().replace(/^\/\*\*|\*\/$/g, '').replace(/^\s*\*\s?/gm, '').trim()).join(' ').replace(/\s+/g, ' ')
    members.push({ name, optional: !!m.questionToken, type: compactType(type), doc })
  }
  return members
}

/** 类型文本压行：多行联合/对象压成单行，超长截断 */
function compactType(t) {
  const one = t.replace(/\s+/g, ' ').trim()
  return one.length > 120 ? one.slice(0, 117) + '…' : one
}

/** 解析 props 类型节点：TypeLiteral 直接取；TypeReference 查本地/导入声明；交叉类型逐支合并 */
function resolvePropsType(typeNode, ctx) {
  if (!typeNode) return null
  if (ts.isTypeLiteralNode(typeNode)) return membersOfDecl(typeNode)
  if (ts.isIntersectionTypeNode(typeNode)) {
    // Card 的 GridProps & StatProps、BaseChart 的 BaseChartProps & {…}：逐支解析后拼接。
    // 同名成员去重（两支都声明 type 时先到先得，后者不覆盖——与 TS 交叉语义一致，
    // 文档只列一次避免读者以为有两个 prop）
    const merged = []
    const seen = new Set()
    for (const t of typeNode.types) {
      const part = resolvePropsType(t, ctx)
      if (!part) continue
      for (const m of part) {
        if (seen.has(m.name)) continue
        seen.add(m.name)
        merged.push(m)
      }
    }
    return merged.length ? merged : null
  }
  if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
    const name = typeNode.typeName.text
    if (ctx.decls.has(name)) {
      const d = ctx.decls.get(name)
      if (ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d)) {
        if (ts.isTypeAliasDeclaration(d) && ts.isTypeLiteralNode(d.type)) return membersOfDecl(d.type)
        if (ts.isInterfaceDeclaration(d)) return membersOfDecl(d)
      }
    }
    if (ctx.typeImports.has(name)) {
      const file = ctx.typeImports.get(name)
      const imported = collectDeclarations(read(file))
      const d = imported.decls.get(name)
      if (d && ts.isInterfaceDeclaration(d)) return membersOfDecl(d)
      if (d && ts.isTypeAliasDeclaration(d) && ts.isTypeLiteralNode(d.type)) return membersOfDecl(d.type)
    }
    // 泛型/导入类型解析不了：留名，不编造
    return [{ name: '…', optional: true, type: `见源码 ${name}`, doc: '' }]
  }
  return null
}

/** withDefaults 第二参：默认值字面量文本 */
function defaultsOf(node) {
  const out = new Map()
  if (!node || !ts.isObjectLiteralExpression(node)) return out
  for (const p of node.properties) {
    if (ts.isPropertyAssignment(p) && p.name) {
      out.set(p.name.getText(), p.initializer.getText().replace(/\s+/g, ' '))
    } else if (ts.isShorthandPropertyAssignment(p)) {
      out.set(p.name.getText(), p.name.getText())
    }
  }
  return out
}

/** defineEmits 载荷：[e: MouseEvent] 或 (e: MouseEvent) => void；也支持 { (e: 'click'): void } 调用签名形态 */
function parseEmits(typeNode, ctx) {
  if (!typeNode) return []
  const out = []
  if (ts.isTypeLiteralNode(typeNode)) {
    for (const member of typeNode.members) {
      if (ts.isCallSignatureDeclaration(member) && member.parameters.length) {
        // (e: 'click'): void → 事件名取首参字符串字面量，载荷取其余参数
        const first = member.parameters[0]
        const firstType = first.type
        let name = ''
        if (firstType && ts.isLiteralTypeNode(firstType) && ts.isStringLiteral(firstType.literal)) {
          name = firstType.literal.text
        }
        if (!name) continue
        const rest = member.parameters.slice(1).map((p) => `${p.name.getText()}: ${p.type ? p.type.getText() : 'unknown'}`).join(', ')
        out.push({ name, payload: compactType(rest || '无'), doc: '' })
        continue
      }
    }
  }
  const members = resolvePropsType(typeNode, ctx) ?? []
  for (const m of members) {
    // 原始 type 文本形如 "[e: MouseEvent]" 或 "(a: string, b: number) => void"
    let payload = m.type
    const tuple = /^\[(.*)\]$/.exec(payload)
    if (tuple) payload = tuple[1]
    else payload = payload.replace(/\)\s*=>\s*void$/, ')').replace(/^\(/, '').replace(/\)$/, '')
    out.push({ name: m.name, payload: compactType(payload || '无'), doc: m.doc })
  }
  return out
}

/**
 * 提取 SFC 模板里的 slot 声明 → [{ name, scope, fallback }]
 * 形态覆盖：`<slot />`（default）、`<slot name="x" />`、带兜底内容的
 * `<slot name="x">…</slot>`、作用域参数 `<slot name="x" :a="1" :b="2">`、
 * 条件/循环分支（`<slot v-if/v-else/v-for … name="x">`）——同名去重取信息最全的一条。
 */
function parseSlots(file) {
  const src = read(file)
  // 根 template 边界：起始取无属性的 `<template>`（嵌套的 <template v-if> 带属性，不误判），
  // 结束取全文最后一个 `</template>`（最外层闭合在最后）。非贪婪正则会卡在第一个内层
  // </template> 截断——DataTable 第 2402 行的 empty slot 就是这样漏掉的。
  const startMatch = /<template>/.exec(src)
  if (!startMatch) return []
  const start = startMatch.index + startMatch[0].length
  const end = src.lastIndexOf('</template>')
  if (end < start) return []
  const body = src.slice(start, end)
  const found = new Map()
  const upsert = (slot) => {
    const prev = found.get(slot.name)
    // 信息量优先：有作用域参数 > 有兜底内容 > 空
    if (!prev || (slot.scope && !prev.scope) || (slot.fallback && !prev.fallback)) {
      found.set(slot.name, prev ? { ...prev, ...slot } : slot)
    }
  }
  // 逐个 slot 标签：先判自闭合，非自闭合的取到**最近的** </slot> 为止（slot 不嵌套，
  // 最近闭合即自己的）。混用「成对正则 + 自闭合正则」两遍扫会让自闭合 slot 误配到
  // 下一个 slot 的闭合标签，兜底预览混进无关模板代码。
  for (const m of body.matchAll(/<slot\b([^>]*?)(\/?)>/g)) {
    const attrs = m[1]
    const name = /name\s*=\s*["']([^"']+)["']/.exec(attrs)?.[1] ?? 'default'
    const scope = [...attrs.matchAll(/:([a-zA-Z][\w-]*)\s*=/g)].map((x) => x[1]).join(', ')
    let fallback = ''
    if (m[2] !== '/') {
      const rest = body.slice(m.index + m[0].length)
      const closeIdx = rest.indexOf('</slot>')
      if (closeIdx >= 0) {
        fallback = rest
          .slice(0, closeIdx)
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 40)
        // 兜底预览是模板源码，含 {{ expr }}：VitePress 把 markdown 当 Vue 模板编译，
        // 双花括号会被当插值表达式求值（文档页没有那些变量 → 构建直接失败）。
        // 转成 HTML 实体：渲染仍是 {{ }}，编译器不当表达式。
        fallback = fallback.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;')
      }
    }
    upsert({ name, scope, fallback })
  }
  return [...found.values()].sort((a, b) => (a.name === 'default' ? -1 : b.name === 'default' ? 1 : a.name.localeCompare(b.name)))
}

/** 主解析：一个 .vue → { props, defaults, emits, slots, declared } */
function parseComponent(file) {
  const script = extractScripts(file)
  if (!script) return { props: null, defaults: new Map(), emits: [], slots: [], declared: false }
  const dir = path.dirname(file)
  const { sf, decls } = collectDeclarations(script)
  const typeImports = collectTypeImports(script, dir)
  const ctx = { sf, decls, typeImports }
  let propsTypeNode = null
  let defaultsNode = null
  let emitsTypeNode = null
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText()
      if ((name === 'withDefaults' || name === 'defineProps') && !propsTypeNode) {
        const t = node.typeArguments?.[0] ?? null
        if (name === 'withDefaults') {
          const inner = node.arguments[0]
          if (inner && ts.isCallExpression(inner)) propsTypeNode = inner.typeArguments?.[0] ?? null
          defaultsNode = node.arguments[1] ?? null
        } else {
          propsTypeNode = t
        }
      }
      if (name === 'defineEmits' && !emitsTypeNode) emitsTypeNode = node.typeArguments?.[0] ?? null
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  const props = propsTypeNode ? resolvePropsType(propsTypeNode, ctx) : null
  const defaults = defaultsOf(defaultsNode)
  const emits = parseEmits(emitsTypeNode, ctx)
  const slots = parseSlots(file)
  // 完全没声明 props/emits/slots（空壳组件）不算失败；声明了但解析不到才算
  const declared = !!propsTypeNode || !!emitsTypeNode || slots.length > 0
  return { props, defaults, emits, slots, declared }
}

// ---------- barrel 导出清单 ----------
/** barrel 的 from './x' 常不带扩展名：按 x / x.ts / x/index.ts 解析真实文件 */
function resolveModule(spec, dir) {
  const base = path.resolve(dir, spec)
  for (const c of [base, base + '.ts', base + '.vue', path.join(base, 'index.ts')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  return base
}

/**
 * demo 站路由表：routeKey → demo 文件路径（解析 ComponentDemo.vue，与 site-audit 同口径）。
 * 路由键可能带引号也可能不带（'data-table': 与 button: 混用），正则两者都容让。
 */
function demoRoutes() {
  const src = read(path.join(ROOT, 'src/demos/ComponentDemo.vue'))
  const map = new Map()
  const re = /['"]?([a-z][a-z0-9-]*)['"]?\s*:\s*defineAsyncComponent\(\{[\s\S]{0,200}?import\(\s*'\.\/([^']+)'\s*\)/g
  let m
  while ((m = re.exec(src))) map.set(m[1], m[2])
  return map
}

/**
 * 组件 → demo 路由的命名分歧桥接（显式人工表，纯名字映射抓不到这些）：
 * 组件在 barrel 里的导出名与 demo 文件名不一致（barrel 重命名、一页 demo 覆盖多组件、
 * demo 文件名另起）。改这里必须同步改 ComponentDemo.vue 的路由，check:docs 只保生成
 * 一致性、不验路由存在——路由失效由 e2e site-audit 的全站遍历兜。
 */
const DEMO_ALIAS = {
  // form-builder 域：一页设计器 demo 覆盖三大组件 + 合同收集独立页
  FormDesigner: 'form-builder',
  FormCollect: 'form-builder',
  FormTargetCollect: 'contract-target-collect',
  // 采集域：三段合并 demo 页
  CameraCapture: 'capture',
  CodeCapture: 'capture',
  CaptureFallbackPanel: 'capture',
  CaptureFallbackSheet: 'capture',
  IconPicker: 'icon',
  // 登录域：barrel 重命名为 XxxPage，demo 一页覆盖四页面
  LoginPage: 'login',
  RegisterPage: 'login',
  ForgotPasswordPage: 'login',
  PortalLogin: 'login',
  // 布局/导航/地图：demo 文件名与组件名不一致
  ModalBox: 'modal',
  TabPanel: 'tabs',
  ProgressBar: 'progress',
  RouteMap: 'route-planner',
  RouteResult: 'route-planner',
  StorePanel: 'route-planner',
  StoreFormModal: 'route-planner',
  ImportProgress: 'route-planner',
}

/** 组件 → demo 路由键：别名表 → 精确 XxxDemo.vue → 文件名以组件名开头取最短 */
function demoRouteFor(componentName, routes) {
  if (DEMO_ALIAS[componentName]) return DEMO_ALIAS[componentName]
  const lower = componentName.toLowerCase()
  const entries = [...routes.entries()]
  const exact = entries.find(([, file]) => path.basename(file).toLowerCase() === `${lower}demo.vue`)
  if (exact) return exact[0]
  const prefixed = entries
    .filter(([, file]) => path.basename(file).toLowerCase().startsWith(lower))
    .sort((a, b) => path.basename(a[1]).length - path.basename(b[1]).length)
  return prefixed[0]?.[0]
}

function barrelExports(domain) {
  const file = path.join(ROOT, 'src/components', domain, 'index.ts')
  const src = read(file)
  const entries = []
  const re = /export\s*\{([^}]*)\}\s*from\s*'\.\/([^']+)'/g
  let m
  while ((m = re.exec(src))) {
    const spec = m[2]
    const isVue = spec.endsWith('.vue')
    // 先剥括号内的行/块注释（amap barrel 用 // 通用工具 分组注释组织导出），再拆名
    const body = m[1].replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const part of body.split(',')) {
      const t = part.trim()
      if (!t) continue
      const as = /^(\w+)\s+as\s+(\w+)$/.exec(t)
      const name = as ? as[2] : t
      const local = as ? as[1] : t
      const srcFile = resolveModule(spec, path.join(ROOT, 'src/components', domain))
      entries.push({
        name,
        kind: isVue ? 'component' : 'named',
        srcFile,
        local,
      })
    }
  }
  return entries
}

/** .ts 命名导出的 JSDoc 摘要（取声明处第一行） */
function namedDoc(file, name) {
  const src = read(file)
  const { sf } = collectDeclarations(src)
  let doc = ''
  const visit = (node) => {
    const names = []
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableStatement(node)) && node.name) {
      if (ts.isVariableStatement(node)) {
        for (const d of node.declarationList.declarations) if (d.name && ts.isIdentifier(d.name)) names.push(d.name.text)
      } else names.push(node.name.getText())
    }
    if (names.includes(name)) {
      const js = ts.getJSDocCommentsAndTags(node).filter((t) => ts.isJSDoc(t))
      if (js.length) doc = js[0].getText().replace(/^\/\*\*|\*\/$/g, '').replace(/^\s*\*\s?/gm, '').trim().split('\n')[0]
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return doc
}

// ---------- 生成 ----------
/** 生成到指定目录，返回 manifest（check-docs 用临时目录调它做漂移比对） */
export function generate(outDir) {
const manifest = { domains: {}, unparsed: [], totalComponents: 0, totalNamed: 0 }

function mdEscape(s) {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function tableRow(cells) {
  return '| ' + cells.map((c) => mdEscape(c ?? '')).join(' | ') + ' |'
}

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

for (const domain of DOMAINS) {
  const entries = barrelExports(domain)
  const lines = []
  lines.push(`# ${DOMAIN_TITLES[domain]}（${domain}）`)
  lines.push('')
  lines.push(`> 本页由 \`npm run gen:docs\` 从源码自动生成，请勿手改；改源码后重新生成（\`check:docs\` 闸口会卡漂移）。`)
  lines.push('')
  const components = entries.filter((e) => e.kind === 'component')
  const named = entries.filter((e) => e.kind === 'named')
  manifest.totalComponents += components.length
  manifest.totalNamed += named.length
  manifest.domains[domain] = { components: components.length, named: named.length }

  if (components.length) {
    lines.push('## 组件一览', '')
    lines.push(tableRow(['组件', 'Props 数', 'Events 数', 'Slots 数']))
    lines.push(tableRow(['---', '---', '---', '---']))
  }
  for (const c of components) {
    const api = parseComponent(c.srcFile)
    if (!api.declared) {
      lines.push(tableRow([`\`${c.name}\``, '0', '0', '0']))
      continue
    }
    if (!api.props && !api.emits.length && !api.slots.length) {
      manifest.unparsed.push(`${domain}/${c.name}`)
      lines.push(tableRow([`\`${c.name}\``, '解析失败', '解析失败', '解析失败']))
      continue
    }
    lines.push(
      tableRow([`\`${c.name}\``, String(api.props?.length ?? 0), String(api.emits.length), String(api.slots.length)]),
    )
  }
  if (named.length) {
    lines.push('', '## 组合式函数 / 工具导出', '')
    lines.push(tableRow(['导出', '说明']))
    lines.push(tableRow(['---', '---']))
    for (const n of named) {
      const doc = namedDoc(n.srcFile, n.local)
      lines.push(tableRow([`\`${n.name}\``, doc || '—']))
    }
  }
  lines.push('', '---', '')
  const routes = demoRoutes()
  for (const c of components) {
    const api = parseComponent(c.srcFile)
    lines.push(`## \`${c.name}\``, '')
    const route = demoRouteFor(c.name, routes)
    if (route) {
      lines.push(`> 🔗 在线示例：\`npm run dev\` 启动 demo 站后访问 \`#/${route}\`（Props 表与交互行为以 demo 页为准）`, '')
    }
    if (!api.declared) {
      lines.push('> 该组件无 props / events / slots API（纯展示组件）。', '')
      continue
    }
    if (!api.props && !api.emits.length) {
      lines.push('> ⚠️ 自动解析失败（props 非常规形态），请直接阅读源码：`src/components/' + domain + '/' + path.basename(c.srcFile) + '`', '')
      continue
    }
    if (api.props?.length) {
      lines.push('### Props', '')
      lines.push(tableRow(['属性', '类型', '默认值', '必填', '说明']))
      lines.push(tableRow(['---', '---', '---', '---', '---']))
      for (const p of api.props) {
        const def = api.defaults.get(p.name)
        const required = p.optional ? '否' : '是'
        lines.push(tableRow([`\`${p.name}\``, '`' + p.type + '`', def ? '`' + def + '`' : '—', required, p.doc || '—']))
      }
      lines.push('')
    } else {
      lines.push('### Props', '', '无 props。', '')
    }
    if (api.emits.length) {
      lines.push('### Events', '')
      lines.push(tableRow(['事件', '载荷', '说明']))
      lines.push(tableRow(['---', '---', '---']))
      for (const e of api.emits) {
        lines.push(tableRow([`\`${e.name}\``, '`' + e.payload + '`', e.doc || '—']))
      }
      lines.push('')
    }
    if (api.slots.length) {
      lines.push('### Slots', '')
      lines.push(tableRow(['插槽', '作用域参数', '兜底内容预览']))
      lines.push(tableRow(['---', '---', '---']))
      for (const s of api.slots) {
        lines.push(tableRow([`\`${s.name}\``, s.scope ? '`' + s.scope + '`' : '—', s.fallback || '—']))
      }
      lines.push('')
    }
  }
  fs.writeFileSync(path.join(outDir, `${domain}.md`), lines.join('\n') + '\n')
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
return manifest
}

// 直接运行 = 生成到 docs-site/components；被 import = 由调用方指定目录（check-docs 漂移比对）
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').replace(/^.*\/scripts\//, 'scripts/'))) {
  const m = generate(OUT)
  console.log(
    `[gen:docs] ${DOMAINS.length} 域 / 组件 ${m.totalComponents} / 命名导出 ${m.totalNamed}；` +
      `解析失败 ${m.unparsed.length}${m.unparsed.length ? '：' + m.unparsed.join(', ') : ''}`,
  )
  if (m.unparsed.length) process.exitCode = 1
}
