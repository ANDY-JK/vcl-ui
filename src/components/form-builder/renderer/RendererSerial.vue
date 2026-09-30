<script setup lang="ts">
// 流水号字段 — 挂载时一次性生成并回写 modelValue（避免每次渲染漂移、提交为空）
import { ref, watch, nextTick } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { formatDate } from '@/components/form/utils/date-utils'
import type { FormField } from '../types'

const t = useT()

const props = defineProps<{
  /** 字段定义（serialPrefix/serialDateFormat 取自 props） */
  field: FormField
  /** 当前值（生成的流水号字符串） */
  modelValue: unknown
}>()

const emit = defineEmits<{
  'update:modelValue': [v: unknown]
}>()

const serialValue = ref('')
function generateSerial(): string {
  const prefix = (props.field.props?.serialPrefix as string) ?? ''
  const fmt = (props.field.props?.serialDateFormat as string) ?? 'YYYYMMDD'
  const dateStr = formatDate(new Date(), fmt)
  // 8 位随机 hex：同日同前缀碰撞概率 1/43 亿（旧 4 位十进制为 1/10000，并发生成可重复）
  const seq = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${prefix}${dateStr}${seq}`
}
watch(
  () => props.field.key,
  () => {
    // 字段切换时重置，等待 onMounted/watch 触发重新生成
    serialValue.value = ''
    nextTick(() => {
      if (props.field.type === 'serial' && !props.modelValue) {
        serialValue.value = generateSerial()
        emit('update:modelValue', serialValue.value)
      } else if (props.field.type === 'serial') {
        serialValue.value = String(props.modelValue ?? '')
      }
    })
  },
  { immediate: true },
)
// 挂载后（草稿回显等场景）modelValue 首次到达时同步显示
watch(
  () => props.modelValue,
  (val) => {
    if (val && !serialValue.value) {
      serialValue.value = String(val)
    }
  },
)
</script>

<template>
  <div class="fb-serial">
    <span class="fb-serial-value">{{ serialValue }}</span>
    <span class="fb-serial-hint">{{ t('formBuilder.autoGenerate') }}</span>
  </div>
</template>

<style scoped>
.fb-serial {
  display: flex;
  align-items: center;
  gap: calc(8px * var(--vcl-scale));
  padding: calc(8px * var(--vcl-scale)) calc(12px * var(--vcl-scale));
  border: 1px solid var(--vcl-color-border, #e2e8f0);
  border-color: var(--fb-field-border, var(--vcl-color-border, #e2e8f0));
  border-radius: var(--fb-radius, calc(6px * var(--vcl-scale)));
  background: var(--vcl-color-bg-alt, #f8fafc);
  width: var(--fb-control-width, 100%);
}
.fb-serial-value {
  font-size: var(--vcl-fs-14);
  font-weight: 700;
  color: var(--vcl-color-primary, #3b82f6);
  font-family: 'Cascadia Code', 'Fira Code', monospace;
}
.fb-serial-hint {
  font-size: var(--vcl-fs-11);
  color: var(--vcl-color-text-muted, #94a3b8);
}
</style>
