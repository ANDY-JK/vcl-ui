<script setup lang="ts">
// ⛔ 保护 — 模态框，禁止：clamp() → px，动画时序修改，z-index 层级
//    需我确认：detail 模式行为、Select 内嵌渲染
// ⭐ 基础外壳（遮罩/盒子/头部/焦点管理/互斥/ESC）已下沉到 _internal/ModalShell.vue
// ⭐ confirm 模式委托给 ConfirmModal — 本组件不维护 confirm 模板/CSS
import { ref, watch, computed, useSlots } from 'vue'
import ModalShell from '@/components/_internal/ModalShell.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import Button from '@/components/basic/Button.vue'
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()
const slots = useSlots()

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

function close() {
  emit('update:visible', false)
  emit('close')
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

// 底部区域是否出现 —— 与抽取前的 `$slots.footer || modalType==='form' || modalType==='select'` 等价。
// ModalShell 只认「有没有 footer 插槽」，所以这里要把 form/select 的内置按钮也算进去，
// 否则这两个模式的默认按钮会消失。
const showFooter = computed(
  () => !!slots.footer || props.modalType === 'form' || props.modalType === 'select',
)
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
       其他模式：通用 ModalBox 内容，外壳由 ModalShell 提供
       ════════════════════════════════════════ -->
  <ModalShell
    v-else
    :visible="visible"
    :title="title"
    :size="size"
    :closable="closable"
    :mask-closable="maskClosable"
    :z-index="zIndex"
    :internal="internal"
    :mutex-scope="mutexScope"
    @update:visible="emit('update:visible', $event)"
    @close="emit('close')"
  >
    <slot />

    <!-- detail 模式 -->
    <template v-if="modalType === 'detail'">
      <div class="detail-wrap">
        <div v-for="(item, i) in detailItems" :key="`${item.label}-${i}`" class="detail-row">
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
          :aria-pressed="internalSelectValue.includes(item.value)"
          @click="toggleSelectItem(item.value)"
        >
          <IconSvg
            :type="internalSelectValue.includes(item.value) ? 'circle-check' : 'circle'"
            size="md"
            :color="internalSelectValue.includes(item.value) ? 'var(--color-primary)' : 'var(--color-text-muted)'"
          />
          <div class="select-item-text">
            <span class="select-item-label">{{ item.label }}</span>
            <span v-if="item.desc" class="select-item-desc">{{ item.desc }}</span>
          </div>
        </button>
      </div>
    </template>

    <!-- 底部 -->
    <template v-if="showFooter" #footer>
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
    </template>
  </ModalShell>
</template>

<style scoped>
/* 基础外壳样式（.modal-overlay / .modal-box / .modal-header / .modal-body /
   .modal-footer / 尺寸类 / 过渡动画）已随模板移入 _internal/ModalShell.vue，
   本文件只保留 detail 与 select 两个模式各自的样式。 */

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
</style>
