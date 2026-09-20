<script setup lang="ts">
/**
 * 属性面板·事件配置页 — 拆分自 PropsPanel（超 800 行约束整改）
 *
 * onChange/onFocus/onBlur 事件卡片（启停 + 动作选择 + 目标字段/接口地址）+
 * 字段联动（followValue/followOptions/showHide 公式与帮助提示）。
 * 受控子组件：node + field-options（目标字段候选）+ update patch emit。
 */
import { computed } from 'vue'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useT } from '@/components/_internal/i18n'
import type { DesignerNode } from './types'

const t = useT()

const props = defineProps<{
  node: DesignerNode
  /** 可选的目标/触发字段列表（父级 flattenNodes 计算） */
  fieldOptions: { value: string; label: string }[]
}>()

const emit = defineEmits<{
  update: [patch: Partial<DesignerNode>]
}>()

/** 联动公式的 placeholder 文本 */
const linkageFormulaPlaceholder = computed(() => {
  const lt = props.node.eventConfig?.linkageType
  if (lt === 'followValue') return t('fbp.formulaHintValue')
  if (lt === 'showHide') return t('fbp.formulaHintShowHide')
  if (lt === 'followOptions') return t('fbp.formulaHintOptions')
  return ''
})

/** 联动帮助提示文本 */
const linkageHelpText = computed(() => {
  const lt = props.node.eventConfig?.linkageType
  if (lt === 'followValue') return t('fbp.linkageHelpValue')
  if (lt === 'showHide') return t('fbp.linkageHelpShowHide')
  if (lt === 'followOptions') return t('fbp.linkageHelpOptions')
  return ''
})
</script>

<template>
  <div class="ldp-prop-page">
    <div class="ldp-section-title">{{ t('fbp.sectionEvent') }}</div>

    <div class="ldp-section-title">{{ t('fbp.sectionEvent') }}</div>

    <!-- onChange -->
    <div class="ldp-event-card">
      <div class="ldp-event-head">
        <IconSvg type="square-pen" size="xs" class="ldp-event-icon" />
        <span class="ldp-event-label">{{ t('fbp.eventChange') }}</span>
        <div class="ldp-event-toggle">
          <Group
            type="switch"
            :model-value="!!node.eventConfig?.onChange?.enabled"
            @update:model-value="
              emit('update', {
                eventConfig: {
                  ...node.eventConfig,
                  onChange: {
                    enabled: !!$event,
                    action: node.eventConfig?.onChange?.action,
                    targetField: node.eventConfig?.onChange?.targetField,
                    apiUrl: node.eventConfig?.onChange?.apiUrl,
                  },
                },
              })
            "
          />
        </div>
      </div>
      <div v-if="node.eventConfig?.onChange?.enabled" class="ldp-event-body">
        <Select
          :model-value="node.eventConfig?.onChange?.action ?? ''"
          :options="[
            { value: '', label: t('fbp.chooseAction') },
            { value: 'linkField', label: t('fbp.actLinkField') },
            { value: 'callApi', label: t('fbp.actCallApi') },
            { value: 'showTip', label: t('fbp.actShowTip') },
            { value: 'setValue', label: t('fbp.actSetValue') },
            { value: 'toggleVisible', label: t('fbp.actToggleVisible') },
          ]"
          @update:model-value="
            emit('update', {
              eventConfig: {
                ...node.eventConfig,
                onChange: {
                  enabled: true,
                  action: String($event ?? ''),
                  targetField: node.eventConfig?.onChange?.targetField,
                  apiUrl: node.eventConfig?.onChange?.apiUrl,
                },
              },
            })
          "
        />
        <div
          v-if="
            node.eventConfig?.onChange?.action === 'setValue' || node.eventConfig?.onChange?.action === 'toggleVisible'
          "
          class="ldp-prop"
          style="padding: 0; border: none; margin-top: 8px"
        >
          <label>{{ t('fbp.targetField') }}</label>
          <Select
            :model-value="node.eventConfig?.onChange?.targetField ?? ''"
            :options="fieldOptions"
            :placeholder="t('fbp.targetFieldPh')"
            @update:model-value="
              emit('update', {
                eventConfig: {
                  ...node.eventConfig,
                  onChange: {
                    ...node.eventConfig?.onChange,
                    enabled: true,
                    targetField: $event === null ? '' : String($event ?? ''),
                  },
                },
              })
            "
          />
        </div>
        <!-- callApi 需要接口地址 -->
        <div
          v-if="node.eventConfig?.onChange?.action === 'callApi'"
          class="ldp-prop"
          style="padding: 0; border: none; margin-top: 8px"
        >
          <label>{{ t('fbp.apiUrl') }}</label>
          <Input
            :model-value="node.eventConfig?.onChange?.apiUrl ?? ''"
            placeholder="https://api.example.com/xxx"
            @update:model-value="
              emit('update', {
                eventConfig: {
                  ...node.eventConfig,
                  onChange: {
                    enabled: true,
                    action: 'callApi',
                    apiUrl: $event === null ? '' : String($event ?? ''),
                  },
                },
              })
            "
          />
        </div>
      </div>
    </div>

    <!-- onFocus -->
    <div class="ldp-event-card">
      <div class="ldp-event-head">
        <IconSvg type="sun" size="xs" class="ldp-event-icon" />
        <span class="ldp-event-label">{{ t('fbp.eventFocus') }}</span>
        <div class="ldp-event-toggle">
          <Group
            type="switch"
            :model-value="!!node.eventConfig?.onFocus?.enabled"
            @update:model-value="
              emit('update', {
                eventConfig: {
                  ...node.eventConfig,
                  onFocus: { enabled: !!$event, action: node.eventConfig?.onFocus?.action },
                },
              })
            "
          />
        </div>
      </div>
    </div>

    <!-- onBlur -->
    <div class="ldp-event-card">
      <div class="ldp-event-head">
        <IconSvg type="moon" size="xs" class="ldp-event-icon" />
        <span class="ldp-event-label">{{ t('fbp.eventBlur') }}</span>
        <div class="ldp-event-toggle">
          <Group
            type="switch"
            :model-value="!!node.eventConfig?.onBlur?.enabled"
            @update:model-value="
              emit('update', {
                eventConfig: {
                  ...node.eventConfig,
                  onBlur: { enabled: !!$event, action: node.eventConfig?.onBlur?.action },
                },
              })
            "
          />
        </div>
      </div>
      <div v-if="node.eventConfig?.onBlur?.enabled" class="ldp-event-body">
        <Select
          :model-value="node.eventConfig?.onBlur?.action ?? ''"
          :options="[
            { value: '', label: t('fbp.chooseAction') },
            { value: 'autoValidate', label: t('fbp.actAutoValidate') },
            { value: 'format', label: t('fbp.actFormat') },
            { value: 'submit', label: t('fbp.actSubmit') },
          ]"
          @update:model-value="
            emit('update', {
              eventConfig: {
                ...node.eventConfig,
                onBlur: { ...node.eventConfig?.onBlur, enabled: true, action: String($event ?? '') },
              },
            })
          "
        />
      </div>
    </div>

    <div class="ldp-section-title">{{ t('fbp.sectionLinkage') }}</div>
    <div class="ldp-prop">
      <label>{{ t('fbp.linkageType') }}</label>
      <Select
        :model-value="node.eventConfig?.linkageType ?? 'none'"
        :options="[
          { value: 'none', label: t('fbp.linkageNone') },
          { value: 'followValue', label: t('fbp.linkageFollowValue') },
          { value: 'followOptions', label: t('fbp.linkageFollowOptions') },
          { value: 'showHide', label: t('fbp.linkageShowHide') },
        ]"
        @update:model-value="emit('update', { eventConfig: { ...node.eventConfig, linkageType: $event as 'none' | 'followValue' | 'followOptions' | 'showHide' } })"
      />
    </div>
    <template v-if="node.eventConfig?.linkageType && node.eventConfig.linkageType !== 'none'">
      <!-- 显隐联动：选择控制的目标字段 -->
      <div v-if="node.eventConfig.linkageType === 'showHide'" class="ldp-prop">
        <label>{{ t('fbp.targetField') }}</label>
        <Select
          :model-value="node.eventConfig?.onChange?.targetField ?? ''"
          :options="fieldOptions"
          :placeholder="t('fbp.showHideFieldPh')"
          @update:model-value="
            emit('update', {
              eventConfig: {
                ...node.eventConfig,
                onChange: {
                  enabled: true,
                  action: 'toggleVisible',
                  targetField: $event === null ? '' : String($event ?? ''),
                },
              },
            })
          "
        />
      </div>

      <!-- 联动公式 -->
      <div class="ldp-prop">
        <label>{{ t('fbp.linkageFormula') }}</label>
        <Input
          :model-value="node.eventConfig?.linkageFormula ?? ''"
          :placeholder="linkageFormulaPlaceholder"
          @update:model-value="
            emit('update', { eventConfig: { ...node.eventConfig, linkageFormula: String($event ?? '') } })
          "
        />
      </div>

      <!-- 公式帮助提示 -->
      <div class="ldp-linkage-help">
        <IconSvg type="info" size="xs" />
        <span>{{ linkageHelpText }}</span>
      </div>
    </template>
  </div>
</template>
