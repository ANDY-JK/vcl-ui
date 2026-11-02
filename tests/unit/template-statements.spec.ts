/**
 * 模板多语句判据的自测（#384）
 *
 * ## 它守的是什么
 *
 * #383：`@click="a = ''; b = ''"` 在 Vite 编译期 Internal server error，
 * vue-tsc 不查、快链无 e2e —— 判据用静态扫描兜住，在编译失败前拦下。
 */
import { describe, it, expect, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { findMultiStatementAttrs, check } from '../../scripts/template-statements.mjs'

const TMP = resolve('tests/.tmp/template-statements')

afterAll(() => rmSync(TMP, { recursive: true, force: true }))

describe('模板多语句判据（template-statements）', () => {
  it('**单语句不报**（大部分模板表达式的形态）', () => {
    expect(findMultiStatementAttrs('<A @click="submit()" />')).toEqual([])
    expect(findMultiStatementAttrs('<A @click="open = !open" />')).toEqual([])
    expect(findMultiStatementAttrs('<A v-if="a > 1 && b < 2" />')).toEqual([])
  })

  it('**多语句连写必须报**（#383 的原始形态）', () => {
    const hits = findMultiStatementAttrs('<A @click="a = 1; b = 2" />')
    expect(hits).toHaveLength(1)
    expect(hits[0].attr).toBe('@click')
  })

  it('**跨行属性值也要报**（#383 实际写法是跨行的）', () => {
    const hits = findMultiStatementAttrs('<A\n  @click="\n    a = 1\n    b = 2\n  "\n/>')
    expect(hits).toHaveLength(1)
  })

  it('**箭头函数体里的多语句是合法的，不能报**（判据第一版误报了 DataTableDemo 两例）', () => {
    const fnValue = '<A @search="\n\
  (v) => {\n\
    a = v\n\
    b = 1\n\
  }\n\
" />'
    expect(findMultiStatementAttrs(fnValue)).toEqual([])
    // 显式分号在函数体内同样合法
    expect(findMultiStatementAttrs('<A @x="(v) => { a = 1; b = 2 }" />')).toEqual([])
    expect(findMultiStatementAttrs('<A @x="function (v) { a = 1; b = 2 }" />')).toEqual([])
  })

  it('**多行对象字面量绑定合法**（:field="{ a: 1, b: 2 }" 跨行，用冒号不是赋值）', () => {
    expect(findMultiStatementAttrs('<A :field="{\n  a: 1,\n  b: 2\n}" />')).toEqual([])
  })

  it('**v- 指令也算**（v-on:click 同样是事件表达式）', () => {
    expect(findMultiStatementAttrs('<A v-on:click="a = 1; b = 2" />')).toHaveLength(1)
  })

  it('**check：扫描 + 豁免双向对账**', () => {
    rmSync(TMP, { recursive: true, force: true })
    mkdirSync(TMP, { recursive: true })
    writeFileSync(join(TMP, 'Good.vue'), '<template><A @click="go()" /></template>')
    writeFileSync(join(TMP, 'Bad.vue'), '<template><A @click="a = 1; b = 2" /></template>')
    const r0 = check(TMP)
    expect(r0.hits).toHaveLength(1)
    expect(r0.scanned).toBe(2)
    // 豁免命中 → 过；但键过期（行号变）→ 报
    const line = r0.hits[0].line
    const r1 = check(TMP, { [`Bad.vue:${line}`]: '历史遗留，待修' })
    expect(r1.hits).toEqual([])
    const r2 = check(TMP, { 'Bad.vue:999': '过期的键' })
    expect(r2.staleExempt).toEqual(['Bad.vue:999'])
  })
})
