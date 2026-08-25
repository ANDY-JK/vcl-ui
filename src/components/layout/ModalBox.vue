<script setup lang="ts">
// ⛔ 保护 — 模态框，禁止：clamp() → px，动画时序修改，z-index 层级
//    需我确认：detail 模式行为、Select 内嵌渲染
// ⭐ confirm 模式已委托给 ConfirmModal — 本组件不再维护 confirm 模板/CSS
import { ref, watch, onMounted, onUnmounted, computed, toRef } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import Button from '@/components/basic/Button.vue'
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import { registerModal } from '@/components/_internal/useModalManager'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'
import { useEscClose } from '@/components/_internal/useEscClose'
import { useT } from '@/components/_internal/i18n'

const t = useT()

interface DetailItem {
  label: string
  value: string
  mono?: boolean
}
interface SelectItem {
  value: string | number
  label: string
  desc?: string
}

interface Props {
  visible: boolean
  title?: string
  modalType?: 'default' | 'confirm' | 'form' | 'detail' | 'select'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closable?: boolean
  maskClosable?: boolean
  zIndex?: number | string
  /** 设为 true 时不参与全局弹窗互斥管理（组件内部弹窗用） */
  internal?: boolean
  /**
   * 弹窗互斥域。同一 scope 的弹窗"新开即关旧"，不同 scope 互不影响。
   * 默认不传 → 全页面全局互斥（历史行为）。需要与其它弹窗共存（如 Drawer 内开确认框）时传独立 scope。
   */
  mutexScope?: string
  // confirm 模式（委托给 ConfirmModal）
  confirmMessage?: string
  confirmVariant?: 'warning' | 'danger' | 'info' | 'success'
  confirmDanger?: boolean
  confirmLoading?: boolean
  // detail 模式
  detailItems?: DetailItem[]
  // select 模式
  selectItems?: SelectItem[]
  selectValue?: (string | number)[]
  selectMultiple?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  modalType: 'default',
  size: 'md',
  closable: true,
  maskClosable: true,
  internal: false,
  confirmVariant: 'warning',
  confirmDanger: false,
  confirmLoading: false,
  detailItems: () => [],
  selectItems: () => [],
  selectValue: () => [],
  selectMultiple: false,
})

const emit = defineEmits<{
  'update:visible': [v: boolean]
  confirm: []
  cancel: []
  'form-submit': []
  'select-confirm': [v: (string | number)[]]
  close: []
}>()

const internalSelectValue = ref<(string | number)[]>([...props.selectValue])
watch(
  () => props.selectValue,
  (v) => {
    internalSelectValue.value = [...v]
  },
)
watch(
  () => props.visible,
  (v) => {
    if (v) internalSelectValue.value = [...props.selectValue]
  },
)

// --- 焦点管理：打开时容器内 autofocus（首选 footer 确认/确定按钮，缺省第一个 focusable）→
//    Tab/Shift+Tab 容器内循环 → 关闭恢复焦点到打开按钮 ---
// 须在下方 registerModal 的 visible watch 之前创建：新弹窗先激活（序号 +1），
// 旧弹窗被 registerModal 同步关闭时停用，检测到序号落后则不恢复焦点（避免抢新弹窗焦点）。
// confirm 模式委托给 ConfirmModal（其内部 ModalBox 自行 trap），本层 getContainer 返回 null 为 no-op。
const modalBoxRef = ref<HTMLElement | null>(null)
useFocusTrap({
  visible: toRef(props, 'visible'),
  getContainer: () => modalBoxRef.value,
  autofocus: '.modal-footer button:last-of-type',
})

// --- 弹窗竞态管理：同 scope 只允许一个弹窗（confirm 模式由 ConfirmModal 内部处理，跳过）---
let _unregModal: (() => void) | null = null
watch(
  () => props.visible,
  (v) => {
    if (props.internal || props.modalType === 'confirm') return
    if (v) {
      _unregModal = registerModal(close, props.mutexScope)
    } else {
      if (_unregModal) {
        _unregModal()
        _unregModal = null
      }
    }
  },
)
onUnmounted(() => {
  if (_unregModal) {
    _unregModal()
    _unregModal = null
  }
})

// ESC 关闭 — 使用共享 useEscClose composable（confirm 模式由 ConfirmModal 内部处理，跳过）
const { mount: mountEsc, unmount: unmountEsc } = useEscClose(
  () => props.visible,
  () => props.closable,
  close,
)
onMounted(() => {
  if (props.modalType !== 'confirm') mountEsc()
})
onUnmounted(unmountEsc)

function close() {
  emit('update:visible', false)
  emit('close')
}

// 修复"弹窗内按下→移出→松开导致误关闭"：
// 只有 mousedown 和 mouseup 都在 overlay 上时才关闭
let _maskPressed = false
function onMaskMousedown() {
  _maskPressed = true
}
function onMaskMouseup() {
  if (_maskPressed && props.maskClosable) {
    close()
  }
  _maskPressed = false
}
function onMaskMouseleave() {
  // 鼠标移出 overlay 时取消按下状态，防止在内部按下后移出再移回触发关闭
  _maskPressed = false
}

function toggleSelectItem(val: string | number) {
  if (props.selectMultiple) {
    const arr = internalSelectValue.value
    const idx = arr.indexOf(val)
    internalSelectValue.value = idx >= 0 ? arr.filter((v) => v !== val) : [...arr, val]
  } else {
    internalSelectValue.value = [val]
  }
}

function confirmSelect() {
  emit('select-confirm', internalSelectValue.value)
}

// confirm 模式：将 ModalBox 的 confirm 属性映射到 ConfirmModal 的变体
const confirmModalVariant = computed<'danger' | 'warning' | 'primary'>(() => {
  if (props.confirmDanger) return 'danger'
  const map: Record<string, 'danger' | 'warning' | 'primary'> = {
    warning: 'warning',
    danger: 'danger',
    info: 'primary',
    success: 'primary',
  }
  return map[props.confirmVariant]
})
</script>

<template>
  <!-- ════════════════════════════════════════
       confirm 模式 — 委托给 ConfirmModal
       ════════════════════════════════════════ -->
  <ConfirmModal
    v-if="modalType === 'confirm'"
    :visible="visible"
    :title="title"
    :message="confirmMessage ?? ''"
    :variant="confirmModalVariant"
    :loading="confirmLoading"
    :closable="closable"
    @update:visible="emit('update:visible', $event)"
    @confirm="emit('confirm')"
    @cancel="emit('cancel')"
  />

  <!-- ════════════════════════════════════════
       其他模式：通用 ModalBox 模板
       ════════════════════════════════════════ -->
  <template v-else>
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="visible"
          class="modal-overlay"
          :style="zIndex != null ? { zIndex } : undefined"
          @mousedown="onMaskMousedown"
          @mouseup="onMaskMouseup"
          @mouseleave="onMaskMouseleave"
        >
          <div
            ref="modalBoxRef"
            class="modal-box"
            :class="[`modal-${size}`]"
            role="dialog"
            aria-modal="true"
            :aria-label="title || t('common.dialog')"
            @mousedown.stop
            @mouseup.stop
          >
            <!-- 头部 -->
            <div class="modal-header">
              <h3 class="modal-title">
                {{ title }}
              </h3>
              <button v-if="closable" class="modal-close" :aria-label="t('common.close')" @click="close">
                <IconSvg type="x" size="md" />
              </button>
            </div>

            <!-- 内容区 -->
            <div class="modal-body">
              <slot />

              <!-- detail 模式 -->
              <template v-if="modalType === 'detail'">
                <div class="detail-wrap">
                  <div v-for="item in detailItems" :key="item.label" class="detail-row">
                    <span class="detail-label">{{ item.label }}</span>
                    <span class="detail-value" :class="{ mono: item.mono }">{{ item.value }}</span>
                  </div>
                </div>
              </template>

              <!-- select 模式 -->
              <template v-if="modalType === 'select'">
                <div class="select-wrap">
                  <button
                    v-for="item in selectItems"
                    :key="String(item.value)"
                    class="select-item"
                    :class="{ active: internalSelectValue.includes(item.value) }"
                    @click="toggleSelectItem(item.value)"
                  >
                    <IconSvg
                      :type="internalSelectValue.includes(item.value) ? 'circle-check' : 'circle'"
                      size="md"
                      :color="
                        internalSelectValue.includes(item.value) ? 'var(--color-primary)' : 'var(--color-text-muted)'
                      "
                    />
                    <div class="select-item-text">
                      <span class="select-item-label">{{ item.label }}</span>
                      <span v-if="item.desc" class="select-item-desc">{{ item.desc }}</span>
                    </div>
                  </button>
                </div>
              </template>
            </div>

            <!-- 底部 -->
            <div v-if="$slots.footer || modalType === 'form' || modalType === 'select'" class="modal-footer">
              <slot name="footer">
                <template v-if="modalType === 'form'">
                  <Button :text="t('common.cancel')" variant="secondary" @click="close" />
                  <Button :text="t('common.submit')" variant="primary" @click="emit('form-submit')" />
                </template>
                <template v-else-if="modalType === 'select'">
                  <Button :text="t('common.cancel')" variant="secondary" @click="close" />
                  <Button :text="t('common.confirm')" variant="primary" @click="confirmSelect" />
                </template>
              </slot>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </template>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 1000);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}
@supports (backdrop-filter: blur(4px)) {
  .modal-overlay {
    backdrop-filter: blur(4px);
  }
}

.modal-box {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: clamp(320px, 92vw, 520px);
  max-height: 85vh;
  max-height: 85dvh;
}
.modal-sm {
  width: clamp(280px, 38vw, 420px);
}
.modal-md {
  width: clamp(380px, 52vw, 580px);
}
.modal-lg {
  width: clamp(480px, 66vw, 760px);
}
.modal-xl {
  width: clamp(580px, 82vw, 980px);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: clamp(var(--space-1), 1.2vw, 10px) clamp(8px, 1.5vw, 12px);
  border-bottom: 1px solid var(--color-border-light);
}

.modal-title {
  font-size: clamp(14px, 2.2vw, 36px);
  font-weight: 600;
}

.modal-close {
  display: flex;
  padding: var(--space-1);
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.modal-close:hover {
  background: var(--color-bg-alt);
}

.modal-body {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: clamp(var(--space-1), 1.2vw, 10px);
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: clamp(var(--space-1), 1vw, 8px);
  padding: clamp(var(--space-2), 2vw, 16px) clamp(12px, 2.5vw, 20px);
  border-top: 1px solid var(--color-border-light);
}

/* detail */
.detail-wrap {
  display: flex;
  flex-direction: column;
}
.detail-row {
  display: flex;
  justify-content: space-between;
  padding: clamp(var(--space-2), 1.2vw, 10px) 0;
  border-bottom: 1px solid var(--color-border-light);
  font-size: clamp(11px, 1.8vw, 15px);
}
.detail-label {
  color: var(--color-text-muted);
}
.detail-value.mono {
  font-family: monospace;
}

/* select */
.select-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.select-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3) 8px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
}
.select-item:hover {
  background: var(--color-bg-alt);
}
.select-item.active {
  background: var(--color-primary-light);
}
.select-item-text {
  display: flex;
  flex-direction: column;
}
.select-item-label {
  font-size: clamp(12px, 1.8vw, 15px);
}
.select-item-desc {
  font-size: clamp(11px, 1.5vw, 15px);
  color: var(--color-text-muted);
}

/* 过渡动画 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--transition-normal);
}
.modal-enter-active .modal-box,
.modal-leave-active .modal-box {
  transition: transform var(--transition-normal);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-box {
  transform: scale(0.95) translateY(10px);
}
.modal-leave-to .modal-box {
  transform: scale(0.95) translateY(10px);
}
</style>
