<script setup lang="ts">
/**
 * 属性面板·数据源页 — 拆分自 PropsPanel（超 800 行约束整改）
 *
 * 默认值类型（固定/公式/当前时间/当前用户）+ 远程数据源卡片（API/联动字段/缓存）+
 * 数据联动 + 提交后清空/持久化。受控子组件：node + field-options + update patch emit。
 */
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import { useT } from '@/components/_internal/i18n'
import type { DesignerNode } from './types'

const t = useT()

defineProps<{
  node: DesignerNode
  /** 可选的联动字段候选（父级 flattenNodes 计算） */
  fieldOptions: { value: string; label: string }[]
}>()

const emit = defineEmits<{
  update: [patch: Partial<DesignerNode>]
}>()
</script>

<template>
  <div class="ldp-prop-page">
    <div class="ldp-section-title">{{ t('fbp.defaultValue') }}</div>
    <div class="ldp-prop">
      <label>{{ t('fbp.defaultType') }}</label>
      <Select
        :model-value="node.dataConfig?.defaultType ?? 'none'"
        :options="[
          { value: 'none', label: t('fbp.none') },
          { value: 'fixed', label: t('fbp.fixed') },
          { value: 'formula', label: t('fbp.formula') },
          { value: 'api', label: t('fbp.apiFetch') },
          { value: 'currentUser', label: t('fbp.currentUser') },
          { value: 'currentTime', label: t('fbp.currentTime') },
        ]"
        @update:model-value="emit('update', { dataConfig: { ...node.dataConfig, defaultType: $event as any } })"
      />
    </div>
    <template v-if="node.dataConfig?.defaultType === 'formula'">
      <div class="ldp-prop">
        <label>{{ t('fbp.defaultFormula') }}</label>
        <Input
          :model-value="node.dataConfig?.defaultFormula ?? ''"
          :placeholder="t('fbp.defaultFormulaPh')"
          @update:model-value="
            emit('update', { dataConfig: { ...node.dataConfig, defaultFormula: String($event ?? '') } })
          "
        />
      </div>
    </template>
    <template v-if="node.dataConfig?.defaultType === 'api'">
      <div class="ldp-prop">
        <label>{{ t('fbp.apiUrl') }}</label>
        <Input
          :model-value="node.dataConfig?.defaultApiUrl ?? ''"
          :placeholder="t('fbp.apiUrlPh')"
          @update:model-value="
            emit('update', { dataConfig: { ...node.dataConfig, defaultApiUrl: String($event ?? '') } })
          "
        />
      </div>
      <div class="ldp-prop">
        <label>{{ t('fbp.defaultApiDataPath') }}</label>
        <Input
          :model-value="node.dataConfig?.defaultApiDataPath ?? ''"
          :placeholder="t('fbp.defaultApiDataPathPh')"
          @update:model-value="
            emit('update', { dataConfig: { ...node.dataConfig, defaultApiDataPath: String($event ?? '') } })
          "
        />
      </div>
    </template>

    <div class="ldp-section-title">{{ t('fbp.sectionRemote') }}</div>
    <div class="ldp-datasource-card">
      <div class="ldp-prop" style="padding: 0; border: none">
        <label>{{ t('fbp.sourceType') }}</label>
        <Select
          :model-value="node.dataConfig?.sourceType ?? 'none'"
          :options="[
            { value: 'none', label: t('fbp.srcNone') },
            { value: 'api', label: t('fbp.srcApi') },
            { value: 'database', label: t('fbp.srcDatabase') },
            { value: 'userList', label: t('fbp.srcUserList') },
            { value: 'deptList', label: t('fbp.srcDeptList') },
          ]"
          @update:model-value="emit('update', { dataConfig: { ...node.dataConfig, sourceType: $event as any } })"
        />
      </div>
      <template v-if="node.dataConfig?.sourceType === 'api'">
        <div class="ldp-prop" style="padding: 0; border: none; margin-top: 8px">
          <label>{{ t('fbp.apiUrl') }}</label>
        </div>
        <div class="ldp-datasource-url">
          <input
            class="ldp-datasource-input"
            :value="node.dataConfig?.apiUrl ?? ''"
            :placeholder="t('fbp.apiUrlPh')"
            @input="
              emit('update', {
                dataConfig: { ...node.dataConfig, apiUrl: ($event.target as HTMLInputElement).value },
              })
            "
          />
        </div>
        <div class="ldp-prop" style="padding: 0; border: none; margin-top: 8px">
          <label>{{ t('fbp.dataMapping') }}</label>
          <div style="display: flex; gap: 6px">
            <Input
              :model-value="node.dataConfig?.labelField ?? ''"
              :placeholder="t('fbp.labelFieldPh')"
              @update:model-value="
                emit('update', { dataConfig: { ...node.dataConfig, labelField: String($event ?? '') } })
              "
            />
            <Input
              :model-value="node.dataConfig?.valueField ?? ''"
              :placeholder="t('fbp.valueFieldPh')"
              @update:model-value="
                emit('update', { dataConfig: { ...node.dataConfig, valueField: String($event ?? '') } })
              "
            />
          </div>
        </div>
      </template>
    </div>

    <div class="ldp-section-title">{{ t('fbp.sectionDataLinkage') }}</div>
    <div class="ldp-prop">
      <label>{{ t('fbp.linkageSource') }}</label>
      <Select
        :model-value="node.dataConfig?.linkageSource ?? 'none'"
        :options="[
          { value: 'none', label: t('fbp.none') },
          { value: 'userList', label: t('fbp.srcUserList') },
          { value: 'deptList', label: t('fbp.srcDeptList') },
          { value: 'roleList', label: t('fbp.srcRoleList') },
        ]"
        @update:model-value="emit('update', { dataConfig: { ...node.dataConfig, linkageSource: $event as any } })"
      />
    </div>
    <div v-if="node.dataConfig?.linkageSource && node.dataConfig.linkageSource !== 'none'" class="ldp-prop">
      <label>{{ t('fbp.linkageField') }}</label>
      <Select
        :model-value="node.dataConfig?.linkageField ?? ''"
        :options="fieldOptions"
        :placeholder="t('fbp.noneDash')"
        @update:model-value="
          emit('update', {
            dataConfig: { ...node.dataConfig, linkageField: $event === null ? '' : String($event ?? '') },
          })
        "
      />
    </div>

    <div class="ldp-section-title">{{ t('fbp.sectionPersist') }}</div>
    <div class="ldp-prop ldp-prop-switch">
      <label>{{ t('fbp.cacheData') }}</label>
      <Group
        type="switch"
        :model-value="!!node.dataConfig?.cacheData"
        @update:model-value="emit('update', { dataConfig: { ...node.dataConfig, cacheData: !!$event } })"
      />
    </div>
    <div class="ldp-prop ldp-prop-switch">
      <label>{{ t('fbp.clearAfterSubmit') }}</label>
      <Group
        type="switch"
        :model-value="!!node.dataConfig?.clearAfterSubmit"
        @update:model-value="emit('update', { dataConfig: { ...node.dataConfig, clearAfterSubmit: !!$event } })"
      />
    </div>
  </div>
</template>
