<script setup lang="ts">
// FormRenderer 富文本专项演示 — 受控 contenteditable（IME 合成安全）+ 实时 modelValue 回显
// 配套审计 §19 富文本专项：输入/合成/粘贴三条路径的行为可在真实浏览器中直接观察
// 2026-09 full 档：simple / full（文章编辑）两档对照 + 最小字数联动
import { ref } from 'vue'
import { FormRenderer } from '@/components/form-builder'

const simpleValue = ref('<p>默认正文，可直接编辑</p>')
const fullValue = ref('<h1>文章标题</h1><p>这里用 full 工具栏写作：标题、引用、代码块、插图、表格一应俱全。</p>')
const minChars = 20
</script>

<template>
  <div class="fr-demo">
    <h2>FormRenderer · 富文本字段</h2>
    <p class="fr-demo-tip">
      simple 档输入文字验证同步；切换中文输入法验证候选不中断；粘贴富文本验证自动消毒。full
      档面向发文场景：标题/引用/代码块/对齐/颜色/链接/插图/表格 + 字数/预览/全屏。
    </p>
    <FormRenderer
      v-model="simpleValue"
      :field="{ type: 'richtext', key: 'intro', label: '正文（simple 档）', props: {} }"
    />
    <div class="fr-demo-value">
      <strong>simple modelValue：</strong>
      <code>{{ simpleValue }}</code>
    </div>
    <FormRenderer
      v-model="fullValue"
      :field="{
        type: 'richtext',
        key: 'article',
        label: `正文（full 档，最少 ${minChars} 字）`,
        props: { richtextToolbar: 'full', richtextMinChars: minChars },
      }"
    />
    <div class="fr-demo-value">
      <strong>full modelValue：</strong>
      <code>{{ fullValue }}</code>
    </div>
  </div>
</template>

<style scoped>
.fr-demo {
  display: grid;
  gap: var(--space-3);
}
.fr-demo-tip {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted, #94a3b8);
}
.fr-demo-value {
  padding: var(--space-2);
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: 6px;
  font-size: 12px;
  word-break: break-all;
}
</style>
