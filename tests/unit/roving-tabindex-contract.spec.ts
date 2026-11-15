// @vitest-environment node
/**
 * `useRovingTabindex` 的**接入契约**判据（#510）
 *
 * ## 为什么需要
 *
 * 这个 composable 的 docblock 只写了"两条规矩"（同一时刻只有一个 Tab 停靠点、方向键移动焦点），
 * **没写"怎么接"**。于是第四个调用方（`Carousel`，见 §9.89 / #509）凭直觉接错了两条：
 * 把 keydown 挂在每个项上、并且完全没写 `data-roving-key` —— 结果方向键只推进内部停靠点，
 * 真实焦点一动不动，用户按右键毫无反应。
 *
 * 判据比散文可靠：**接入方式可以机械检查**，就别只写在注释里。
 *
 * ## 两条判据
 *
 * A. 凡 import 了 `useRovingTabindex` 的 .vue，模板里必须出现 `data-roving-key`
 *    —— 它是 composable 内部 `querySelector('[data-roving-key="…"]')` 找目标用的标记。
 * B. 该文件里**带 v-for 的元素不能同时挂 `@keydown`** —— 处理器要挂在容器上，
 *    因为 composable 用 `e.currentTarget` 当搜索范围；挂在项上就只搜自己，查到 null。
 *
 * 例外：把 v-for 写在 `<template v-for>` 上、keydown 挂在里层元素，是**合法**的容器写法
 * （`<template>` 不渲染成元素），所以判据只查"同一个开标签里同时有 v-for 与 @keydown"。
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const VUE_FILES = (() => {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.vue')) out.push(p)
    }
  }
  walk('src/components')
  return out
})()

interface Violation {
  file: string
  rule: 'A-no-roving-key' | 'B-keydown-on-item'
  detail: string
}

/**
 * 取 SFC 的**根模板块**（`<template>` … 配对的 `</template>`）—— 只看模板块，脚本注释不算数。
 *
 * ⚠️ 必须按嵌配对数，不能"第一个 `</template>`"收口：组件里常用 `<template v-if>` /
 * `<template v-for>` 这种**零渲染包装层**，它们自己的 `</template>` 比根的早出现
 * （`Carousel` 就有一个包箭头的 `<template v-if>`）—— 拿第一个闭合标签当终点会把
 * 根模板截短，后面的属性全部漏检（#510 自检踩到的第二个坑）。
 */
function templateBlock(src: string): string {
  const start = src.indexOf('<template')
  if (start < 0) return ''
  const re = /<(\/?)template[\s>]/g
  re.lastIndex = start
  let depth = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    depth += m[1] ? -1 : 1
    if (depth === 0) return src.slice(start, re.lastIndex)
  }
  return src.slice(start)
}

/** 抓模板里的开标签（属性里可能出现换行，`[^>]` 覆盖） */
function openingTags(src: string): Array<{ tag: string; attrs: string }> {
  const tpl = templateBlock(src)
  const out: Array<{ tag: string; attrs: string }> = []
  const re = /<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tpl))) out.push({ tag: m[1]!.toLowerCase(), attrs: m[2] ?? '' })
  return out
}

/** 判据本体：返回违规清单（抽成纯函数，便于用坏样例自检） */
export function scanRovingContract(file: string, src: string): Violation[] {
  if (!/useRovingTabindex/.test(src)) return []
  const out: Violation[] = []
  const tags = openingTags(src)
  // ⚠️ 判据 A 只看**模板块**：如果只搜整份源码，脚本注释里出现的 `data-roving-key`
  // 字样就能顶替真正的属性（#510 自检里就踩到过：Carousel 的说明注释里正好写着这个词）。
  const tpl = templateBlock(src)
  if (!/data-roving-key/.test(tpl)) {
    out.push({ file, rule: 'A-no-roving-key', detail: '模板里没有 data-roving-key' })
  }
  for (const t of tags) {
    const hasKeydown = /@keydown/.test(t.attrs)
    const hasVFor = /\bv-for\b/.test(t.attrs)
    if (hasKeydown && hasVFor) {
      out.push({
        file,
        rule: 'B-keydown-on-item',
        detail: `<${t.tag}> 同时有 v-for 与 @keydown（处理器必须在容器上）`,
      })
    }
  }
  return out
}

describe('useRovingTabindex 接入契约（#510）', () => {
  it('每个使用者都满足两条判据（有 data-roving-key、keydown 不在 v-for 项上）', () => {
    const violations: Violation[] = []
    for (const f of VUE_FILES) violations.push(...scanRovingContract(f, readFileSync(f, 'utf8')))
    const detail = violations.map((v) => `${v.file}  [${v.rule}] ${v.detail}`).join('\n  ')
    expect(violations, `接入契约违规：\n  ${detail}`).toEqual([])
  })

  it('**判据自检：扫描器必须真的扫到使用者**（防"零迭代恒绿"）', () => {
    const users = VUE_FILES.filter((f) => /useRovingTabindex/.test(readFileSync(f, 'utf8')))
    expect(users.length, `至少应扫到几个使用者，实际 ${users.length}：\n  ${users.join('\n  ')}`).toBeGreaterThanOrEqual(4)
  })

  it('**判据自检：坏样例必须被两条判据分别抓到**', () => {
    // ① 没写 data-roving-key（Carousel 修前的样子）
    const noKey = `<template>
      <div class="dots" role="tablist" @keydown="dotRoving.onKeydown($event)">
        <button v-for="i in total" :tabindex="dotRoving.tabindexFor(i - 1)" />
      </div>
    </template>`
    expect(scanRovingContract('bad-a.vue', `${noKey}\n<script setup>useRovingTabindex({})</script>`)).toEqual([
      expect.objectContaining({ rule: 'A-no-roving-key' }),
    ])

    // ② keydown 挂在带 v-for 的元素上（Carousel 修前的另一条）
    const onItem = `<template>
      <div class="dots" role="tablist">
        <button v-for="i in total" :data-roving-key="String(i - 1)" @keydown="dotRoving.onKeydown($event)" />
      </div>
    </template>`
    expect(scanRovingContract('bad-b.vue', `${onItem}\n<script setup>useRovingTabindex({})</script>`)).toEqual([
      expect.objectContaining({ rule: 'B-keydown-on-item' }),
    ])

    // ③ 合规样例（<template v-for> 上的 v-for 不算项）
    const ok = `<template>
      <div role="tablist" @keydown="roving.onKeydown($event)">
        <template v-for="k in keys" :key="k">
          <button :data-roving-key="String(k)" />
        </template>
      </div>
    </template>`
    expect(scanRovingContract('ok.vue', `${ok}\n<script setup>useRovingTabindex({})</script>`)).toEqual([])

    // ④ 不相关的文件不被误报
    expect(scanRovingContract('other.vue', '<template><div @keydown="x" v-for="i in 3" /></template>')).toEqual([])

    // ⑤ **注释不算数**：`data-roving-key` 只出现在脚本注释里（模板里没有）必须仍被判违规
    const inCommentOnly = `<template>
      <div role="tablist" @keydown="roving.onKeydown($event)">
        <button v-for="i in total" :tabindex="roving.tabindexFor(i - 1)" />
      </div>
    </template>
    <script setup>
      // 每个项要有 data-roving-key —— 它就是被 querySelector 找的标记
      useRovingTabindex({})
    </script>`
    expect(scanRovingContract('bad-c.vue', inCommentOnly)).toEqual([
      expect.objectContaining({ rule: 'A-no-roving-key' }),
    ])

    // ⑥ **嵌套包装层不能截短根模板**：`</template>` 按嵌配对收口，
    //    否则 `<template v-if>` 的闭合标签会把根模板截断、后半段的属性全漏检。
    const withInnerTemplate = `<template>
      <div class="carousel">
        <template v-if="arrows">
          <button class="arrow" />
        </template>
        <div class="dots" role="tablist" @keydown="roving.onKeydown($event)">
          <button v-for="i in total" :data-roving-key="String(i - 1)" />
        </div>
      </div>
    </template>
    <script setup>useRovingTabindex({})</script>`
    expect(scanRovingContract('ok-nested.vue', withInnerTemplate)).toEqual([])
  })
})
