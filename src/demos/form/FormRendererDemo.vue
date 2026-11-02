<script setup lang="ts">
// FormRenderer 富文本专项演示 — 受控 contenteditable（IME 合成安全）+ 实时 modelValue 回显
// 配套审计 §19 富文本专项：输入/合成/粘贴三条路径的行为可在真实浏览器中直接观察
// 2026-09 full 档：simple / full（文章编辑）两档对照 + 最小字数联动
import { ref, computed } from 'vue'
import { FormRenderer } from '@/components/form-builder'

const simpleValue = ref('<p>默认正文，可直接编辑</p>')
const fullValue = ref('<h1>文章标题</h1><p>这里用 full 工具栏写作：标题、引用、代码块、插图、表格一应俱全。</p>')
const minChars = 20

// 提交期校验注入演示（#382）：full 档要求最少字数，提交时父级判并把结果以 :error 注入 ——
// FormRenderer 的 error prop 就是"父级只说得出结果"的通道（rules 是输入期、这里是提交期）
const submitted = ref(false)
const submitError = computed(() =>
  submitted.value && fullValue.value.replace(/<[^>]*>/g, '').trim().length < minChars
    ? `正文不足 ${minChars} 字（当前 ${fullValue.value.replace(/<[^>]*>/g, '').trim().length} 字）`
    : '',
)
function submitArticle() {
  submitted.value = true
}
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
      :error="submitError || undefined"
    />
    <div class="fr-demo-value">
      <strong>full modelValue：</strong>
      <code>{{ fullValue }}</code>
    </div>
    <button
      type="button"
      style="
        justify-self: start;
        padding: calc(6px * var(--vcl-scale)) calc(14px * var(--vcl-scale));
        border: 1px solid var(--vcl-color-border, #e2e8f0);
        border-radius: calc(6px * var(--vcl-scale));
        background: var(--vcl-color-bg, #fff);
        cursor: pointer;
      "
      @click="submitArticle"
    >
      模拟提交（不足 {{ minChars }} 字会在字段上显示提交期错误）
    </button>
  </div>
</template>

<style scoped>
.fr-demo {
  display: grid;
  gap: var(--vcl-space-3);
}
.fr-demo-tip {
  margin: 0;
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-text-muted, #94a3b8);
}
.fr-demo-value {
  padding: var(--vcl-space-2);
  border: 1px dashed var(--vcl-color-border, #e2e8f0);
  border-radius: calc(6px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
  word-break: break-all;
}
</style>
