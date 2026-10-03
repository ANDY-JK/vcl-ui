<script setup lang="ts">
// ⛔ 保护 — 多级菜单，禁止：递归渲染结构，hover/click 展开逻辑
//    需我确认：item 字段扩展、submenu 定位方式
import { ref, computed, onBeforeUnmount } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import type { MenuItem } from './types'

/** 悬停切换子菜单的进/出延时：同一手感，两向共用一个值 */
const _HOVER_SWITCH_MS = 150

export type { MenuItem }

const props = withDefaults(
  defineProps<{
    /** 菜单树（MenuItem：key/label/children） */
    items: MenuItem[]
    /** 排列方向（默认 vertical，纵向可折叠子级） */
    mode?: 'vertical' | 'horizontal'
    /** 受控选中项 key */
    selectedKey?: string | number
    /** 折叠态（纵向：仅显示图标 + 悬停浮层子菜单） */
    collapsed?: boolean
    /** 允许多个子菜单同时展开（默认关=手风琴） */
    multiple?: boolean
    /** 嵌套层级（递归子菜单内部用，消费方勿传） */
    level?: number
    /** 配色：light 浅色 | dark 深色（侧栏内嵌时用） */
    theme?: 'light' | 'dark'
  }>(),
  { mode: 'vertical', multiple: false, level: 0, theme: 'light' },
)

const emit = defineEmits<{
  /** 选中菜单项：[MenuItem] */
  select: [item: MenuItem]
  /** v-model:selectedKey——受控选中 */
  'update:selectedKey': [key: string | number]
}>()

// --- state ---
const expandedKeys = ref<Set<string | number>>(new Set())
const hoverKey = ref<string | number | null>(null)
let enterTimer: ReturnType<typeof setTimeout> | null = null
let leaveTimer: ReturnType<typeof setTimeout> | null = null

// --- hover helpers ---
function clearTimers() {
  if (enterTimer) {
    clearTimeout(enterTimer)
    enterTimer = null
  }
  if (leaveTimer) {
    clearTimeout(leaveTimer)
    leaveTimer = null
  }
}
// 卸载时清理 pending 定时器，避免回调写已卸载组件的 ref
onBeforeUnmount(clearTimers)
function scheduleEnter(key: string | number) {
  clearTimers()
  enterTimer = setTimeout(() => {
    hoverKey.value = key
  }, _HOVER_SWITCH_MS)
}
function scheduleLeave() {
  clearTimers()
  leaveTimer = setTimeout(() => {
    hoverKey.value = null
  }, _HOVER_SWITCH_MS)
}
function cancelLeave() {
  if (leaveTimer) {
    clearTimeout(leaveTimer)
    leaveTimer = null
  }
}

// --- expand logic ---
function isExpanded(key: string | number) {
  return expandedKeys.value.has(key)
}

function toggleExpand(key: string | number) {
  // 先复制当前状态（无论 multiple 与否），这样 toggle off 才能生效
  const next = new Set(expandedKeys.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    if (!props.multiple) next.clear()
    next.add(key)
  }
  expandedKeys.value = next
}

// --- item interaction ---
function handleClick(item: MenuItem) {
  if (item.disabled) return
  if (item.children?.length) {
    if (isHoverMode.value) {
      // hover 模式下 click/Enter/Space 也要能开子菜单（触屏无 hover、键盘不触发 mouseenter）。
      // 先清 pending enter/leave 定时器：触屏点按会先派发模拟 mouseenter，
      // 不清的话第二次点按关闭后 150ms 又被定时器重新打开。
      clearTimers()
      hoverKey.value = hoverKey.value === item.key ? null : item.key
      return
    }
    toggleExpand(item.key)
    return
  }
  emit('select', item)
  emit('update:selectedKey', item.key)
  item.action?.()
}

function onKeydown(e: KeyboardEvent, item: MenuItem) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    handleClick(item)
    return
  }
  if (e.key === 'Escape') {
    expandedKeys.value = new Set()
    hoverKey.value = null
    return
  }
  const dir =
    props.mode === 'horizontal' ? { next: 'ArrowRight', prev: 'ArrowLeft' } : { next: 'ArrowDown', prev: 'ArrowUp' }
  if (e.key === dir.next) {
    e.preventDefault()
    focusSibling(e.currentTarget as HTMLElement, 1)
  }
  if (e.key === dir.prev) {
    e.preventDefault()
    focusSibling(e.currentTarget as HTMLElement, -1)
  }
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
  const opacity = Math.max(0.5, 1 - 0.1 * props.level)
  return { opacity }
})
</script>

<template>
  <ul class="menu" :class="[`menu--${mode}`, `menu--${theme}`, { 'menu--collapsed': collapsed }]" role="menu">
    <template v-for="item in items" :key="item.key">
      <!-- 纯分隔线项：divided 且无 label 无 children → 只渲染分隔线，不渲染空菜单项 -->
      <li v-if="item.divided && !item.label && !item.children?.length" class="menu-divider" role="separator" />
      <!-- 正常菜单项：有 label / children / icon 才渲染 -->
      <template v-else>
        <li v-if="item.divided" class="menu-divider" role="separator" />
        <li
          class="menu-item-wrap"
          role="none"
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
            :title="mode === 'vertical' && collapsed ? item.label : undefined"
            @click="handleClick(item)"
            @keydown="onKeydown($event, item)"
          >
            <span v-if="item.icon" class="menu-item-icon">
              <IconSvg :type="item.icon" size="md" color="currentColor" />
            </span>
            <span v-show="!(mode === 'vertical' && collapsed)" class="menu-item-label" :title="item.label">{{
              item.label
            }}</span>
            <span
              v-if="item.children?.length && !(mode === 'vertical' && collapsed)"
              class="menu-item-chevron"
              aria-hidden="true"
            >
              <IconSvg type="chevron-right" size="sm" color="currentColor" />
            </span>
          </div>

          <!-- SUBMENU: vertical inline (click-expand) -->
          <Transition v-if="item.children?.length && !isHoverMode" name="menu-slide">
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
              :mode="mode === 'horizontal' ? 'vertical' : mode"
              :selected-key="selectedKey"
              :multiple="false"
              :level="level + 1"
              :theme="theme"
              @select="
                (i) => {
                  emit('select', i)
                  hoverKey = null
                }
              "
              @update:selected-key="
                (k) => {
                  emit('update:selectedKey', k)
                  hoverKey = null
                }
              "
            />
          </div>
        </li>
      </template>
    </template>
  </ul>
</template>

<style src="./menu-scoped.css" scoped></style>
