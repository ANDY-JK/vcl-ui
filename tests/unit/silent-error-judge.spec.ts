/**
 * 「错误状态写了却没人看」判据的自测（#372 / TD-26）
 *
 * ## 原判据的洞
 *
 * 只问"名字在 `<template>` 里出现过吗" —— 于是三种写法都能绕过：
 *   · `<p v-if="false">{{ errMsg }}</p>`  常量假条件
 *   · `<p v-show="false">{{ errMsg }}</p>` 永远 display:none
 *   · `<!-- {{ errMsg }} -->`             注释里
 *
 * 棘轮的语义是「**用户能不能看到**这条错误」——"出现过"不等于"看得见"。
 * 本用例把这三条钉死；同时钉住"不能把正常写法误判成静默"（误报会让棘轮被豁免堆死）。
 */
import { describe, it, expect } from 'vitest'
import { silentStatesOf } from '../../scripts/silent-error-judge.mjs'

/** 生成一个最小 .vue：script 里赋值 errMsg，模板由调用方给 */
const vue = (tpl: string) => `<script setup lang="ts">
import { ref } from 'vue'
const errMsg = ref('')
function boom() {
  errMsg.value = '失败'
}
</script>

<template>
  <div>${tpl}</div>
</template>
`

describe('静默错误判据（silent-error-judge）', () => {
  it('**正常渲染时不报**（不能把好代码判成静默）', () => {
    expect(silentStatesOf(vue('<p>{{ errMsg }}</p>'))).toEqual([])
  })

  it('**模板完全没用它 → 必须报**（这是棘轮原本能抓的形态）', () => {
    expect(silentStatesOf(vue('<p>正常内容</p>'))).toEqual(['errMsg'])
  })

  it('**`v-if="false"` 包裹时必须报**（写了但永远不渲染）', () => {
    expect(silentStatesOf(vue('<p v-if="false">{{ errMsg }}</p>'))).toEqual(['errMsg'])
  })

  it('**`v-show="false"` 包裹时必须报**（渲染了但永远不可见）', () => {
    expect(silentStatesOf(vue('<p v-show="false">{{ errMsg }}</p>'))).toEqual(['errMsg'])
  })

  it('**只在 HTML 注释里出现必须报**', () => {
    expect(silentStatesOf(vue('<!-- {{ errMsg }} -->'))).toEqual(['errMsg'])
  })

  it('**嵌套在常量假里的深层节点也要报**', () => {
    expect(silentStatesOf(vue('<section v-if="false"><div><p>{{ errMsg }}</p></div></section>'))).toEqual([
      'errMsg',
    ])
  })

  it('**动态条件不判**（业务逻辑静态判不了，宁可漏也不误报）', () => {
    expect(silentStatesOf(vue('<p v-if="loading">{{ errMsg }}</p>'))).toEqual([])
  })

  it('**假分支之外另有真实渲染时也必须过**（不能只看到第一处）', () => {
    expect(silentStatesOf(vue('<p v-if="false">{{ errMsg }}</p><p>{{ errMsg }}</p>'))).toEqual([])
  })

  it('**无模板的纯逻辑组件不参与**', () => {
    expect(silentStatesOf("<script setup lang=\"ts\">\nconst errMsg = ref('')\nerrMsg.value = 'x'\n</script>\n")).toEqual(
      [],
    )
  })
})
