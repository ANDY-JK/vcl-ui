<script lang="ts">
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：prop 默认值工厂在 setup 之前执行（defineProps 被提升），不能引用 setup 局部变量 */
const t = useT()
</script>

<script setup lang="ts">
import { computed } from 'vue'
import ModalBox from '@/components/layout/ModalBox.vue'
import IconSvg from '@/components/basic/IconSvg.vue'

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
    title: () => t('confirmModal.title'),
    confirmText: () => t('confirmModal.confirm'),
    cancelText: () => t('confirmModal.cancel'),
    variant: 'danger',
    loading: false,
    closable: true,
  },
)

const emit = defineEmits<{
  'update:visible': [val: boolean]
  confirm: []
  cancel: []
}>()

// 每种变体的配色 & 图标
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

function close() {
  emit('update:visible', false)
}

function onCancel() {
  emit('cancel')
  close()
}

function onConfirm() {
  // loading 态 = 异步确认：保持打开让父组件在完成后通过 v-model 关闭，
  // 否则 confirm 一触发就关闭，loading spinner 永远不可见
  if (props.loading) return
  emit('confirm')
  close()
}
</script>

<template>
  <ModalBox
    :visible="visible"
    :title="title"
    size="sm"
    :closable="closable"
    @update:visible="emit('update:visible', $event)"
  >
    <!-- 消息区：图标 + 彩色左边框 -->
    <div class="confirm-body" :style="{ background: variantMeta.bg, borderLeftColor: variantMeta.borderColor }">
      <IconSvg :type="variantMeta.icon" size="md" :color="variantMeta.iconColor" />
      <p class="confirm-msg">
        {{ message }}
      </p>
    </div>

    <template #footer>
      <div class="confirm-footer">
        <button class="confirm-btn cancel" @click="onCancel">
          {{ cancelText }}
        </button>
        <button :class="['confirm-btn', variantMeta.btnClass]" :disabled="loading" @click="onConfirm">
          <IconSvg v-if="loading" type="loader" size="xs" class="confirm-loading-icon" />
          {{ confirmText }}
        </button>
      </div>
    </template>
  </ModalBox>
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
  font-size: clamp(14px, 1.8vw, 15px);
  color: var(--color-text);
  flex: 1;
}

/* 底部按钮 */
.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  width: 100%;
}
.confirm-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 22px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  font-size: clamp(14px, 1.8vw, 15px);
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

/* danger */
.confirm-btn.btn-danger {
  border-color: var(--color-danger-border);
  background: var(--color-danger);
  color: #fff;
}
.confirm-btn.btn-danger:hover {
  background: var(--color-danger-hover);
}

/* warning */
.confirm-btn.btn-warning {
  border-color: var(--color-warning-border);
  background: var(--color-warning);
  color: #fff;
}
.confirm-btn.btn-warning:hover {
  background: var(--color-warning-text);
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
