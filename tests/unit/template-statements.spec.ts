/**
 * 模板表达式可编译性判据的自测（#384 建， #385 第四版）
 *
 * ## 它守的是什么
 *
 * #383：`@click="a = ''; b = ''"` 在 Vite 编译期 Internal server error，
 * vue-tsc 不查、快链无 e2e —— 判据在编译失败前拦下。
 *
 * ## 第四版为什么有"编译器"两组用例
 *
 * #385 实测：启发式只认**赋值行**，所以
 *   · `@click="close()\nreset()"`（两条调用语句）
 *   · `{{ a = 1; b = 2 }}`（插值里的多语句）
 * 都被静默漏检，而它们在 Vite 里同样会炸。第四版让 Vue 编译器做权威判定，
 * 这两组用例就是那条漏检路径的回归锁；同时**必须**有"合法形态不误报"的对照，
 * 否则判据会变成让所有人加豁免的噪音源。
 */
import { describe, it, expect, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  findCompileErrors,
  findMultiStatementAttrs,
  check,
} from '../../scripts/template-statements.mjs'

const TMP = resolve('tests/.tmp/template-statements')
const TMP_COMPILE = resolve('tests/.tmp/template-statements-compile')

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
  rmSync(TMP_COMPILE, { recursive: true, force: true })
})

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

  it('**两条调用语句必须报**（#385：启发式只认赋值行，这条路径曾静默漏检）', () => {
    const src = '<template><A @click="close()\nreset()" /></template>'
    // 启发式的已知盲区：两条 call 语句、没有 `;`、也没有赋值行
    expect(findMultiStatementAttrs(src)).toEqual([])
    // 编译器判据必须接住它
    const errors = findCompileErrors(src)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].kind).toBe('compile')
  })

  it('**{{ }} 插值里的多语句同样报**（判据此前只扫指令属性，插值整片没扫）', () => {
    const errors = findCompileErrors('<template><p>{{ a = 1; b = 2 }}</p></template>')
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].kind).toBe('compile')
  })

  it('**合法形态一律不误报**（编译器判据一旦误报，人就会堆豁免，棘轮就废了）', () => {
    const legal = [
      '<template><A :field="{\n  a: 1,\n  b: 2\n}" /></template>',
      '<template><A @x="(v) => { a = 1; b = 2 }" /></template>',
      '<template><A @x="async (v) => {\n  await v\n  a = v\n}" /></template>',
      '<template><p :title="`line1\nline2`">x</p></template>',
      '<template><p :title="list\n  .filter(Boolean)\n  .join(\',\')">x</p></template>',
      '<template><p v-if="a > 1 && b < 2">x</p></template>',
      '<template><A @click="submit()" /></template>',
    ]
    for (const src of legal) {
      expect(findCompileErrors(src), src).toEqual([])
    }
  })

  it('**行号映射回 .vue 文件内**（模板不在第 1 行时不能谎报行号）', () => {
    const src = [
      '<script setup lang="ts">',
      'const a = 1',
      '</script>',
      '',
      '<template>',
      '  <p>{{ x = 1; y = 2 }}</p>',
      '</template>',
    ].join('\n')
    const errors = findCompileErrors(src)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].line).toBe(6)
  })

  it('**没有 template 的 .vue 不报**（render 函数组件是合法形态）', () => {
    expect(findCompileErrors('<script setup lang="ts">\nconst a = 1\n</script>')).toEqual([])
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

  it('**check 把编译器判据并进同一份清单**（同一行只报一次，不重复计数）', () => {
    rmSync(TMP_COMPILE, { recursive: true, force: true })
    mkdirSync(TMP_COMPILE, { recursive: true })
    writeFileSync(
      join(TMP_COMPILE, 'CallBad.vue'),
      '<template><A @click="close()\nreset()" /></template>',
    )
    const r = check(TMP_COMPILE)
    expect(r.hits).toHaveLength(1)
    expect(r.hits[0].file).toBe('CallBad.vue')
    expect(r.hits[0].kind).toBe('compile')
  })
})
