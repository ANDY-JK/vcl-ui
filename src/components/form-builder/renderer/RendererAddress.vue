<script setup lang="ts">
// 地址选择字段 — 省/市级联 + 区县/详情输入，值 = 四段拼接字符串
import { computed, ref, watch } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { addressProvinces, addressCities } from './address-data'
import type { FormField } from '../types'

const t = useT()

const props = defineProps<{
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

/** 反拆记录：自己 emit 出去的值不再回流反拆，否则输入区县会被切走/清空 */
let lastEmitted = ''

/** 任一段变化 → 拼接四段整体回写（与拆分前内联 handler 行为一致） */
function emitAddress(): void {
  lastEmitted =
    addressProvince.value + addressCity.value + addressDistrict.value + addressDetailText.value
  emit('update:modelValue', lastEmitted)
}

/** 改省后市级联表已换，旧市/区县/详情全部失效 → 清空下级再回写 */
function onProvinceChange(): void {
  addressCity.value = ''
  addressDistrict.value = ''
  addressDetailText.value = ''
  emitAddress()
}

/** 区县切分：无区县清单，按常见后缀在剩余串里截取第一段（截不出则整段归详情） */
const DISTRICT_RE = /^[^\s]{1,10}?(?:区|县|市|旗|盟|街道|镇|乡)/

/** 最长前缀匹配：省/市都按已知清单匹配，避免「北京市」被更短的别名先吃掉 */
function matchLongest(candidates: string[], text: string): string {
  return [...candidates].sort((a, b) => b.length - a.length).find((c) => text.startsWith(c)) ?? ''
}

/** 反拆回填：省 → 市 → （区县 / 详情） */
function applyValue(v: unknown): void {
  const text = typeof v === 'string' ? v : ''
  const province = matchLongest(addressProvinces, text)
  let rest = text.slice(province.length)
  const city = province ? matchLongest(addressCities[province] ?? [], rest) : ''
  rest = rest.slice(city.length)

  let district = rest
  let detail = ''
  if (props.field.props?.addressDetail) {
    const matched = rest.match(DISTRICT_RE)
    if (matched) {
      district = matched[0]
      detail = rest.slice(matched[0].length)
    } else {
      district = ''
      detail = rest
    }
  }

  addressProvince.value = province
  addressCity.value = city
  addressDistrict.value = district
  addressDetailText.value = detail
}

watch(
  () => props.modelValue,
  (v) => {
    if (typeof v === 'string' && v === lastEmitted) return
    applyValue(v)
  },
  { immediate: true },
)
</script>

<template>
  <div class="fb-address">
    <select v-model="addressProvince" class="fb-address-select" @change="onProvinceChange">
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
