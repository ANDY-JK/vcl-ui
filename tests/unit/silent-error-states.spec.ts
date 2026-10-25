// @vitest-environment node
/**
 * 棘轮：**「错误状态写了却没人看」这类缺陷**（第 109 轮建立）。
 *
 * ## 为什么要有这个闸口
 *
 * `FormCollect.vue` 里 `importError` 被赋值了 6 处（空文件 / 坏 JSON / 写库失败三条路径），
 * 但**模板里没有任何节点消费它** —— 用户点"导入记录"什么都没发生：空文件、坏 JSON、后端 500
 * 在界面上长得一模一样，都像"点了没反应"。这类缺陷有三难：单测容易只断言"没写入/没弹窗"就过、
 * 类型检查发现不了、人眼审模板时也容易漏（状态名在 script 里出现得很合理）。
 *
 * ## 判据（刻意简单、可审计）
 *
 * 名字像错误/提示的状态（`/(Error|Msg|Message|Fail|Failure|Warn|Warning|Alert|Hint)$/`），
 * 在 `<script>` 里被**赋值**过（`x.value =` / `x = ref/computed(...)`），
 * 但 `<template>` 文本里**一次都没出现** → 记为候选。
 *
 * 这个规则会漏掉"经 computed 间接消费"的情形（模板用 `displayError`，而它读 `internalError`），
 * 所以候选**不等于**缺陷：每一条都要人工分诊，结论落进下面的 `REVIEWED` 清单（写清理由）。
 * 清单是**双向**的：① 出现清单外的新候选 → 红（逼你分诊）；② 清单里的条目不再是候选 → 也红
 * （说明代码变了，理由可能过期，必须回来删）。
 *
 * 为什么不追求"精确可达性分析"：试过沿 computed 依赖做传播，但正则切 `computed(...)` 的
 * 依赖区间很容易跨语句串行，结果**假阴性**（真缺陷被吞）比假阳性更危险。宁可"候选多、必须分诊"。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src', 'components')

/** 名字像"错误/提示"的状态 */
const STATE_NAME = /(Error|Msg|Message|Fail|Failure|Warn|Warning|Alert|Hint)$/
/** 至少扫到这么多 .vue 才算"真的扫了"（防止 walker 坏掉后空集判绿） */
const MIN_VUE_FILES = 100

/**
 * 已分诊的候选：`文件模式 + 状态名` → 理由。
 *
 * 全部是「经 computed 间接消费」的形态：模板用的是 `displayError` / `showImg`，
 * 它们内部读这个状态。判据只看"名字是否出现在模板"，看不到这层，故登记豁免。
 *
 * 用**模式**而不是字面路径：`login/` 下有个含密钥样字符串的文件名（本仓的脱敏约定），
 * 字面写死既脆弱也不该出现在测试里；模式仍保持"必须命中"的约束（见下方双向校验）。
 */
const REVIEWED: Array<{ file: RegExp; name: string; reason: string }> = [
  {
    file: /^data\/Avatar\.vue$/,
    name: 'imgError',
    reason: '经 showImg computed 消费：`const showImg = computed(() => !!props.src && !imgError.value)`，模板用 showImg',
  },
  {
    file: /^login\/login\.vue$/,
    name: 'internalError',
    reason: '经 displayError computed 消费：`props.error || internalError.value`，模板用 displayError',
  },
  {
    file: /^login\/forgot-[^/]*\.vue$/,
    name: 'internalError',
    reason: '经 displayError computed 消费（同 login.vue 形态）',
  },
  {
    file: /^login\/portal_login\.vue$/,
    name: 'internalError',
    reason: '经 displayError computed 消费（同 login.vue 形态）',
  },
  {
    file: /^login\/register\.vue$/,
    name: 'internalError',
    reason: '经 displayError computed 消费（同 login.vue 形态）',
  },
]

function walkVue(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkVue(p, out)
    else if (name.endsWith('.vue')) out.push(p)
  }
  return out
}

/** 返回此文件里"被赋值、但模板从未提及"的错误状态名 */
function silentStates(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const tplStart = text.indexOf('<template')
  const tplEnd = text.lastIndexOf('</template>')
  if (tplStart < 0 || tplEnd <= tplStart) return [] // 无模板（纯逻辑组件）不参与
  const template = text.slice(tplStart, tplEnd)
  const script = text.slice(0, tplStart) + text.slice(tplEnd + '</template>'.length)

  const declared = new Set<string>()
  for (const m of script.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*(?:ref|shallowRef|computed)\s*[(<]/g)) declared.add(m[1])
  const assigned = new Set<string>()
  for (const m of script.matchAll(/\b([A-Za-z_$][\w$]*)\.value\s*=/g)) assigned.add(m[1])

  const out: string[] = []
  for (const name of declared) {
    if (!STATE_NAME.test(name) || !assigned.has(name)) continue
    if (new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`).test(template)) continue
    out.push(name)
  }
  return out
}

describe('棘轮：错误状态不能被「写了没人看」', () => {
  it('候选集与分诊清单完全一致（清单外的新候选 → 红；清单里过期的 → 也红）', () => {
    const files = walkVue(SRC)
    expect(files.length, '扫描到的 .vue 文件数异常少 —— 先怀疑 walker 坏了，别急着判绿').toBeGreaterThan(
      MIN_VUE_FILES,
    )

    const found: Array<{ rel: string; name: string }> = []
    for (const file of files) {
      const rel = relative(SRC, file).split(sep).join('/')
      for (const name of silentStates(file)) found.push({ rel, name })
    }

    const matched = new Set<number>() // REVIEWED 命中下标
    const unreviewed: string[] = []
    for (const c of found) {
      const idx = REVIEWED.findIndex((r) => r.file.test(c.rel) && r.name === c.name)
      if (idx >= 0) matched.add(idx)
      else unreviewed.push(`${c.rel}::${c.name}`)
    }
    // 反向：清单里每条都必须命中至少一个候选，否则说明代码变了、理由过期
    const stale = REVIEWED.map((r, i) => ({ r, i }))
      .filter(({ i }) => !matched.has(i))
      .map(({ r }) => `${r.file.source}::${r.name}`)

    expect(
      unreviewed.sort(),
      `发现「错误状态被赋值、模板从不渲染」的新候选（用户会看不到错误）：\n  ${unreviewed
        .sort()
        .join('\n  ')}\n处理：真缺陷 → 修（把状态渲染出来）；经 computed 间接消费 → 写进本文件的 REVIEWED 并说明理由`,
    ).toEqual([])
    expect(
      stale.sort(),
      `REVIEWED 里这些条目已不再命中任何候选（代码变了，理由可能过期，请重审后删除）：\n  ${stale
        .sort()
        .join('\n  ')}`,
    ).toEqual([])
    expect(matched.size, '分诊清单至少要覆盖到已登记的 5 条').toBeGreaterThanOrEqual(5)
  })
})
