<script setup lang="ts">
/**
 * FormRenderer / DynamicForm 兼容演示
 *
 * 承接旧版 DynamicForm 动态表单的「简单配置生成」模式：
 * 传 fields（输入框）+ uploads（上传区）两个配置数组，就渲染出整个动态表单，
 * 无需任何页面代码。适配层 toDynamicFormSchema 把旧版配置转成新版 FormSchema，
 * 由 FormBuilder 渲染（输入框 + 上传分组卡片）。
 */
import { ref } from 'vue'
import { FormBuilder, toDynamicFormSchema } from '@/components/form-builder'
import type { DynamicFormConfig } from '@/components/form-builder'

/** 旧版 DynamicForm 风格配置：几个输入框 + 几个上传区，几行就出表单 */
const dynamicCfg: DynamicFormConfig = {
  title: '门店提报（简单配置）',
  description: '写配置就出表单：fields 生成输入框，uploads 生成上传区（按 group 分组卡片）',
  submitText: '提交',
  fields: [
    { key: 'store_name', label: '门店名称', type: 'text', required: true, placeholder: '请输入门店名称' },
    {
      key: 'store_type',
      label: '门店类型',
      type: 'select',
      required: true,
      options: ['项目店', '大盘店'],
      placeholder: '选择类型',
    },
    { key: 'store_length', label: '门店长（米）', type: 'number', props: { stepper: false, min: 0 } },
    { key: 'store_width', label: '门店宽（米）', type: 'number', props: { stepper: false, min: 0 } },
    {
      key: 'store_area',
      label: '门店面积',
      type: 'text',
      readonly: true,
      hint: '长 × 宽 自动算出（公式联动）',
      // 旧版 compute 公式字段 → linkage.followValue
      props: {},
    },
    { key: 'start_date', label: '开始日期', type: 'date', props: { format: 'YYYY-MM-DD' } },
    { key: 'remark', label: '备注', type: 'textarea', placeholder: '其他说明', span: 24, props: { rows: 2 } },
  ],
  uploads: [
    // 上传区：同 group 分组卡片（旧版 folder）
    { key: 'door_photo', label: '门头照', group: '照片' },
    { key: 'indoor_photo', label: '店内照', group: '照片' },
    { key: 'license_photo', label: '营业执照', group: '证件' },
    { key: 'id_photo', label: '身份证', group: '证件' },
  ],
}

/** 通过适配层生成新版 schema，交给 FormBuilder 渲染 */
const schema = toDynamicFormSchema(dynamicCfg)

// 公式联动：面积 = 长 × 宽（在生成的 schema 上补 linkage）
schema.fields.find((f) => f.key === 'store_area')!.linkage = {
  type: 'followValue',
  formula: '{{store_length}} * {{store_width}}',
  dependsOn: ['store_length', 'store_width'],
}

const formData = ref<Record<string, unknown>>({})

function onChanged(v: Record<string, unknown>): void {
  formData.value = v
}

/** 配置源码（展示用） */
const cfgSource = `const dynamicCfg = {
  title: '门店提报（简单配置）',
  fields: [
    { key: 'store_name', label: '门店名称', type: 'text', required: true },
    { key: 'store_type', label: '门店类型', type: 'select',
      options: ['项目店', '大盘店'] },
    { key: 'store_length', label: '门店长（米）', type: 'number' },
    { key: 'store_width', label: '门店宽（米）', type: 'number' },
    { key: 'start_date', label: '开始日期', type: 'date' },
  ],
  uploads: [
    { key: 'door_photo', label: '门头照', group: '照片' },
    { key: 'license_photo', label: '营业执照', group: '证件' },
  ],
}
const schema = toDynamicFormSchema(dynamicCfg)
// 公式联动（旧版 compute）
schema.fields.find(f => f.key === 'store_area').linkage =
  { type: 'followValue', formula: '{{store_length}} * {{store_width}}' }
// <FormBuilder :schema="schema" v-model="formData" />`
</script>

<template>
  <div class="fr-demo">
    <h3>DynamicForm 兼容 · 简单配置生成</h3>
    <p class="fr-demo-tip">
      承接旧版 DynamicForm「写配置就出表单」：<code>fields</code> 生成输入框， <code>uploads</code> 生成上传区（按 group
      分组卡片），几行配置无需页面代码。
    </p>

    <!-- 动态表单（配置驱动渲染） -->
    <div class="fr-demo-form">
      <FormBuilder v-model="formData" :schema="schema" @change="onChanged" />
    </div>

    <!-- 配置源码 -->
    <details class="fr-demo-code">
      <summary>查看配置源码（几行即出表单）</summary>
      <pre><code>{{ cfgSource }}</code></pre>
    </details>

    <!-- 实时值 -->
    <div class="fr-demo-value">
      <strong>modelValue：</strong>
      <code>{{ JSON.stringify(formData) }}</code>
    </div>
  </div>
</template>

<style scoped>
.fr-demo {
  display: grid;
  gap: var(--space-3);
  max-width: 820px;
  margin: 0 auto;
}
.fr-demo-tip {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted, #94a3b8);
  line-height: 1.6;
}
.fr-demo-tip code {
  background: var(--color-bg-alt);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
}
.fr-demo-form {
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  padding: 16px;
}
.fr-demo-code {
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: 6px;
  padding: 8px 12px;
}
.fr-demo-code summary {
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-secondary);
}
.fr-demo-code pre {
  margin: 8px 0 0;
  padding: 10px;
  background: var(--color-bg-alt, #f8fafc);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre;
}
.fr-demo-value {
  padding: var(--space-2);
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: 6px;
  font-size: 12px;
  word-break: break-all;
}
</style>
