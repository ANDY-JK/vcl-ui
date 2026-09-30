<script setup lang="ts">
// 证件号码字段 — 类型下拉（props.idcardTypes 换行分隔）+ 号码输入
import { computed, ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import type { FormField } from '../types'

const t = useT()

const props = defineProps<{
  /** 字段定义（idcardTypes 取自 props） */
  field: FormField
  /** 当前值（证件号码字符串） */
  modelValue: unknown
}>()

const emit = defineEmits<{
  'update:modelValue': [v: unknown]
}>()

/** 证件类型列表 */
const idcardTypes = computed(() => {
  const raw = (props.field.props?.idcardTypes as string) ?? t('fb.idType1')
  return raw.split('\n').filter(Boolean)
})

/** 证件当前类型索引 */
const idcardTypeIndex = ref(0)
</script>

<template>
  <div class="fb-idcard">
    <select v-model="idcardTypeIndex" class="fb-idcard-type">
      <option v-for="(item, i) in idcardTypes" :key="i" :value="i">{{ item }}</option>
    </select>
    <input
      class="fb-idcard-input"
      :value="(modelValue as string) ?? ''"
      :placeholder="idcardTypes[idcardTypeIndex] || t('formBuilder.idNumber')"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>

<style scoped>
.fb-idcard {
  display: flex;
  gap: calc(6px * var(--vcl-scale));
  width: var(--fb-control-width, 100%);
}
.fb-idcard-type {
  width: calc(110px * var(--vcl-scale));
  flex-shrink: 0;
  border: 1px solid var(--vcl-color-border, #e2e8f0);
  border-color: var(--fb-field-border, var(--vcl-color-border, #e2e8f0));
  border-radius: var(--fb-radius, calc(6px * var(--vcl-scale)));
  padding: calc(7px * var(--vcl-scale)) calc(10px * var(--vcl-scale));
  font-size: var(--vcl-fs-13);
  background: var(--vcl-color-bg, #fff);
  color: var(--vcl-color-text, #1e293b);
  outline: none;
}
.fb-idcard-input {
  flex: 1;
  border: 1px solid var(--vcl-color-border, #e2e8f0);
  border-color: var(--fb-field-border, var(--vcl-color-border, #e2e8f0));
  border-radius: var(--fb-radius, calc(6px * var(--vcl-scale)));
  padding: calc(7px * var(--vcl-scale)) calc(10px * var(--vcl-scale));
  font-size: var(--vcl-fs-13);
  background: var(--vcl-color-bg, #fff);
  color: var(--vcl-color-text, #1e293b);
  outline: none;
}
.fb-idcard-input:focus {
  border-color: var(--fb-field-focus-border, var(--vcl-color-primary, #3b82f6));
}
</style>
