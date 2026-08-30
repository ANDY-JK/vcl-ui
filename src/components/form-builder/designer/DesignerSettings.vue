<script setup lang="ts">
/**
 * 表单设置面板 — 基础设置 + 高级设置 + 数据存储（本地/云端切换）
 *
 * 从 FormDesigner 拆出（超 800 行约束整改）：
 * - 样式沿用全局 designer.css（ld-settings-* 类），本组件不带 scoped 样式
 * - 云端配置 UI 数据全部来自 useFormManager 实例（reactive 对象自动解包）
 */
import { inject } from 'vue'
import { useT } from '@/components/_internal/i18n'
import Group from '@/components/form/Group.vue'
import type { FormMeta } from './types'
import { FORM_MANAGER_KEY } from './context'

const t = useT()

defineProps<{
  meta: FormMeta
}>()

/** 表单管理实例：父级 provide 注入（共享 reactive 状态，非 prop 单向流） */
const manager = inject(FORM_MANAGER_KEY)!

const emit = defineEmits<{
  'patch-meta': [patch: Partial<FormMeta>]
}>()
</script>

<template>
  <!-- 表单设置 -->
  <div class="ld-settings">
    <div class="ld-settings-row wide">
      <label>{{ t('fbd.formTitle') }}</label>
      <input
        class="ld-settings-textarea"
        :value="meta.title ?? ''"
        :placeholder="t('fbd.formTitlePh')"
        @input="emit('patch-meta', { title: ($event.target as HTMLInputElement).value })"
      />
    </div>
    <div class="ld-settings-row wide">
      <label>{{ t('fbd.formDesc') }}</label>
      <input
        class="ld-settings-textarea"
        :value="meta.description ?? ''"
        :placeholder="t('fbd.formDescPh')"
        @input="emit('patch-meta', { description: ($event.target as HTMLInputElement).value })"
      />
    </div>
    <div class="ld-settings-row" style="max-width: 200px">
      <label>{{ t('fbd.layoutMode') }}</label>
      <div class="ld-layout-preview">
        <div
          class="ld-layout-thumb"
          :class="{ active: (meta.layout ?? 'single') === 'single' }"
          @click="emit('patch-meta', { layout: 'single' })"
        >
          <div class="ld-thumb-bars">
            <div></div>
            <div></div>
            <div></div>
          </div>
          <span>{{ t('fbd.layoutSingle') }}</span>
        </div>
        <div
          class="ld-layout-thumb"
          :class="{ active: meta.layout === 'grid' }"
          @click="emit('patch-meta', { layout: 'grid' })"
        >
          <div class="ld-thumb-grid">
            <div></div>
            <div></div>
            <div></div>
            <div></div>
          </div>
          <span>{{ t('fbd.layoutGrid') }}</span>
        </div>
        <div
          class="ld-layout-thumb"
          :class="{ active: meta.layout === 'steps' }"
          @click="emit('patch-meta', { layout: 'steps' })"
        >
          <div class="ld-thumb-steps">
            <div></div>
            <div></div>
            <div></div>
          </div>
          <span>{{ t('fbd.layoutSteps') }}</span>
        </div>
      </div>
    </div>
    <div class="ld-settings-row" style="max-width: 200px">
      <label>{{ t('fbd.submitBtnText') }}</label>
      <input
        class="ld-settings-textarea"
        :value="meta.submitText ?? t('common.submit')"
        :placeholder="t('common.submit')"
        @input="emit('patch-meta', { submitText: ($event.target as HTMLInputElement).value })"
      />
    </div>
    <div class="ld-settings-row" style="max-width: 160px">
      <label>{{ t('fbd.realtimeValidate') }}</label>
      <select
        class="ld-settings-textarea"
        :value="meta.validateOnChange ? '1' : '0'"
        @change="emit('patch-meta', { validateOnChange: ($event.target as HTMLSelectElement).value === '1' })"
      >
        <option value="0">{{ t('fbd.validateOnSubmitOnly') }}</option>
        <option value="1">{{ t('fbd.validateOnInput') }}</option>
      </select>
    </div>
    <!-- 数据存储：宿主注入 store 时隐藏切换（存储实现由宿主接管） -->
    <template v-if="!manager.hasInjectedStore">
      <div class="ld-settings-row" style="max-width: 200px">
        <label>{{ t('fbd.storageMode') }}</label>
        <select class="ld-settings-textarea" :value="manager.storageMode" @change="manager.onModeChange">
          <option value="local">{{ t('fbd.storageLocal') }}</option>
          <option value="cloud">{{ t('fbd.storageCloud') }}</option>
        </select>
      </div>
      <template v-if="manager.storageMode === 'cloud'">
        <div class="ld-settings-row wide">
          <label>{{ t('fbd.storageCloudUrl') }}</label>
          <input
            v-model="manager.cloudUrl"
            class="ld-settings-textarea"
            placeholder="https://xxxx.supabase.co"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <div class="ld-settings-row wide">
          <label>{{ t('fbd.storageCloudKey') }}</label>
          <input
            v-model="manager.cloudKey"
            class="ld-settings-textarea"
            type="password"
            placeholder="eyJhbGciOi..."
            autocomplete="off"
          />
        </div>
        <div class="ld-settings-row" style="max-width: 200px">
          <label>{{ t('fbd.storageCloudBucket') }}</label>
          <input
            v-model="manager.cloudBucket"
            class="ld-settings-textarea"
            placeholder="form-builder"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <div class="ld-settings-row ld-storage-test-row">
          <label>{{ t('fbd.storageCloudTest') }}</label>
          <button class="ld-btn" :disabled="manager.cloudTesting" @click="manager.testCloud">
            {{ manager.cloudTesting ? t('fbd.storageTesting') : t('fbd.storageCloudTest') }}
          </button>
          <span v-if="manager.cloudTestMsg" class="ld-storage-test" :class="{ ok: manager.cloudTestOk }">
            {{ manager.cloudTestMsg }}
          </span>
        </div>
        <div class="ld-settings-row wide">
          <label></label>
          <span class="ld-storage-hint">{{ t('fbd.storageHint') }}</span>
        </div>
      </template>
    </template>
  </div>

  <!-- 高级表单设置 -->
  <div class="ld-settings ld-settings-advanced">
    <div class="ld-settings-row" style="max-width: 140px">
      <label>{{ t('fbp.labelPosition') }}</label>
      <select
        class="ld-settings-textarea"
        :value="meta.labelPosition ?? 'left'"
        @change="
          emit('patch-meta', {
            labelPosition: ($event.target as HTMLSelectElement).value as 'left' | 'top' | 'hidden',
          })
        "
      >
        <option value="left">{{ t('fbp.posLeft') }}</option>
        <option value="top">{{ t('fbp.posTop') }}</option>
        <option value="hidden">{{ t('fbp.posHidden') }}</option>
      </select>
    </div>
    <div class="ld-settings-row" style="max-width: 140px">
      <label>{{ t('fbp.labelWidth') }}</label>
      <select
        class="ld-settings-textarea"
        :value="meta.labelWidth ?? 'default'"
        @change="
          emit('patch-meta', {
            labelWidth: ($event.target as HTMLSelectElement).value as 'default' | '80px' | '120px' | 'auto',
          })
        "
      >
        <option value="default">{{ t('fbp.labelWidthDefault') }}</option>
        <option value="80px">80px</option>
        <option value="120px">120px</option>
        <option value="auto">{{ t('fbp.auto') }}</option>
      </select>
    </div>
    <div class="ld-settings-row" style="max-width: 140px">
      <label>{{ t('fbd.resetBtnText') }}</label>
      <input
        class="ld-settings-textarea"
        :value="meta.resetText ?? t('common.reset')"
        :placeholder="t('common.reset')"
        @input="emit('patch-meta', { resetText: ($event.target as HTMLInputElement).value })"
      />
    </div>
    <div class="ld-settings-row" style="max-width: 140px">
      <label>{{ t('fbd.submitMode') }}</label>
      <select
        class="ld-settings-textarea"
        :value="meta.submitMode ?? 'once'"
        @change="
          emit('patch-meta', {
            submitMode: ($event.target as HTMLSelectElement).value as 'once' | 'multiple' | 'unique',
          })
        "
      >
        <option value="once">{{ t('fbd.modeOnce') }}</option>
        <option value="multiple">{{ t('fbd.modeMultiple') }}</option>
        <option value="unique">{{ t('fbd.modeUnique') }}</option>
      </select>
    </div>
    <div class="ld-settings-switch-row">
      <label>{{ t('fbd.hideActions') }}</label>
      <Group
        type="switch"
        :model-value="!!meta.hideActions"
        @update:model-value="emit('patch-meta', { hideActions: !!$event })"
      />
    </div>
    <div class="ld-settings-switch-row">
      <label>{{ t('fbp.clearAfterSubmit') }}</label>
      <Group
        type="switch"
        :model-value="!!meta.clearAfterSubmit"
        @update:model-value="emit('patch-meta', { clearAfterSubmit: !!$event })"
      />
    </div>
  </div>
</template>
