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
    title: '确认操作',
    confirmText: '确定',
    cancelText: '取消',
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
      iconColor: 'var(--color-danger, #e53e3e)',
      borderColor: 'var(--color-danger-border, #fecaca)',
      bg: 'var(--color-danger-bg, #fef2f2)',
      btnClass: 'btn-danger',
    },
    warning: {
      icon: 'circle-alert',
      iconColor: 'var(--color-warning, #d97706)',
      borderColor: 'var(--color-warning-border, #fde68a)',
      bg: 'var(--color-warning-bg, #fffbeb)',
      btnClass: 'btn-warning',
    },
    primary: {
      icon: 'info',
      iconColor: 'var(--color-primary, #3b82f6)',
      borderColor: 'var(--color-primary-border, #bfdbfe)',
      bg: 'var(--color-primary-light, #eff6ff)',
      btnClass: 'btn-primary',
    },
  }
  return map[props.variant]
})

function close() {
  emit('update:visible', false)
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
        <button
          class="confirm-btn cancel"
          @click="
            emit('cancel')
            close()
          "
        >
          {{ cancelText }}
        </button>
        <button
          :class="['confirm-btn', variantMeta.btnClass]"
          :disabled="loading"
          @click="
            emit('confirm')
            close()
          "
        >
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
  font-size: 14px;
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
  font-size: 14px;
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
  background: var(--color-surface, #fff);
  color: var(--color-text-secondary);
}
.confirm-btn.cancel:hover {
  background: var(--color-bg-alt, #f1f5f9);
}

/* danger */
.confirm-btn.btn-danger {
  border-color: var(--color-danger-border, #fca5a5);
  background: var(--color-danger, #ef4444);
  color: #fff;
}
.confirm-btn.btn-danger:hover {
  background: var(--color-danger-hover, #dc2626);
}

/* warning */
.confirm-btn.btn-warning {
  border-color: var(--color-warning-border, #fcd34d);
  background: var(--color-warning, #f59e0b);
  color: #fff;
}
.confirm-btn.btn-warning:hover {
  background: var(--color-warning-hover, #d97706);
}

/* primary */
.confirm-btn.btn-primary {
  border-color: var(--color-primary-border, #93c5fd);
  background: var(--color-primary, #3b82f6);
  color: #fff;
}
.confirm-btn.btn-primary:hover {
  background: var(--color-primary-hover, #2563eb);
}
</style>
