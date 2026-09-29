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
// 暗色下 --color-danger 被提亮、压白字对比度仅 2.77 不达标 —— 与 Button 的 .btn-danger 口径同步）
const variantMeta = computed(() => {
  const map = {
    danger: {
      icon: 'circle-alert',
      iconColor: 'var(--color-danger)',
      borderColor: 'var(--color-danger-border)',
      bg: 'var(--color-danger-bg)',
      btnClass: 'btn-danger',
    },
    warning: {
      icon: 'circle-alert',
      iconColor: 'var(--color-warning)',
      borderColor: 'var(--color-warning-border)',
      bg: 'var(--color-warning-bg)',
      btnClass: 'btn-warning',
    },
    primary: {
      icon: 'info',
      iconColor: 'var(--color-primary)',
      borderColor: 'var(--color-info-border)',
      bg: 'var(--color-primary-light)',
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

<style scoped>
/* 消息体 */
.confirm-body {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  margin: var(--space-1) 0 0;
  padding: var(--space-4) 16px;
  border-radius: var(--radius-md);
  border-left: 4px solid;
}
.confirm-msg {
  margin: 0;
  line-height: 1.7;
  font-size: clamp(14px, calc(14px + var(--vcl-fit) * 1), 15px);
  color: var(--color-text);
  flex: 1;
}

/* 底部按钮（自身带顶部分隔线与内边距，宿主把它放进 modal-body 即复刻原 .modal-footer 外观） */
.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  width: 100%;
  margin-top: var(--space-3);
  padding: clamp(var(--space-2), 2vw, 16px) 0 0;
  border-top: 1px solid var(--color-border-light);
}
.confirm-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 22px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  font-size: clamp(14px, calc(14px + var(--vcl-fit) * 1), 15px);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  background: var(--color-bg);
  color: var(--color-text);
}
.confirm-btn:hover {
  filter: brightness(0.95);
}
.confirm-btn:active {
  transform: scale(0.97);
}
.confirm-btn:disabled {
  opacity: 0.7;
  cursor: wait;
}

/* loading 旋转图标 */
.confirm-loading-icon {
  animation: confirm-spin 1s linear infinite;
}
@keyframes confirm-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 取消 */
.confirm-btn.cancel {
  border-color: var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
}
.confirm-btn.cancel:hover {
  background: var(--color-bg-alt);
}

/* danger —— 实心底压白字，用 --color-danger-solid（暗色下 --color-danger 被提亮，
   压白字对比度仅 2.77 不达标）；本条优先级高于 Button 的 .btn-danger，必须同步 */
.confirm-btn.btn-danger {
  border-color: var(--color-danger-border);
  background: var(--color-danger-solid, var(--color-danger));
  color: #fff;
}
.confirm-btn.btn-danger:hover {
  background: var(--color-danger-solid-hover, var(--color-danger-hover));
}

/* warning —— 同上，实心底压白字用 solid 令牌 */
.confirm-btn.btn-warning {
  border-color: var(--color-warning-border);
  background: var(--color-warning-solid, var(--color-warning));
  color: #fff;
}
.confirm-btn.btn-warning:hover {
  background: var(--color-warning-solid-hover, var(--color-warning-text));
}

/* primary */
.confirm-btn.btn-primary {
  border-color: var(--color-info-border);
  background: var(--color-primary);
  color: #fff;
}
.confirm-btn.btn-primary:hover {
  background: var(--color-primary-hover);
}
</style>
