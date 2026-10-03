<script setup lang="ts">
// ⛔ 保护 — 标签页，禁止：clamp() → px，active 指示器动画，TabItem 接口
//    需我确认：underline/pill 模式行为
import { ref, computed, nextTick, getCurrentInstance, onBeforeUnmount } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useIdSafe } from '@/components/_internal/useIdCompat'
import type { TabItem } from './types'
import { registerTabsHost, unregisterTabsHost, tabIdOf, type TabsContext } from './tabs-context'

export type { TabItem }

/** 实例级前缀，防止多个 Tabs 同页时 aria id 冲突；useIdSafe 保证 SSR/CSR 一致 */
const tabId = useIdSafe('tabs')

// icon 仅在 variant='tabbar' 时渲染，underline/pill 变体静默忽略
interface Props {
  /** 受控激活页签值（对应 TabItem 的 value） */
  modelValue: string | number
  /** 页签列表（TabItem：value/label/icon） */
  items: TabItem[]
  /** 形态：underline 下划线（默认）| pills 药丸 | card 卡片 | tabbar 底部标签栏（移动端，带 icon） */
  variant?: 'underline' | 'pills' | 'card' | 'tabbar'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'underline',
})

const emit = defineEmits<{
  /** v-model——切换激活页签 */
  'update:modelValue': [v: string | number]
}>()

const tablistRef = ref<HTMLElement | null>(null)

// TabPanel 关联：TabPanel 与 Tabs 是兄弟节点（provide/inject 不可达），
// context 登记到「共同父组件 uid」，TabPanel 沿 parent 链查找命中
const registeredPanels = ref<Set<string | number>>(new Set())
const _instance = getCurrentInstance()
const _ctx: TabsContext = {
  idPrefix: tabId,
  activeValue: computed(() => props.modelValue),
  registered: registeredPanels,
}
registerTabsHost(_instance?.parent ?? null, _ctx)
onBeforeUnmount(() => unregisterTabsHost(_instance?.parent ?? null))

// WAI-ARIA Tab Pattern 键盘导航：ArrowLeft/Right 切换，Home/End 跳首尾
function onKeydown(e: KeyboardEvent) {
  if (!props.items.length) return
  const currentIdx = props.items.findIndex((i) => (i.value ?? i.label) === props.modelValue)
  let nextIdx = currentIdx
  switch (e.key) {
    case 'ArrowRight':
      nextIdx = (currentIdx + 1) % props.items.length
      break
    case 'ArrowLeft':
      nextIdx = (currentIdx - 1 + props.items.length) % props.items.length
      break
    case 'Home':
      nextIdx = 0
      break
    case 'End':
      nextIdx = props.items.length - 1
      break
    default:
      return
  }
  e.preventDefault()
  const item = props.items[nextIdx]
  emit('update:modelValue', item.value ?? item.label)
  // 聚焦到新 Tab 按钮
  nextTick(() => {
    const btns = tablistRef.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    btns?.[nextIdx]?.focus()
  })
}
</script>

<template>
  <div ref="tablistRef" class="tabs" :class="[`tabs-${variant}`]" role="tablist" @keydown="onKeydown">
    <button
      v-for="item in items"
      :id="tabIdOf(tabId, String(item.value ?? item.label))"
      :key="String(item.value ?? item.label)"
      type="button"
      class="tab-btn"
      :class="{ active: modelValue === (item.value ?? item.label) }"
      role="tab"
      :aria-selected="modelValue === (item.value ?? item.label)"
      :aria-controls="
        registeredPanels.has(item.value ?? item.label)
          ? `tabpanel-${tabId}-${String(item.value ?? item.label)}`
          : undefined
      "
      @click="emit('update:modelValue', item.value ?? item.label)"
    >
      <IconSvg v-if="item.icon && variant === 'tabbar'" :type="item.icon" size="md" />
      <span>{{ item.label }}</span>
    </button>
  </div>
</template>

<style src="./tabs-scoped.css" scoped></style>
