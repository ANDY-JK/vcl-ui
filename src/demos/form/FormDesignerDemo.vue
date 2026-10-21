<script setup lang="ts">
// FormDesigner 低代码设计器演示（2026-10-21，审查 6.3 / 低代码可发现性）
//
// ## 为什么补这个 demo
//
// `FormDesigner.vue` 有 711 行，背后还有 12 个子模块（画布/面板/设置/快捷键/
// 自动保存/草稿/操作栈/删除确认）约 2000 行 —— **但演示站里一个入口都没有**。
// 用户在 `demoMap` 里翻遍 45 个组件路由也看不到它，只能读源码才知道有这个东西。
//
// 一个"期望度最高的功能"配上"零可发现性"，等于没做。
//
// ## 本 demo 演示什么
//
// ① 设计器可独立使用：不注入 `store` 时用它自带的本地存储（localStorage）
// ② `v-model:nodes` / `v-model:meta` 双向绑定 —— 右侧实时显示当前配置 JSON，
//    让用户看清"设计器产出的到底是什么"，这是接入自己后端的起点
// ③ 设计好的表单如何渲染：用 `FormBuilder` 消费同一份 nodes
// ④ 「存储方式」切换 UI：不注入 store 时可见（本地 / 云端），注入后隐藏
import { computed, ref } from 'vue'
import { FormDesigner, FormBuilder } from '@/components/form-builder'
import type { DesignerNode, FormMeta } from '@/components/form-builder/designer/types'

/** 设计节点树（设计器的产出） */
const nodes = ref<DesignerNode[]>([])
/** 表单元信息（标题/描述等） */
const meta = ref<FormMeta>({ title: '未命名表单' })

/**
 * 把设计器 nodes 转成 FormBuilder 能吃的 schema。
 *
 * 这是接入自己业务的**关键一步**，所以在 demo 里显式写出来而不是藏起来：
 * 设计器产出的是"设计态"节点（含画布坐标、面板分组、条件显示等），
 * 渲染态只需要 fields。真实项目里这一步应该在你的后端做一次转换并存库。
 *
 * ⚠️ 注意 `DesignerNode` 是**扁平结构**（`placeholder` / `options` / `min` 直接挂节点上），
 * 不是 `{ props: {...} }` 嵌套 —— 第一版我就写错了，typecheck 当场拦住。
 * 所以这里是逐字段挑选，而不是整体透传：只传渲染需要的，丢掉画布相关的。
 */
const renderSchema = computed(() => ({
  title: meta.value.title,
  description: meta.value.description,
  fields: nodes.value
    // 容器节点（card/grid/flex/tabs/collapse/steps）没有 key，不该当字段渲染
    .filter((n) => !!n.key)
    .map((n) => ({
      key: n.key!,
      type: n.type,
      label: n.label,
      required: n.required,
      placeholder: n.placeholder,
      // options：DesignerNode 是 string[]，FormField 要 Option[]（{label, value}）
      // 这一步转换正是"设计态 → 渲染态"的典型差异，真实项目里应在后端做
      options: n.options?.map((o) => ({ label: o, value: o })),
      defaultValue: n.defaultValue,
      disabled: n.disabled,
      readonly: n.readonly,
      hint: n.hint,
      span: n.span,
    })),
  layout: 'single' as const,
}))

/** 渲染用的表单数据 */
const formData = ref<Record<string, unknown>>({})

/** 只显示 JSON 的前若干字符，避免长配置撑爆页面 */
const configPreview = computed(() => {
  const json = JSON.stringify({ meta: meta.value, nodes: nodes.value }, null, 2)
  return json.length > 2000 ? `${json.slice(0, 2000)}\n…（共 ${json.length} 字符）` : json
})
</script>

<template>
  <div class="fd-demo">
    <!--
      ⚠️ 必须是 h1（不是 h2）：全站 a11y 扫描（tests/e2e/axe-a11y.spec.ts L134）
      用 `h1` 可见作为"demo 页已挂载"的就绪信号。用 h2 会让该路由永远等不到 h1
      而超时 —— 我第一版就是 h2，整链 e2e 因此失败。
      这也是正确的语义：页面主标题本就该是 h1。
    -->
    <h1 class="fd-demo-title">FormDesigner · 低代码表单设计器</h1>
    <p class="fd-demo-tip">
      左侧拖拽/点击添加字段，中间画布排版，右侧改属性。下方实时显示 <strong>设计器产出的 JSON</strong>
      —— 把它存到你的库里，就是一个可复用的表单定义。
      <br />
      接自己后端的路径：设计器产出 JSON → 存你的库 → 渲染端用 <code>FormBuilder</code> 消费同一份 fields。
    </p>

    <FormDesigner v-model:nodes="nodes" v-model:meta="meta" height="560px" />

    <h2 class="fd-demo-sub">① 设计器产出的配置（这就是要存库的东西）</h2>
    <p class="fd-demo-note">
      字段数：<strong>{{ nodes.length }}</strong> · 表单标题：<strong>{{ meta.title }}</strong>
    </p>
    <pre class="fd-demo-json">{{ configPreview }}</pre>

    <h2 class="fd-demo-sub">② 用 FormBuilder 消费同一份配置（就能直接填了）</h2>
    <p class="fd-demo-note">
      下面是把上面 nodes 转成 schema 后渲染的结果。真实项目里这一步转换应该在
      <strong>你的后端</strong>做，前端拿到就已可用。
    </p>
    <div class="fd-demo-render">
      <FormBuilder v-model="formData" :schema="renderSchema" :hide-header="false" />
    </div>
    <p class="fd-demo-note">
      当前填写值：<code>{{ JSON.stringify(formData) }}</code>
    </p>
  </div>
</template>

<style scoped>
/* 尺寸一律走设计令牌或 calc(Npx * var(--vcl-scale)) —— 闸口 check:css-scale 会拦硬编码 px。
   这里用令牌优先（间距/圆角），字号用 calc 缩放（令牌里没有对应字号档）。 */
.fd-demo {
  padding: var(--vcl-space-4);
}
.fd-demo-tip {
  color: var(--vcl-color-text-secondary, #666);
  line-height: 1.7;
  margin-bottom: var(--vcl-space-4);
}
.fd-demo-note {
  color: var(--vcl-color-text-secondary, #666);
  font-size: calc(13px * var(--vcl-scale));
  margin: var(--vcl-space-2) 0;
}
.fd-demo-json {
  max-height: calc(260px * var(--vcl-scale));
  overflow: auto;
  padding: var(--vcl-space-3);
  border-radius: calc(6px * var(--vcl-scale));
  background: var(--vcl-color-fill-quaternary, #f6f8fa);
  border: 1px solid var(--vcl-color-border, #e5e7eb);
  font-size: calc(12px * var(--vcl-scale));
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
.fd-demo-render {
  margin-top: var(--vcl-space-3);
  padding: var(--vcl-space-4);
  border: 1px dashed var(--vcl-color-border, #e5e7eb);
  border-radius: calc(8px * var(--vcl-scale));
}
h2.fd-demo-sub {
  margin-top: var(--vcl-space-6);
  margin-bottom: var(--vcl-space-2);
  font-size: calc(15px * var(--vcl-scale));
}
</style>
