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
import { FormDesigner, FormBuilder, toFormSchema } from '@/components/form-builder'
import type { DesignerNode, FormMeta } from '@/components/form-builder/designer/types'

/** 设计节点树（设计器的产出） */
const nodes = ref<DesignerNode[]>([])
/** 表单元信息（标题/描述等） */
const meta = ref<FormMeta>({ title: '未命名表单' })

/**
 * 设计数据 → FormSchema。**用库自带的 `toFormSchema`，不要手写。**
 *
 * ## 为什么这条注释必须留着（我踩过）
 *
 * 第一版我在这里手写了一个 `nodes.filter(n => n.key).map(...)` ——
 * 看起来"就是把字段挑出来"，但漏掉了三件 `toFormSchema` 已经处理好的事：
 *
 * ① **容器结构**：手写 map 是扁平的，`card/tabs/collapse/steps` 里的字段
 *    会全部平铺到顶层，分组和切页全丢。`toFormSchema` 递归遍历并给每个字段
 *    带上 `container` 归属信息（`flattenWithContainer`）。
 * ② **布局/展示节点判定**：哪些 type 是纯展示（divider/title/image/progress…）
 *    必须走字段注册表 `isLayoutField()`，不能硬编码类型名列表 ——
 *    硬编码的状态是"以后每新增一个展示类型就静默错一次"。
 * ③ **缺 key 的兜底**：外部导入的 schema 可能没有 key，`toFormSchema` 会
 *    退化用节点 id 并 `reportWarn` 出声；手写 filter 会把这些字段**直接丢掉且不提示**
 *    （表现为"导入后字段凭空消失"）。
 *
 * 结论：**这层转换是库的公开能力（`@/components/form-builder` 导出），
 * 业务侧不该自己再写一遍。**
 */
const renderSchema = computed(() => toFormSchema(nodes.value, meta.value))

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
