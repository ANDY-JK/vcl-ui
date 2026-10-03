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
  /** 显隐（v-model:visible） */
  visible: boolean
  /** 弹窗标题 */
  title?: string
  /** 模式：default 自由内容 | confirm 确认框 | form 表单 | detail 明细 | select 选择 */
  modalType?: 'default' | 'confirm' | 'form' | 'detail' | 'select'
  /** 尺寸档位（默认 'md'） */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** 显示关闭按钮（默认开） */
  closable?: boolean
  /** 点遮罩关闭（默认开） */
  maskClosable?: boolean
  /** 遮罩 z-index 覆盖 */
  zIndex?: number | string
  /** 设为 true 时不参与全局弹窗互斥管理（组件内部弹窗用） */
  internal?: boolean
  /**
   * 弹窗互斥域。同一 scope 的弹窗"新开即关旧"，不同 scope 互不影响。
   * 默认不传 → 全页面全局互斥（历史行为）。需要与其它弹窗共存（如 Drawer 内开确认框）时传独立 scope。
   */
  mutexScope?: string
  // confirm 模式（委托给 ConfirmModal）
  /** confirm 模式：正文消息 */
  confirmMessage?: string
  /** confirm 模式：语义色 */
  confirmVariant?: 'warning' | 'danger' | 'info' | 'success'
  /** confirm 模式：危险操作（实心红按钮） */
  confirmDanger?: boolean
  /** confirm 模式：确认按钮 loading */
  confirmLoading?: boolean
  // detail 模式
  /** detail 模式：键值对明细列表 */
  detailItems?: DetailItem[]
  // select 模式
  /** select 模式：候选项 */
  selectItems?: SelectItem[]
  /** select 模式：受控选中值 */
  selectValue?: (string | number)[]
  /** select 模式：允许多选 */
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
  /** v-model:visible——显隐 */
  'update:visible': [v: boolean]
  /** confirm 模式点击确认 / form 模式提交前的通用确认 */
  confirm: []
  /** 点击取消 / 关闭 */
  cancel: []
  /** form 模式表单提交 */
  'form-submit': []
  /** select 模式点确认：[选中值集合] */
  'select-confirm': [v: (string | number)[]]
  /** 请求关闭（关闭按钮/遮罩/Esc） */
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
const showFooter = computed(() => !!slots.footer || props.modalType === 'form' || props.modalType === 'select')
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
    <!-- @slot default: 模态框主体内容（detail 模式组合详情区另算） -->
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
            :color="
              internalSelectValue.includes(item.value) ? 'var(--vcl-color-primary)' : 'var(--vcl-color-text-muted)'
            "
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
      <!-- @slot footer: 模态框底部按钮区；不传则回退按 mode 类型的内置按钮组（form 模式为取消/提交） -->
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

<style src="./modal-box-scoped.css" scoped></style>
