<script setup lang="ts">
/**
 * 属性面板·条件组 + 级联选项 — 拆分自 PropsPanel（超 800 行约束整改）
 *
 * 三条件组（显示/必填/禁用，同一「触发字段+匹配值+反向」匹配语义）+
 * 级联选项映射（optionsFrom+optionsMap，承接旧版 DynamicForm 模式）。
 * 受控子组件：node + field-options + update patch emit。
 */
import { computed } from 'vue'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import { useT } from '@/components/_internal/i18n'
import type { DesignerNode } from './types'
import { getFieldDefaults } from '../fieldRegistry'

const t = useT()

const props = defineProps<{
  node: DesignerNode
  /** 可选的触发/依赖字段候选（父级 flattenNodes 计算） */
  fieldOptions: { value: string; label: string }[]
}>()

const emit = defineEmits<{
  update: [patch: Partial<DesignerNode>]
}>()

/** Input/Group 值转换 */
function onInputEmit(key: keyof DesignerNode, v: unknown): void {
  const val = v === null ? '' : String(v)
  emit('update', { [key]: val } as Partial<DesignerNode>)
}
function onGroupEmit(key: keyof DesignerNode, v: unknown): void {
  emit('update', { [key]: !!v } as Partial<DesignerNode>)
}

/** 条件组配置：显示 / 必填 / 禁用共用同一套交互（computed：语言切换时重算） */
type WhenKey =
  | 'visibleWhenField'
  | 'visibleWhenValue'
  | 'visibleWhenNot'
  | 'requiredWhenField'
  | 'requiredWhenValue'
  | 'requiredWhenNot'
  | 'disabledWhenField'
  | 'disabledWhenValue'
  | 'disabledWhenNot'

const whenConfigs = computed(() => [
  {
    sectionKey: 'visible',
    title: t('fbp.sectionVisible'),
    ph: t('fbp.triggerFieldPh'),
    fieldKey: 'visibleWhenField' as WhenKey,
    valueKey: 'visibleWhenValue' as WhenKey,
    notKey: 'visibleWhenNot' as WhenKey,
  },
  {
    sectionKey: 'required',
    title: t('fbp.sectionRequiredWhen'),
    ph: t('fbp.requiredWhenPh'),
    fieldKey: 'requiredWhenField' as WhenKey,
    valueKey: 'requiredWhenValue' as WhenKey,
    notKey: 'requiredWhenNot' as WhenKey,
  },
  {
    sectionKey: 'disabled',
    title: t('fbp.sectionDisabledWhen'),
    ph: t('fbp.disabledWhenPh'),
    fieldKey: 'disabledWhenField' as WhenKey,
    valueKey: 'disabledWhenValue' as WhenKey,
    notKey: 'disabledWhenNot' as WhenKey,
  },
])

/** 级联选项适用：字段自身带静态选项编辑（select/radio/checkbox 等） */
const showCascade = computed(() => 'options' in getFieldDefaults(props.node.type))
</script>

<template>
  <!-- 条件组：显示 / 必填 / 禁用（同一匹配语义，作用不同；布局元素不参与） -->
  <template v-if="node.type !== 'divider' && node.type !== 'title'">
    <template v-for="cfg in whenConfigs" :key="cfg.sectionKey">
      <div class="ldp-section-title">{{ cfg.title }}</div>
      <div class="ldp-prop">
        <label>{{ t('fbp.triggerField') }}</label>
        <Select
          :model-value="(node[cfg.fieldKey] as string) ?? ''"
          :options="fieldOptions"
          :placeholder="cfg.ph"
          @update:model-value="
            emit('update', {
              [cfg.fieldKey]: $event === null ? '' : String($event) || undefined,
            } as Partial<DesignerNode>)
          "
        />
      </div>
      <template v-if="node[cfg.fieldKey]">
        <div class="ldp-prop">
          <label>{{ t('fbp.matchValue') }}</label>
          <Input
            :model-value="(node[cfg.valueKey] as string) ?? ''"
            :placeholder="t('fbp.matchValuePh')"
            @update:model-value="onInputEmit(cfg.valueKey, $event)"
          />
        </div>
        <div class="ldp-prop ldp-prop-switch">
          <label>{{ t('fbp.notMatch') }}</label>
          <Group
            type="switch"
            :model-value="!!node[cfg.notKey]"
            @update:model-value="onGroupEmit(cfg.notKey, $event)"
          />
        </div>
      </template>
    </template>
  </template>

  <!-- 级联选项映射：本字段选项由依赖字段值在映射表中查出（承接旧版 optionsFrom+optionsMap） -->
  <template v-if="showCascade && fieldOptions.length">
    <div class="ldp-section-title">{{ t('fbp.sectionCascade') }}</div>
    <div class="ldp-prop">
      <label>{{ t('fbp.cascadeFrom') }}</label>
      <Select
        :model-value="node.optionsFrom ?? ''"
        :options="fieldOptions"
        :placeholder="t('fbp.cascadeFromPh')"
        @update:model-value="emit('update', { optionsFrom: $event === null ? '' : String($event) || undefined })"
      />
    </div>
    <div v-if="node.optionsFrom" class="ldp-prop">
      <label>{{ t('fbp.cascadeMap') }}</label>
      <textarea
        class="ldp-options-editor"
        :value="node.optionsMap ?? ''"
        :placeholder="t('fbp.cascadeMapPh')"
        rows="4"
        @input="onInputEmit('optionsMap', ($event.target as HTMLTextAreaElement).value)"
      />
      <p class="ldp-prop-hint">{{ t('fbp.cascadeMapHint') }}</p>
    </div>
  </template>
</template>
