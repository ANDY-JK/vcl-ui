<script setup lang="ts">
/**
 * 属性面板·v3 高级字段专属属性 — 拆分自 PropsPanel（超 800 行约束整改）
 *
 * subform 列定义 / relate 实体与显示字段 / richtext 工具栏 / signature 尺寸 /
 * address 详细地址开关 / idcard 证件类型 / matrix 行列 / serial 前缀与日期格式。
 * 受控子组件：node + update patch emit（顶层键直写，如 serialPrefix）。
 */
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import { useT } from '@/components/_internal/i18n'
import type { DesignerNode } from './types'

const t = useT()

defineProps<{
  node: DesignerNode
}>()

const emit = defineEmits<{
  update: [patch: Partial<DesignerNode>]
}>()
</script>

<template>
  <!-- ═══ v3 高级字段专属属性 ═══ -->
  <!-- 子表单：列定义 -->
  <template v-if="node.type === 'subform'">
    <div class="ldp-section-title">{{ t('fbp.sectionSubform') }}</div>
    <div class="ldp-prop">
      <label>{{ t('fbp.subformColumns') }}</label>
      <textarea
        class="ldp-options-editor"
        :value="node.subformColumns ?? ''"
        :placeholder="t('fbp.subformColumnsPh')"
        rows="4"
        @input="emit('update', { subformColumns: ($event.target as HTMLTextAreaElement).value })"
      />
      <span class="ldp-prop-hint">{{ t('fbp.subformTypeHint') }}</span>
    </div>
  </template>

  <!-- 关联选择：实体类型 -->
  <template v-if="node.type === 'relate'">
    <div class="ldp-section-title">{{ t('fbp.sectionRelate') }}</div>
    <div class="ldp-prop">
      <label>{{ t('fbp.relateEntity') }}</label>
      <Select
        :model-value="node.relateEntityType ?? 'user'"
        :options="[
          { value: 'user', label: t('fbp.entityUser') },
          { value: 'dept', label: t('fbp.entityDept') },
          { value: 'role', label: t('fbp.entityRole') },
          { value: 'custom', label: t('fbp.entityCustom') },
        ]"
        @update:model-value="emit('update', { relateEntityType: $event as 'user' | 'dept' | 'role' | 'custom' })"
      />
    </div>
  </template>

  <!-- 富文本：工具栏模式 -->
  <template v-if="node.type === 'richtext'">
    <div class="ldp-section-title">{{ t('fbp.sectionRichtext') }}</div>
    <div class="ldp-prop">
      <label>{{ t('fbp.toolbarMode') }}</label>
      <Select
        :model-value="node.richtextToolbar ?? 'simple'"
        :options="[
          { value: 'simple', label: t('fbp.toolbarSimple') },
          { value: 'full', label: t('fbp.toolbarFull') },
        ]"
        @update:model-value="emit('update', { richtextToolbar: $event as 'simple' | 'full' })"
      />
    </div>
  </template>

  <!-- 地址选择：详细地址 -->
  <template v-if="node.type === 'address'">
    <div class="ldp-section-title">{{ t('fbp.sectionAddress') }}</div>
    <div class="ldp-prop ldp-prop-switch">
      <label>{{ t('fbp.addressDetail') }}</label>
      <Group
        type="switch"
        :model-value="!!node.addressDetail"
        @update:model-value="emit('update', { addressDetail: !!$event })"
      />
    </div>
  </template>

  <!-- 证件号码：类型列表 -->
  <template v-if="node.type === 'idcard'">
    <div class="ldp-section-title">{{ t('fbp.sectionIdcard') }}</div>
    <div class="ldp-prop">
      <label>{{ t('fbp.idcardTypes') }}</label>
      <textarea
        class="ldp-options-editor"
        :value="node.idcardTypes ?? t('fb.idType1')"
        :placeholder="t('fbp.idcardTypesPh')"
        rows="4"
        @input="emit('update', { idcardTypes: ($event.target as HTMLTextAreaElement).value })"
      />
      <span class="ldp-prop-hint">{{ t('fbp.idcardHint') }}</span>
    </div>
  </template>

  <!-- 评分矩阵：行/列标题 -->
  <template v-if="node.type === 'matrix'">
    <div class="ldp-section-title">{{ t('fbp.sectionMatrix') }}</div>
    <div class="ldp-prop">
      <label>{{ t('fbp.matrixRows') }}</label>
      <textarea
        class="ldp-options-editor"
        :value="node.matrixRows ?? ''"
        :placeholder="t('fbp.matrixRowsPh')"
        rows="4"
        @input="emit('update', { matrixRows: ($event.target as HTMLTextAreaElement).value })"
      />
    </div>
    <div class="ldp-prop">
      <label>{{ t('fbp.matrixCols') }}</label>
      <textarea
        class="ldp-options-editor"
        :value="node.matrixCols ?? ''"
        :placeholder="t('fbp.matrixColsPh')"
        rows="4"
        @input="emit('update', { matrixCols: ($event.target as HTMLTextAreaElement).value })"
      />
    </div>
  </template>

  <!-- 流水号：前缀/日期格式 -->
  <template v-if="node.type === 'serial'">
    <div class="ldp-section-title">{{ t('fbp.sectionSerial') }}</div>
    <div class="ldp-prop">
      <label>{{ t('fbp.prefix') }}</label>
      <Input
        :model-value="node.serialPrefix ?? ''"
        :placeholder="t('fbp.serialPrefixPh')"
        @update:model-value="emit('update', { serialPrefix: String($event ?? '') })"
      />
    </div>
    <div class="ldp-prop">
      <label>{{ t('fbp.dateFormat') }}</label>
      <Select
        :model-value="node.serialDateFormat ?? 'YYYYMMDD'"
        :options="[
          { value: 'YYYYMMDD', label: t('fbp.dateYMD') },
          { value: 'YYYY', label: t('fbp.dateY') },
          { value: 'YYYYMM', label: t('fbp.dateYM') },
          { value: 'NONE', label: t('fbp.dateNone') },
        ]"
        @update:model-value="emit('update', { serialDateFormat: String($event ?? 'YYYYMMDD') })"
      />
    </div>
  </template>
</template>
