<script setup lang="ts">
/**
 * PropsPanel 容器节点专属区 — 容器类型展示 + grid/flex/tabs/collapse/steps 配置。
 * 拆分自 PropsPanel 基本页（超 800 行整改）；仅容器节点渲染，编辑经 update patch 上抛。
 */
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useT } from '@/components/_internal/i18n'
import { getTypeLabel, type DesignerNode } from './types'

const t = useT()

defineProps<{ node: DesignerNode }>()
const emit = defineEmits<{ update: [patch: Partial<DesignerNode>] }>()
</script>

<template>
  <div class="ldp-prop">
    <label>{{ t('fbp.containerType') }}</label>
    <div class="ldp-type-readonly">
      <IconSvg type="layout-template" size="xs" />
      {{ getTypeLabel(node.type) }}
    </div>
  </div>

  <!-- grid 容器：列数 -->
  <template v-if="node.type === 'grid'">
    <div class="ldp-section-title">{{ t('fbp.sectionGrid') }}</div>
    <div class="ldp-prop">
      <label>{{ t('fbp.columns') }}</label>
      <Select
        :model-value="node.containerConfig?.columns ?? 2"
        :options="[
          { value: 2, label: t('fbp.col2') },
          { value: 3, label: t('fbp.col3') },
          { value: 4, label: t('fbp.col4') },
        ]"
        @update:model-value="emit('update', { containerConfig: { ...node.containerConfig, columns: Number($event) } })"
      />
    </div>
  </template>

  <!-- flex 容器：间距/换行/对齐 -->
  <template v-if="node.type === 'flex'">
    <div class="ldp-section-title">{{ t('fbp.sectionFlex') }}</div>
    <div class="ldp-prop">
      <label>{{ t('fbp.flexGap') }}</label>
      <Select
        :model-value="node.containerConfig?.gap ?? 12"
        :options="[
          { value: 4, label: '4px' },
          { value: 8, label: '8px' },
          { value: 12, label: '12px' },
          { value: 16, label: '16px' },
          { value: 24, label: '24px' },
        ]"
        @update:model-value="emit('update', { containerConfig: { ...node.containerConfig, gap: Number($event) } })"
      />
    </div>
    <div class="ldp-prop ldp-prop-switch">
      <label>{{ t('fbp.flexWrap') }}</label>
      <Group
        type="switch"
        :model-value="node.containerConfig?.wrap !== false"
        @update:model-value="emit('update', { containerConfig: { ...node.containerConfig, wrap: !!$event } })"
      />
    </div>
    <div class="ldp-prop">
      <label>{{ t('fbp.flexJustify') }}</label>
      <Select
        :model-value="node.containerConfig?.justify ?? 'start'"
        :options="[
          { value: 'start', label: t('fbp.justifyStart') },
          { value: 'center', label: t('fbp.justifyCenter') },
          { value: 'space-between', label: t('fbp.justifyBetween') },
        ]"
        @update:model-value="
          emit('update', {
            containerConfig: {
              ...node.containerConfig,
              justify: String($event) as 'start' | 'center' | 'space-between',
            },
          })
        "
      />
    </div>
  </template>

  <!-- tabs 容器：标签页列表 -->
  <template v-if="node.type === 'tabs'">
    <div class="ldp-section-title">{{ t('fbp.sectionTabs') }}</div>
    <div class="ldp-prop">
      <label>{{ t('fbp.tabsList') }}</label>
      <textarea
        class="ldp-options-editor"
        :value="(node.containerConfig?.tabs ?? []).map((t) => t.label).join('\n')"
        :placeholder="t('fbp.tabsPh')"
        rows="4"
        @input="
          emit('update', {
            containerConfig: {
              ...node.containerConfig,
              tabs: ($event.target as HTMLTextAreaElement).value
                .split('\n')
                .filter(Boolean)
                .map((label, i) => ({ label, name: 'tab' + (i + 1) })),
            },
          })
        "
      />
    </div>
  </template>

  <!-- collapse 容器：折叠项列表 -->
  <template v-if="node.type === 'collapse'">
    <div class="ldp-section-title">{{ t('fbp.sectionCollapse') }}</div>
    <div class="ldp-prop">
      <label>{{ t('fbp.collapseList') }}</label>
      <textarea
        class="ldp-options-editor"
        :value="(node.containerConfig?.collapseItems ?? []).map((c) => c.title).join('\n')"
        :placeholder="t('fbp.collapsePh')"
        rows="4"
        @input="
          emit('update', {
            containerConfig: {
              ...node.containerConfig,
              collapseItems: ($event.target as HTMLTextAreaElement).value
                .split('\n')
                .filter(Boolean)
                .map((title) => ({ title, expanded: true })),
            },
          })
        "
      />
    </div>
  </template>

  <!-- steps 容器：步骤列表 -->
  <template v-if="node.type === 'steps'">
    <div class="ldp-section-title">{{ t('fbp.sectionSteps') }}</div>
    <div class="ldp-prop">
      <label>{{ t('fbp.stepsList') }}</label>
      <textarea
        class="ldp-options-editor"
        :value="(node.containerConfig?.steps ?? []).map((s) => s.title).join('\n')"
        :placeholder="t('fbp.stepsPh')"
        rows="4"
        @input="
          emit('update', {
            containerConfig: {
              ...node.containerConfig,
              steps: ($event.target as HTMLTextAreaElement).value
                .split('\n')
                .filter(Boolean)
                .map((title) => ({ title })),
            },
          })
        "
      />
    </div>
  </template>
</template>
