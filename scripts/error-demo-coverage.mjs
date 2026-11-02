/**
 * 「外部错误注入演示」覆盖判据（#382）—— 把 #378~#381 的手工清欠变成闸口
 *
 * ## 为什么需要
 *
 * #378~#381 手工补了 4 个组件的 error/invalid 交互演示。**新组件再加 error/invalid 时
 * 演示页同步加卡片**目前只是纪律（#381 建议③），没有机械判据 —— 下一个组件加了
 * `error` prop 而演示页没加卡片，又是同样的静默盲区。
 *
 * ## 判据
 *
 * 源码里有 `error?:` 或 `invalid?:` prop 的组件 → **必须能在某个演示页找到
 * `:error=` / `:invalid=` 的绑定**（静态绑定即可 —— 交互卡片的"质量"没法机械判，
 * 但"有没有"可以）。
 *
 * 白名单：`error` 语义不是"注入错误"的组件（如事件 `@error` 不算、`error?:` 是
 * 回调类型的）逐条登记理由，双向对账（同 #372 棘轮形态）。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 组件源码里是否声明了可注入的错误 prop */
export function hasErrorishProps(source) {
  return /\b(error|invalid)\?\s*:/.test(source)
}

/** 演示页源码里是否绑定了这些 prop（v-bind 形态） */
export function demoBindsErrorish(demoSource) {
  return /:(error|invalid)\s*=/.test(demoSource)
}

/** 扫组件目录：返回声明了 error/invalid prop 的组件 [{ name, path }] */
export function scanErrorishComponents(componentsDir) {
  const out = []
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      const relPath = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(full, relPath)
      else if (e.name.endsWith('.vue')) {
        const src = readFileSync(full, 'utf8')
        if (hasErrorishProps(src)) out.push({ name: e.name.replace(/\.vue$/, ''), path: relPath })
      }
    }
  }
  walk(componentsDir, '')
  return out
}

/** 扫演示目录：返回 { 演示页文件名 → 源码 } 的聚合绑定状态 */
export function scanDemoBindings(demosDir) {
  const demos = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.vue')) demos.push({ file: e.name, source: readFileSync(full, 'utf8') })
    }
  }
  walk(demosDir)
  return demos
}

/**
 * 对账：声明了 error/invalid prop 却在全部演示页中找不到绑定的组件。
 *
 * @param comps  scanErrorishComponents 结果
 * @param demos  scanDemoBindings 结果
 * @param exempt 豁免清单（组件名 → 理由），双向对账：命中过的豁免才算有效
 */
export function findDemoGaps(comps, demos, exempt = {}) {
  const anyBind = new Map()
  for (const d of demos) {
    for (const c of comps) {
      if (demoBindsErrorish(d.source) && d.source.includes(`<${c.name}`)) {
        anyBind.set(c.name, d.file)
      }
    }
  }
  const gaps = []
  const usedExempt = new Set()
  for (const c of comps) {
    if (anyBind.has(c.name)) continue
    if (Object.prototype.hasOwnProperty.call(exempt, c.name)) {
      usedExempt.add(c.name)
      continue
    }
    gaps.push(c)
  }
  const staleExempt = Object.keys(exempt).filter((k) => !usedExempt.has(k))
  return { gaps, staleExempt }
}
