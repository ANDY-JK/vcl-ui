<script setup lang="ts">
// ⛔ 保护 — 多级菜单，禁止：递归渲染结构，hover/click 展开逻辑
//    需我确认：item 字段扩展、submenu 定位方式
import { ref, computed } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'

// --- types ---
interface MenuItem {
  key: string | number
  label: string
  icon?: string
  children?: MenuItem[]
  disabled?: boolean
  divided?: boolean
  action?: () => void
}

const props = withDefaults(defineProps<{
  items: MenuItem[]
  mode?: 'vertical' | 'horizontal'
  selectedKey?: string | number
  collapsed?: boolean
  multiple?: boolean
  level?: number
  theme?: 'light' | 'dark'
}>(), { mode: 'vertical', multiple: false, level: 0, theme: 'light' })

const emit = defineEmits<{
  select: [item: MenuItem]
  'update:selectedKey': [key: string | number]
}>()

// --- state ---
const expandedKeys = ref<Set<string | number>>(new Set())
const hoverKey = ref<string | number | null>(null)
let enterTimer: ReturnType<typeof setTimeout> | null = null
let leaveTimer: ReturnType<typeof setTimeout> | null = null

// --- hover helpers ---
function clearTimers() {
  if (enterTimer) { clearTimeout(enterTimer); enterTimer = null }
  if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null }
}
function scheduleEnter(key: string | number) {
  clearTimers()
  enterTimer = setTimeout(() => { hoverKey.value = key }, 150)
}
function scheduleLeave() {
  clearTimers()
  leaveTimer = setTimeout(() => { hoverKey.value = null }, 150)
}
function cancelLeave() { if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null } }

// --- expand logic ---
function isExpanded(key: string | number) { return expandedKeys.value.has(key) }

function toggleExpand(key: string | number) {
  const next = new Set(props.multiple ? expandedKeys.value : [])
  if (next.has(key)) { next.delete(key) } else { if (!props.multiple) next.clear(); next.add(key) }
  expandedKeys.value = next
}

// --- item interaction ---
function handleClick(item: MenuItem) {
  if (item.disabled) return
  if (item.children?.length) { toggleExpand(item.key); return }
  emit('select', item)
  emit('update:selectedKey', item.key)
  item.action?.()
}

function onKeydown(e: KeyboardEvent, item: MenuItem) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(item); return }
  if (e.key === 'Escape') { expandedKeys.value = new Set(); hoverKey.value = null; return }
  const dir = props.mode === 'horizontal' ? { next: 'ArrowRight', prev: 'ArrowLeft' } : { next: 'ArrowDown', prev: 'ArrowUp' }
  if (e.key === dir.next) { e.preventDefault(); focusSibling(e.currentTarget as HTMLElement, 1) }
  if (e.key === dir.prev) { e.preventDefault(); focusSibling(e.currentTarget as HTMLElement, -1) }
}

function focusSibling(el: HTMLElement, delta: 1 | -1) {
  const menuEl = el.closest('[role="menu"]')
  if (!menuEl) return
  const items = Array.from(menuEl.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'))
  const idx = items.indexOf(el)
  const next = items[idx + delta]
  next?.focus()
}

// --- submenu visibility ---
function showSubmenu(item: MenuItem): boolean {
  if (props.mode === 'horizontal' || (props.mode === 'vertical' && props.collapsed)) {
    return hoverKey.value === item.key
  }
  return isExpanded(item.key)
}

const isHoverMode = computed(() => props.mode === 'horizontal' || (props.mode === 'vertical' && props.collapsed))

// 层级深度（对齐 AccordionNav 的层次系统）
// 透明度: 1.0 - 0.10 × level（逐级变淡）
const levelStyle = computed(() => {
  if (props.level === 0) return {}
  const opacity = Math.max(0.5, 1 - 0.10 * props.level)
  return { opacity }
})
</script>

<template>
  <ul class="menu" :class="[`menu--${mode}`, `menu--${theme}`, { 'menu--collapsed': collapsed }]" role="menu">
    <template v-for="item in items" :key="item.key">
      <!-- divider -->
      <li v-if="item.divided" class="menu-divider" role="separator" />

      <li
        class="menu-item-wrap"
        :class="{ 'has-children': item.children?.length }"
        @mouseenter="item.children?.length && isHoverMode ? scheduleEnter(item.key) : undefined"
        @mouseleave="isHoverMode ? scheduleLeave() : undefined"
      >
        <!-- item row -->
        <div
          class="menu-item"
          :class="{
            'menu-item--active': selectedKey === item.key,
            'menu-item--disabled': item.disabled,
            'menu-item--expanded': showSubmenu(item),
          }"
          :style="levelStyle"
          role="menuitem"
          :aria-expanded="item.children?.length ? showSubmenu(item) : undefined"
          :aria-disabled="item.disabled || undefined"
          :tabindex="item.disabled ? -1 : 0"
          @click="handleClick(item)"
          @keydown="onKeydown($event, item)"
          :title="(mode === 'vertical' && collapsed) ? item.label : undefined"
        >
          <span v-if="item.icon" class="menu-item-icon">
            <IconSvg :type="item.icon" size="md" color="currentColor" />
          </span>
          <span v-show="!(mode === 'vertical' && collapsed)" class="menu-item-label">{{ item.label }}</span>
          <span v-if="item.children?.length && !(mode === 'vertical' && collapsed)" class="menu-item-chevron" aria-hidden="true">
            <IconSvg type="chevron-right" size="sm" color="currentColor" />
          </span>
        </div>

        <!-- SUBMENU: vertical inline (click-expand) -->
        <Transition name="menu-slide" v-if="item.children?.length && !isHoverMode">
          <div v-show="isExpanded(item.key)" class="menu-submenu menu-submenu--inline" role="menu">
            <Menu
              :items="item.children"
              :mode="mode"
              :selected-key="selectedKey"
              :multiple="multiple"
              :level="level + 1"
              :theme="theme"
              @select="(i) => emit('select', i)"
              @update:selected-key="(k) => emit('update:selectedKey', k)"
            />
          </div>
        </Transition>

        <!-- SUBMENU: overlay (horizontal dropdown / collapsed floating) -->
        <div
          v-if="item.children?.length && isHoverMode"
          class="menu-submenu menu-submenu--overlay"
          :class="{ 'menu-submenu--visible': hoverKey === item.key }"
          role="menu"
          @mouseenter="cancelLeave()"
          @mouseleave="scheduleLeave()"
        >
          <Menu
            :items="item.children"
            :mode="(mode === 'horizontal') ? 'vertical' : mode"
            :selected-key="selectedKey"
            :multiple="false"
            :level="level + 1"
            :theme="theme"
            @select="(i) => { emit('select', i); hoverKey = null }"
            @update:selected-key="(k) => { emit('update:selectedKey', k); hoverKey = null }"
          />
        </div>
      </li>
    </template>
  </ul>
</template>

<style scoped>
/* ====== ROOT MENU ====== */
.menu { list-style: none; margin: 0; padding: 0; outline: none; }

/* ====== ITEM WRAPPER ====== */
.menu-item-wrap { position: relative; }

/* ====== MENU ITEM ROW ====== */
.menu-item {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--color-text);
  font-size: clamp(12px, 1.8vw, 14px);
  line-height: 1.5;
  transition: background var(--transition-fast), color var(--transition-fast);
  user-select: none;
  white-space: nowrap;
}
.menu-item:hover { background: var(--color-bg-alt); }
.menu-item--active { background: var(--color-primary-light); color: var(--color-primary); font-weight: 500; }
.menu-item--disabled { opacity: 0.4; cursor: not-allowed; }
.menu-item--disabled:hover { background: transparent; }

.menu-item-icon { flex-shrink: 0; display: flex; align-items: center; }
.menu-item-label { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.menu-item-chevron { flex-shrink: 0; display: flex; align-items: center; transition: transform var(--transition-normal); }
.menu-item--expanded > .menu-item-chevron { transform: rotate(90deg); }

/* ====== DIVIDER ====== */
.menu-divider {
  height: 1px; margin: var(--space-1) var(--space-3);
  background: var(--color-border-light);
}

/* ====== SUBMENU — INLINE (vertical click-expand) ====== */
.menu-submenu--inline {
  overflow: hidden;
  padding-left: var(--space-4);
}

/* ====== SUBMENU — OVERLAY (horizontal dropdown / collapsed floating) ====== */
.menu-submenu--overlay {
  position: absolute; z-index: var(--z-dropdown, 2000); /* 下拉层：高于弹窗(modal 1000)，不被 Modal 遮挡 */
  min-width: clamp(140px, 24vw, 200px);
  padding: var(--space-1);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  opacity: 0; visibility: hidden;
  transition: opacity var(--transition-fast), visibility var(--transition-fast);
}
.menu-submenu--visible { opacity: 1; visibility: visible; }

/* ====== VERTICAL MODE ====== */
.menu--vertical { display: flex; flex-direction: column; gap: var(--space-1); width: 100%; }
.menu--vertical > .menu-item-wrap > .menu-item { width: 100%; }

/* collapsed: center icon, no label, floating submenu to the right */
.menu--vertical.menu--collapsed > .menu-item-wrap > .menu-item {
  justify-content: center; padding: var(--space-2);
}
.menu--vertical.menu--collapsed .menu-submenu--overlay {
  left: calc(100% + var(--space-1)); top: 0;
}

/* ====== HORIZONTAL MODE ====== */
.menu--horizontal { display: flex; align-items: center; gap: var(--space-1); }
.menu--horizontal > .menu-item-wrap > .menu-item {
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-md);
}
.menu--horizontal .menu-submenu--overlay {
  top: calc(100% + var(--space-1)); left: 0;
}

/* ====== DARK THEME ====== */
.menu--dark .menu-item { color: var(--color-sidebar-text); }
.menu--dark .menu-item:hover { background: var(--color-sidebar-hover); color: #fff; }
.menu--dark .menu-item--active { background: var(--color-sidebar-active); color: var(--color-sidebar-text-active); }
.menu--dark .menu-divider { background: rgba(255,255,255,0.06); }

/* ====== TRANSITIONS ====== */
.menu-slide-enter-active { transition: opacity var(--transition-fast), transform var(--transition-fast); transform-origin: top; }
.menu-slide-leave-active { transition: opacity var(--transition-fast), transform var(--transition-fast); transform-origin: top; }
.menu-slide-enter-from, .menu-slide-leave-to { opacity: 0; transform: scaleY(0.95); }
</style>
