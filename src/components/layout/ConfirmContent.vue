<script setup lang="ts">
/**
 * ConfirmContent — 确认弹窗内容区（消息体 + 操作按钮）单一来源
 *
 * 打破 ConfirmModal ↔ ModalBox 值循环：两者共用本组件而非互相渲染对方。
 *   ModalBox(confirm 模式)  → 本组件（layout 域原生实现）
 *   ConfirmModal(feedback)  → ModalBox + 本组件（薄封装）
 * 依赖单向：ConfirmModal → ModalBox → ConfirmContent。
 *
 * ⛔ 契约 — 本组件是确认弹窗内容区的唯一实现：消息体配色/图标/按钮/加载语义都在此，
 *   ModalBox 与 ConfirmModal 不得各自再维护一份 confirm 模板/CSS（哨兵值不抄两份）。
 */
import { computed } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()

const props = withDefaults(
  defineProps<{
    /** 语义色：danger 危险操作（默认）| warning 谨慎 | primary 常规确认 */
    variant?: 'danger' | 'warning' | 'primary'
    /** 正文消息 */
    message: string
    /** 确认按钮 loading */
    loading?: boolean
    /** 确认按钮文字（空串用内置 i18n，语言切换实时跟随） */
    confirmText?: string
    /** 取消按钮文字（空串用内置 i18n） */
    cancelText?: string
  }>(),
  {
    variant: 'danger',
    loading: false,
  },
)

// 默认文案用 computed 回退而非 prop 工厂：工厂只在实例创建时求值一次，
// 常驻弹窗中途切语言后按钮会停在旧语言
const effConfirmText = computed(() => props.confirmText ?? t('confirmModal.confirm'))
const effCancelText = computed(() => props.cancelText ?? t('confirmModal.cancel'))

const emit = defineEmits<{
  /** 点击确认 */
  confirm: []
  /** 点击取消 */
  cancel: []
}>()

// 每种变体的配色 & 图标（色值全部走设计令牌；danger/warning 实心底用 -solid 令牌压白字，
// 暗色下 --vcl-color-danger 被提亮、压白字对比度仅 2.77 不达标 —— 与 Button 的 .btn-danger 口径同步）
const variantMeta = computed(() => {
  const map = {
    danger: {
      icon: 'circle-alert',
      iconColor: 'var(--vcl-color-danger)',
      borderColor: 'var(--vcl-color-danger-border)',
      bg: 'var(--vcl-color-danger-bg)',
      btnClass: 'btn-danger',
    },
    warning: {
      icon: 'circle-alert',
      iconColor: 'var(--vcl-color-warning)',
      borderColor: 'var(--vcl-color-warning-border)',
      bg: 'var(--vcl-color-warning-bg)',
      btnClass: 'btn-warning',
    },
    primary: {
      icon: 'info',
      iconColor: 'var(--vcl-color-primary)',
      borderColor: 'var(--vcl-color-info-border)',
      bg: 'var(--vcl-color-primary-light)',
      btnClass: 'btn-primary',
    },
  }
  return map[props.variant]
})

function onCancel() {
  // loading 态 = 异步确认中：取消同样要拦下，避免请求半途被用户取消
  if (props.loading) return
  emit('cancel')
}

function onConfirm() {
  // loading 态保持打开，让父组件完成后通过 v-model 关闭；
  // 否则 confirm 一触发就关闭，loading spinner 永远不可见
  if (props.loading) return
  emit('confirm')
}
</script>

<template>
  <!-- 消息区：图标 + 彩色左边框（多根：消息体 + 按钮区，由宿主 ModalBox 的 body/footer 承载布局） -->
  <div class="confirm-body" :style="{ background: variantMeta.bg, borderLeftColor: variantMeta.borderColor }">
    <IconSvg :type="variantMeta.icon" size="md" :color="variantMeta.iconColor" />
    <p class="confirm-msg">
      {{ message }}
    </p>
  </div>

  <div class="confirm-footer">
    <button type="button" class="confirm-btn cancel" @click="onCancel">
      {{ effCancelText }}
    </button>
    <button type="button" :class="['confirm-btn', variantMeta.btnClass]" :disabled="loading" @click="onConfirm">
      <IconSvg v-if="loading" type="loader" size="xs" class="confirm-loading-icon" />
      {{ effConfirmText }}
    </button>
  </div>
</template>

<style src="./confirm-content-scoped.css" scoped></style>
