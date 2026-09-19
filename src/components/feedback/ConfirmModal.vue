<script setup lang="ts">
/**
 * ConfirmModal — 确认弹窗（feedback 域对外的确认对话框门面）
 *
 * 实现拆层（打破 ConfirmModal ↔ ModalBox 值循环）：
 *   壳 = ModalBox（layout），内容 = ConfirmContent（layout，单一来源）。
 *   本组件只做 props/emits 门面 + 关闭语义，不再自带 confirm 模板/CSS。
 */
import { computed } from 'vue'
import ModalBox from '@/components/layout/ModalBox.vue'
import ConfirmContent from '@/components/layout/ConfirmContent.vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()

const props = withDefaults(
  defineProps<{
    visible: boolean
    title?: string
    message: string
    confirmText?: string
    cancelText?: string
    variant?: 'danger' | 'warning' | 'primary'
    loading?: boolean
    closable?: boolean
  }>(),
  {
    variant: 'danger',
    loading: false,
    closable: true,
  },
)

// 默认标题用 computed 回退而非 prop 工厂：工厂只在实例创建时求值一次，
// 常驻弹窗中途切语言后标题会停在旧语言
const effTitle = computed(() => props.title ?? t('confirmModal.title'))

const emit = defineEmits<{
  'update:visible': [val: boolean]
  confirm: []
  cancel: []
}>()

function close() {
  emit('update:visible', false)
}

// ConfirmContent 已挡掉 loading 态；这里只转发事件 + 关闭
function onConfirm() {
  emit('confirm')
  close()
}
function onCancel() {
  emit('cancel')
  close()
}
</script>

<template>
  <ModalBox
    :visible="visible"
    :title="effTitle"
    size="sm"
    :closable="closable && !loading"
    :mask-closable="!loading"
    @update:visible="emit('update:visible', $event)"
  >
    <ConfirmContent
      :variant="variant"
      :message="message"
      :loading="loading"
      :confirm-text="confirmText"
      :cancel-text="cancelText"
      @confirm="onConfirm"
      @cancel="onCancel"
    />
  </ModalBox>
</template>
