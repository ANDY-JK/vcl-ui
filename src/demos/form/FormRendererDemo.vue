<script setup lang="ts">
// FormRenderer 富文本专项演示 — 受控 contenteditable（IME 合成安全）+ 实时 modelValue 回显
// 配套审计 §19 富文本专项：输入/合成/粘贴三条路径的行为可在真实浏览器中直接观察
import { ref } from 'vue'
import { FormRenderer } from '@/components/form-builder'

const richtextValue = ref('<p>默认正文，可直接编辑</p>')
</script>

<template>
  <div class="fr-demo">
    <h3>FormRenderer · 富文本字段</h3>
    <p class="fr-demo-tip">输入文字验证同步；切换中文输入法验证候选不中断；粘贴富文本验证自动消毒。</p>
    <FormRenderer v-model="richtextValue" :field="{ type: 'richtext', key: 'intro', label: '正文', props: {} }" />
    <div class="fr-demo-value">
      <strong>modelValue 实时值：</strong>
      <code>{{ richtextValue }}</code>
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
