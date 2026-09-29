// 构建期采集「实际进了产物的第三方模块」证据，供第三方许可清单生成用。
//
// 为什么不用 npm 依赖树推算：依赖树会把 tree-shaking 后一行代码都没进包的件也列进来
// （qrcode → yargs → cliui → …），许可清单就会虚报；而 rollup 的 chunk.modules 是
// **产物自己的**模块清单，它就是"这段代码在不在包里"的答案。
//
// es/cjs 两种格式各回调一次 generateBundle，故对同一份 JSON 做读-改-写并集；
// prebuild 的 clean 保证每次构建从零开始，不会累积历史。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 读包自己的 package.json（只取 name，用于还原 npm 别名安装），带缓存 */
const nameCache = new Map()
function installedPackageName(pkgDirAbs) {
  if (nameCache.has(pkgDirAbs)) return nameCache.get(pkgDirAbs)
  let name
  try {
    name = JSON.parse(readFileSync(join(pkgDirAbs, 'package.json'), 'utf8')).name || null
  } catch {
    name = null
  }
  nameCache.set(pkgDirAbs, name)
  return name
}

/**
 * 把 rollup 模块 id 归一为「所属包 + 包内相对路径」。
 * 非 node_modules 里的模块（本库自有代码、构建器虚拟件）返回 null。
 * @param {string} id rollup 模块 id（通常是绝对路径，可能带 \0 前缀或 query）
 * @param {string} rootCwd 构建根，用于剥掉绝对前缀
 * @returns {{ pkg: string, alias: string|null, path: string }|null}
 */
export function classifyModuleId(id, rootCwd) {
  if (typeof id !== 'string') return null
  let s = id.charCodeAt(0) === 0 ? id.slice(1) : id
  s = s.split('?')[0].split('#')[0]
  if (s.includes('(') || s.includes(')')) return null // rollup 生成件：(commonjsHelpers) 等，无包归属
  const norm = s.replaceAll('\\', '/')
  const base = (rootCwd || '').replaceAll('\\', '/').replace(/\/+$/, '')
  const rel = base && norm.startsWith(base + '/') ? norm.slice(base.length + 1) : norm
  const parts = rel.split('/')
  const nm = parts.lastIndexOf('node_modules')
  if (nm < 0) return null
  const rest = parts.slice(nm + 1)
  const scoped = !!rest[0] && rest[0].startsWith('@')
  const dirName = scoped ? `${rest[0]}/${rest[1]}` : rest[0]
  if (!dirName) return null
  const fileRel = rest.slice(scoped ? 2 : 1).join('/')
  if (!fileRel) return null // 只到包目录、没有具体文件：不是模块
  // 包目录在磁盘上的位置：模块在本仓内时按 rootCwd 拼，否则 norm 本身就是绝对路径
  const upToPkg = parts.slice(0, nm + (scoped ? 3 : 2))
  const pkgDirAbs =
    rel === norm ? norm.split('/').slice(0, upToPkg.length).join('/') : join(rootCwd || process.cwd(), ...upToPkg)
  const realName = installedPackageName(pkgDirAbs) || dirName
  return {
    pkg: realName,
    alias: realName !== dirName ? dirName : null,
    path: `node_modules/${realName}/${fileRel}`,
  }
}

/**
 * vite 插件：把每次产物输出包含的第三方模块记进 dist/third-party-modules.json
 * @param {{ outDir?: string, root?: string }} opts
 */
export function thirdPartyEvidencePlugin(opts = {}) {
  const outDir = opts.outDir || 'dist'
  const evidence = join(outDir, 'third-party-modules.json')
  return {
    name: 'vcl-third-party-evidence',
    apply: 'build',
    generateBundle(_options, bundle) {
      const rootCwd = opts.root || process.cwd()
      const found = {}
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.modules) continue
        for (const id of Object.keys(chunk.modules)) {
          const c = classifyModuleId(id, rootCwd)
          if (!c) continue
          const cur = (found[c.pkg] = found[c.pkg] || { alias: c.alias, files: [] })
          cur.alias = cur.alias || c.alias
          cur.files.push(c.path)
        }
      }
      let prev = {}
      if (existsSync(evidence)) {
        try {
          prev = JSON.parse(readFileSync(evidence, 'utf8'))
        } catch {
          prev = {}
        }
      }
      for (const [pkg, info] of Object.entries(found)) {
        const acc = prev[pkg] || { alias: null, files: [] }
        acc.alias = acc.alias || info.alias || null
        acc.files = [...new Set([...acc.files, ...info.files])].sort()
        prev[pkg] = acc
      }
      mkdirSync(dirname(evidence), { recursive: true })
      writeFileSync(evidence, JSON.stringify(prev, null, 2), 'utf8')
      const n = Object.keys(prev).reduce((s, k) => s + prev[k].files.length, 0)
      console.log(`[evidence] 第三方包=${Object.keys(prev).length} 进包模块=${n}`)
    },
  }
}
