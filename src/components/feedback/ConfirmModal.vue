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
    /** 显隐（v-model:visible） */
    visible: boolean
    /** 弹窗标题（空串用内置 i18n，语言切换实时跟随） */
    title?: string
    /** 正文消息 */
    message: string
    /** 确认按钮文字（空串用内置 i18n） */
    confirmText?: string
    /** 取消按钮文字（空串用内置 i18n） */
    cancelText?: string
    /** 语义色：danger 危险操作（默认）| warning 谨慎 | primary 常规确认 */
    variant?: 'danger' | 'warning' | 'primary'
    /** 确认按钮 loading（等待宿主异步操作期间防重复提交） */
    loading?: boolean
    /** 显示右上角关闭按钮（默认开） */
    closable?: boolean
  }>(),
  {
    variant: 'danger',
    loading: false,
    closable: true,
  },
)

// 默认标题用 computed 回退而非 prop 工厂：工厂只在实例创建时求值一次，
// 常驻弹窗中途切语言后标题会停在旧语言。
//
// 判据是「trim 后非空」而不是 `?? t(...)`（#500）：prop 文档写的是「空串用内置 i18n」，
// 而 `??` 只兜 null/undefined —— 宿主把 title 绑到可选字段（`title=""`）时，
// 弹窗头部就是一片空白，无障碍名退到 `common.dialog`，用户看到"没有标题的确认框"。
// 同族 `confirmText`/`cancelText` 在 #487 已用 `.trim() ||` 修过，这个字段当时漏在外面。
const effTitle = computed(() => props.title?.trim() || t('confirmModal.title'))

const emit = defineEmits<{
  /** v-model:visible——显隐 */
  'update:visible': [val: boolean]
  /** 点击确认（loading 态由宿主控制） */
  confirm: []
  /** 点击取消 / 关闭 */
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
