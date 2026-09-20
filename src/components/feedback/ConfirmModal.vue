<script setup lang="ts">
/**
 * ConfirmModal — 确认弹窗（feedback 域对外的确认对话框门面）
 *
 * 实现拆层（打破 ConfirmModal ↔ ModalBox 值循环，两轮合并：
 *  2026-09-11 ModalShell 外壳下沉 _internal + 2026-09-20 ConfirmContent 内容区收口）：
 *   壳 = _internal/ModalShell、内容 = layout/ConfirmContent。
 *   依赖单向：ConfirmModal → ModalShell + ConfirmContent。
 */
import { computed } from 'vue'
// 用 _internal/ModalShell 作外壳（ModalBox 的 confirm 模式反过来委托本组件，
// 这里再依赖 ModalBox 就构成双向环；Shell 只提供遮罩/盒子/头部/插槽，正是所需）
import ModalShell from '@/components/_internal/ModalShell.vue'
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
  <ModalShell
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
  </ModalShell>
</template>
