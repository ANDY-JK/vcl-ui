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
    <!-- 第 131 轮修：这里原本连着渲染了两次同一个标题（拆分自 PropsPanel 时的残留） -->
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
          style="padding: 0; border: none; margin-top: calc(8px * var(--vcl-scale))"
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
          style="padding: 0; border: none; margin-top: calc(8px * var(--vcl-scale))"
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
                    // 第 131 轮修：这里原来重建了整个 onChange，把 targetField 悄悄丢了 ——
                    // 先配了「显隐联动」的目标字段、再切到 callApi 填接口地址，目标字段就没了。
                    ...node.eventConfig?.onChange,
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

    <!--
      onFocus 卡片**已移除**（第 131 轮）。
      原因：运行时 `useFormEvents.handleFieldChange(field, trigger)` 只接受 'change' | 'blur'
      （`FormBuilder.vue` 的四处 @change 与 `FormFieldGroup` 的转发也只派发这两个），
      **没有任何 focus 触发链路**。原先这个开关会把 `eventConfig.onFocus.enabled` 写进 schema，
      `to-schema` 也会导出 `events.onFocus`，但运行时从不读它 —— 用户打开开关、什么都不会发生，
      属于"配了没人读"的死配置。等真的实现 focus 派发时再把卡片加回来（见 TD-35）。
      `FieldEvents.onFocus` 类型保留：手写 schema 仍可声明，不删公开类型。
    -->

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
        @update:model-value="
          emit('update', {
            eventConfig: {
              ...node.eventConfig,
              linkageType: $event as 'none' | 'followValue' | 'followOptions' | 'showHide',
            },
          })
        "
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
                  // 第 131 轮修：原来重建整个 onChange，会把已配好的 apiUrl 抹掉
                  // （先设了 onChange=callApi + 接口地址，再回来配显隐目标，接口地址就没了）。
                  // 目标字段存 onChange.targetField 是引擎契约（to-schema 的 linkage.targetField 从这里取）。
                  ...node.eventConfig?.onChange,
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
