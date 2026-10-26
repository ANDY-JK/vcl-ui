<script setup lang="ts">
/**
 * 属性面板·校验规则页 — 拆分自 PropsPanel（超 800 行约束整改）
 *
 * 必填设置 + 内置校验规则展示 + 自定义正则/trim/unique/realtime + 高级字段专项
 * （richtext 最小字数 / matrix 必填行数 / signature 必签）。
 * 纯受控子组件：node + update patch emit，无本地状态。
 */
import { computed } from 'vue'
import Input from '@/components/form/Input.vue'
import Group from '@/components/form/Group.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useT } from '@/components/_internal/i18n'
import type { DesignerNode } from './types'

const t = useT()

const props = defineProps<{
  node: DesignerNode
}>()

/**
 * 正则是否可用（第 143 轮）。
 *
 * 运行时（`to-schema.ts`）对非法正则是 `try { new RegExp(...) } catch { 跳过 }` ——
 * 也就是说**面板上规则看着是开的、表单实际一条都不校验**。这种"配了没人读"比没配更危险，
 * 因为它让人以为校验生效了。所以在这里即时判一次，把问题摆在配置时而不是上线后。
 */
const patternIssue = computed<'empty' | 'invalid' | null>(() => {
  const raw = props.node.validation?.pattern
  if (!raw) return null // 空 = 没配正则，不是问题
  try {
    new RegExp(raw)
    return null
  } catch {
    return 'invalid'
  }
})

/** 只填了提示语却没填正则：规则不存在，提示语永远不会显示（同 onFocus 那类死配置） */
const orphanPatternMessage = computed(() => !props.node.validation?.pattern && !!props.node.validation?.patternMessage)

const emit = defineEmits<{
  update: [patch: Partial<DesignerNode>]
}>()

/** 内置校验规则列表（computed：语言切换时重算） */
const builtinValidations = computed(() => {
  const v = props.node.validation
  return [
    { name: t('fbp.valMinLen'), value: v?.minLength, key: 'minLength', type: 'number' },
    { name: t('fbp.valMaxLen'), value: v?.maxLength, key: 'maxLength', type: 'number' },
    { name: t('fbp.valPattern'), value: v?.pattern, key: 'pattern', type: 'text' },
    {
      name: t('fbp.valPhone'),
      value: v?.builtinType === 'phone',
      key: 'builtinType',
      type: 'toggle',
      toggleValue: 'phone',
    },
    {
      name: t('fbp.valEmail'),
      value: v?.builtinType === 'email',
      key: 'builtinType',
      type: 'toggle',
      toggleValue: 'email',
    },
    {
      name: t('fbp.valIdcard'),
      value: v?.builtinType === 'idcard',
      key: 'builtinType',
      type: 'toggle',
      toggleValue: 'idcard',
    },
    { name: t('fbp.valUrl'), value: v?.builtinType === 'url', key: 'builtinType', type: 'toggle', toggleValue: 'url' },
  ]
})
</script>

<template>
  <div class="ldp-prop-page">
    <div class="ldp-section-title">{{ t('fbp.sectionRequired') }}</div>
    <div class="ldp-prop ldp-prop-switch">
      <label>{{ t('fbp.requiredField') }}</label>
      <Group
        type="switch"
        :model-value="!!node.required"
        @update:model-value="emit('update', { required: !!$event })"
      />
    </div>
    <div class="ldp-prop">
      <label>{{ t('fbp.requiredMessage') }}</label>
      <Input
        :model-value="node.validation?.requiredMessage ?? ''"
        :placeholder="t('fbp.requiredMessagePh')"
        @update:model-value="
          emit('update', { validation: { ...node.validation, requiredMessage: String($event ?? '') } })
        "
      />
    </div>

    <div class="ldp-section-title">{{ t('fbp.sectionBuiltin') }}</div>
    <div v-for="rule in builtinValidations" :key="rule.key" class="ldp-validation-rule">
      <span class="ldp-rule-icon" :class="{ on: !!rule.value }">
        <IconSvg :type="rule.value ? 'circle-check' : 'circle'" size="xs" />
      </span>
      <span class="ldp-rule-name">{{ rule.name }}</span>
      <span class="ldp-rule-status" :class="rule.value ? 'on' : 'off'">
        {{ rule.value ? t('fbp.enabled') : t('fbp.disabledState') }}
      </span>
    </div>

    <div class="ldp-section-title">{{ t('fbp.sectionCustom') }}</div>
    <div class="ldp-prop" :data-invalid="patternIssue === 'invalid' ? '1' : undefined">
      <label>{{ t('fbp.valPattern') }}</label>
      <Input
        :model-value="node.validation?.pattern ?? ''"
        :placeholder="t('fbp.patternPh')"
        @update:model-value="emit('update', { validation: { ...node.validation, pattern: String($event ?? '') } })"
      />
      <!-- 非法正则：运行时会被静默跳过，必须在这里说清楚，否则用户以为校验生效了 -->
      <span v-if="patternIssue === 'invalid'" class="ldp-prop-hint" role="alert">
        {{ t('fbp.patternInvalidHint') }}
      </span>
    </div>
    <div class="ldp-prop" :data-invalid="orphanPatternMessage ? '1' : undefined">
      <label>{{ t('fbp.patternMessage') }}</label>
      <Input
        :model-value="node.validation?.patternMessage ?? ''"
        :placeholder="t('fbp.patternMessagePh')"
        @update:model-value="
          emit('update', { validation: { ...node.validation, patternMessage: String($event ?? '') } })
        "
      />
      <!-- 有提示语没正则：这条提示永远不会触发（死配置，同 onFocus 那次的口径） -->
      <span v-if="orphanPatternMessage" class="ldp-prop-hint ldp-prop-warn">
        {{ t('fbp.patternMessageOrphanHint') }}
      </span>
    </div>
    <div class="ldp-prop ldp-prop-switch">
      <label>{{ t('fbp.trim') }}</label>
      <Group
        type="switch"
        :model-value="!!node.validation?.trim"
        @update:model-value="emit('update', { validation: { ...node.validation, trim: !!$event } })"
      />
    </div>
    <div class="ldp-prop ldp-prop-switch">
      <label>{{ t('fbp.unique') }}</label>
      <Group
        type="switch"
        :model-value="!!node.validation?.unique"
        @update:model-value="emit('update', { validation: { ...node.validation, unique: !!$event } })"
      />
    </div>
    <div class="ldp-prop ldp-prop-switch">
      <label>{{ t('fbp.realtime') }}</label>
      <Group
        type="switch"
        :model-value="!!node.validation?.realtime"
        @update:model-value="emit('update', { validation: { ...node.validation, realtime: !!$event } })"
      />
    </div>

    <!-- P1-7 高级字段专项校验（按字段类型显示对应配置） -->
    <template v-if="node.type === 'richtext'">
      <div class="ldp-section-title">{{ t('fbp.sectionAdvanced') }}</div>
      <div class="ldp-prop">
        <label>{{ t('fbp.richtextMinChars') }}</label>
        <Input
          type="number"
          :model-value="node.validation?.richtextMinChars ?? ''"
          placeholder="0"
          @update:model-value="
            emit('update', {
              validation: { ...node.validation, richtextMinChars: Number($event) > 0 ? Number($event) : undefined },
            })
          "
        />
      </div>
    </template>

    <template v-if="node.type === 'matrix'">
      <div class="ldp-section-title">{{ t('fbp.sectionAdvanced') }}</div>
      <div class="ldp-prop">
        <label>{{ t('fbp.matrixMinRows') }}</label>
        <Input
          type="number"
          :model-value="node.validation?.matrixMinRows ?? ''"
          placeholder="0"
          @update:model-value="
            emit('update', {
              validation: { ...node.validation, matrixMinRows: Number($event) > 0 ? Number($event) : undefined },
            })
          "
        />
      </div>
    </template>

    <template v-if="node.type === 'signature'">
      <div class="ldp-section-title">{{ t('fbp.sectionAdvanced') }}</div>
      <div class="ldp-prop ldp-prop-switch">
        <label>{{ t('fbp.signatureRequired') }}</label>
        <Group
          type="switch"
          :model-value="!!node.validation?.signatureRequired"
          @update:model-value="emit('update', { validation: { ...node.validation, signatureRequired: !!$event } })"
        />
      </div>
    </template>
  </div>
</template>
