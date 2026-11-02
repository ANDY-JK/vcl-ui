/**
 * SSR 冒烟清单的**覆盖判据**（#377）——纯函数，供 ssr-smoke.spec 与未来闸口复用。
 *
 * ## 为什么需要
 *
 * `ssr-smoke.spec.ts` 的清单是手写的：每域代表 + 交互最重的组件。手写清单的经典问题是
 * **"新组件没人想起来加"**——#376 的 FormTargetCollect（setup 期读 localStorage）就漏了。
 *
 * ## 判据：按"域覆盖 + 危险信号"两级
 *
 * 1. **域覆盖**：清单必须覆盖 src/components 下所有含 .vue 的域（域级代表缺失 = 该域
 *    新组件顶层裸 DOM 访问永远无人发现）
 * 2. **危险信号**：源码里含 `localStorage` / `sessionStorage` / `matchMedia` /
 *    `new Image(` 的组件**必须逐个在清单里**（它们是"SSR 下必炸"的高危面）
 *
 * 判据刻意保守（宁多勿漏）：清单里多了不报（多渲染一个组件只是慢一点），
 * 漏了才报 —— 与 #372 静默错误判据"宁可漏（动态条件）"不同，这里**漏才是真风险**，
 * 因为冒烟测试的成本是秒级。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** 危险信号：SSR 下裸访问会炸的 API */
const DANGEROUS_PATTERNS = [
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bmatchMedia\s*\(/,
  /\bnew Image\s*\(/,
  /\bnavigator\.clipboard\b/,
]

/** 扫 src/components：返回 [{ domain, files: [{ name, path, dangerous }] }] */
export function scanComponentTree(componentsDir) {
  const domains = []
  for (const e of readdirSync(componentsDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const domain = e.name
    const files = []
    walkVue(join(componentsDir, domain), '', files)
    if (files.length) domains.push({ domain, files })
  }
  return domains
}

function walkVue(dir, rel, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    const relPath = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) {
      walkVue(full, relPath, out)
    } else if (e.name.endsWith('.vue')) {
      let dangerous = false
      try {
        const src = readFileSync(full, 'utf8')
        dangerous = DANGEROUS_PATTERNS.some((re) => re.test(src))
      } catch {
        /* 读不了按不危险处理（闸口另有文件存在性判据） */
      }
      out.push({ name: e.name.replace(/\.vue$/, ''), path: relPath, dangerous })
    }
  }
}

/**
 * 对账：返回清单漏掉的组件。
 *
 * @param scanned  scanComponentTree 的结果
 * @param listed   冒烟清单里的组件名 Set（如 'FormTargetCollect'）
 * @returns 漏掉的 [{ domain, name, path, dangerous }]，危险信号组件排前面
 */
export function findSmokeGaps(scanned, listed) {
  const gaps = []
  // 清单名可能是**组件名**（LoginPage）而不是文件名（login）—— 命名错配（#361 同款）。
  // 对账：两边小写化后做**互相前缀**匹配（login ↔ loginpage、input ↔ inputstepper 不冲突，
  // 因为 Input.stepper 是清单名、文件名是 Input，二者相等）。
  const norm = (x) => x.replace(/[-_](\w)/g, (_, c) => c.toUpperCase()).toLowerCase()
  const listedNorm = [...listed].map(norm)
  const matches = (fileName) => {
    const f = norm(fileName)
    return listedNorm.some((n) => n === f || n.startsWith(f) || f.startsWith(n))
  }
  for (const d of scanned) {
    for (const f of d.files) {
      if (!matches(f.name))
        gaps.push({ domain: d.domain, name: f.name, path: `${d.domain}/${f.path}`, dangerous: f.dangerous })
    }
  }
  // 危险信号组件排前面：先补高危面
  return gaps.sort((a, b) => Number(b.dangerous) - Number(a.dangerous))
}

/** 域覆盖：返回清单没覆盖到的域（按冒烟用例前缀匹配 —— 名字即域代表） */
export function findUncoveredDomains(scanned, listed) {
  const norm = (x) => x.replace(/[-_](\w)/g, (_, c) => c.toUpperCase()).toLowerCase()
  const listedNorm = [...listed].map(norm)
  const matches = (fileName) => {
    const f = norm(fileName)
    return listedNorm.some((n) => n === f || n.startsWith(f) || f.startsWith(n))
  }
  const domainsInList = new Set()
  for (const d of scanned) {
    for (const f of d.files) {
      if (matches(f.name)) {
        domainsInList.add(d.domain)
        break
      }
    }
  }
  return scanned.map((d) => d.domain).filter((dom) => !domainsInList.has(dom))
}

/** 从冒烟 spec 源码提取清单名（cases 数组的第一列） */
export function extractListedNames(specSource) {
  const names = new Set()
  // 单行形态：['Name', Comp…
  for (const m of specSource.matchAll(/\['([A-Za-z][\w.]*)',\s*\w+/g)) names.add(m[1])
  // 多行形态：[\n    'Name',\n    Comp —— 名字独占一行、下一行以组件标识符开头
  const lines = specSource.split('\n')
  for (let i = 1; i < lines.length; i++) {
    const m = lines[i].match(/^\s*'([A-Za-z][\w.]*)',\s*$/)
    if (m && /^\s*[A-Za-z_$][\w$]*(?:\.\w+)*,?\s*$/.test(lines[i + 1] ?? '')) names.add(m[1])
  }
  return names
}

/** statSync 转出避免 lint 未用告警（readdirSync/statSync 一起 import 的历史习惯） */
void statSync
