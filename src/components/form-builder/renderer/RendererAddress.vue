<script setup lang="ts">
// 地址选择字段 — 省/市级联 + 区县/详情输入，值 = 四段拼接字符串
import { computed, ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { addressProvinces, addressCities } from './address-data'
import type { FormField } from '../types'

const t = useT()

defineProps<{
  /** 字段定义（addressDetail 取自 props） */
  field: FormField
  /** 当前值（省+市+区县+详情 拼接字符串） */
  modelValue: unknown
}>()

const emit = defineEmits<{
  'update:modelValue': [v: unknown]
}>()

const addressProvince = ref('')
const addressCity = ref('')
const addressDistrict = ref('')
const addressDetailText = ref('')
const addressCitiesForProvince = computed(() => addressCities[addressProvince.value] ?? [])

/** 任一段变化 → 拼接四段整体回写（与拆分前内联 handler 行为一致） */
function emitAddress(): void {
  emit('update:modelValue', addressProvince.value + addressCity.value + addressDistrict.value + addressDetailText.value)
}
</script>

<template>
  <div class="fb-address">
    <select v-model="addressProvince" class="fb-address-select" @change="emitAddress">
      <option value="">{{ t('formBuilder.selectProvince') }}</option>
      <option v-for="p in addressProvinces" :key="p" :value="p">{{ p }}</option>
    </select>
    <select v-model="addressCity" class="fb-address-select" @change="emitAddress">
      <option value="">{{ t('formBuilder.selectCity') }}</option>
      <option v-for="c in addressCitiesForProvince" :key="c" :value="c">{{ c }}</option>
    </select>
    <input
      v-model="addressDistrict"
      class="fb-address-input"
      :placeholder="t('formBuilder.districtPlaceholder')"
      @input="emitAddress"
    />
    <input
      v-if="field.props?.addressDetail"
      v-model="addressDetailText"
      class="fb-address-input fb-address-detail"
      :placeholder="t('formBuilder.addressPlaceholder')"
      @input="emitAddress"
    />
  </div>
</template>

<style scoped>
.fb-address {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: var(--fb-control-width, 100%);
}
.fb-address-select,
.fb-address-input {
  border: 1px solid var(--color-border, #e2e8f0);
  border-color: var(--fb-field-border, var(--color-border, #e2e8f0));
  border-radius: var(--fb-radius, 6px);
  padding: 7px 10px;
  font-size: 13px;
  background: var(--color-bg, #fff);
  color: var(--color-text, #1e293b);
  outline: none;
}
.fb-address-select:focus,
.fb-address-input:focus {
  border-color: var(--fb-field-focus-border, var(--color-primary, #3b82f6));
}
</style>
