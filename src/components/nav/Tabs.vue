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
  modelValue: string | number
  items: TabItem[]
  variant?: 'underline' | 'pills' | 'card' | 'tabbar'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'underline',
})

const emit = defineEmits<{ 'update:modelValue': [v: string | number] }>()

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
      :aria-controls="registeredPanels.has(item.value ?? item.label) ? `tabpanel-${tabId}-${String(item.value ?? item.label)}` : undefined"
      @click="emit('update:modelValue', item.value ?? item.label)"
    >
      <IconSvg v-if="item.icon && variant === 'tabbar'" :type="item.icon" size="md" />
      <span>{{ item.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 0;
}

/* underline */
.tabs-underline {
  border-bottom: 1.5px solid var(--color-border);
}
.tabs-underline .tab-btn {
  padding: clamp(7px, 1.2vw, var(--space-2)) clamp(var(--space-2), 2vw, 16px);
  border: none;
  background: transparent;
  font-size: clamp(12px, 1.8vw, 15px);
  color: var(--color-text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1.5px;
  transition: all var(--transition-fast);
}
.tabs-underline .tab-btn:hover {
  color: var(--color-text);
}
.tabs-underline .tab-btn.active {
  color: var(--color-primary-solid); /* AA：主色基色压白底实测仅 4.28，solid 档 5.84 */
  border-bottom-color: var(--color-primary);
  font-weight: 500;
}

/* pills */
.tabs-pills {
  gap: clamp(3px, 0.5vw, var(--space-1));
  padding: clamp(3px, 0.5vw, var(--space-1));
  background: var(--color-bg-alt);
  border-radius: var(--radius-lg);
}
.tabs-pills .tab-btn {
  padding: clamp(var(--space-1), 1vw, 8px) clamp(10px, 2vw, 16px);
  border: none;
  background: transparent;
  font-size: clamp(11px, 1.8vw, 15px);
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}
.tabs-pills .tab-btn:hover {
  color: var(--color-text);
}
.tabs-pills .tab-btn.active {
  background: var(--color-surface);
  color: var(--color-text);
  font-weight: 500;
  box-shadow: var(--shadow-sm);
}

/* card */
.tabs-card .tab-btn {
  padding: clamp(7px, 1.2vw, var(--space-2)) clamp(var(--space-2), 2vw, 16px);
  border: 1.5px solid var(--color-border);
  background: var(--color-bg);
  font-size: clamp(12px, 1.8vw, 15px);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.tabs-card .tab-btn:first-child {
  border-radius: var(--radius-md) 0 0 var(--radius-md);
}
.tabs-card .tab-btn:last-child {
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
}
.tabs-card .tab-btn:not(:first-child) {
  margin-left: -1.5px;
}
.tabs-card .tab-btn.active {
  background: var(--color-primary-light);
  border-color: var(--color-primary);
  color: var(--color-primary-solid);
  z-index: 1;
}

/* tabbar */
.tabs-tabbar {
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
}
.tabs-tabbar .tab-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: clamp(6px, 1vw, 8px) clamp(3px, 0.5vw, var(--space-1));
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: clamp(10px, 1.5vw, 15px);
  color: var(--color-text-muted);
  transition: color var(--transition-fast);
}
.tabs-tabbar .tab-btn.active {
  color: var(--color-primary);
  font-weight: 500;
}
</style>
