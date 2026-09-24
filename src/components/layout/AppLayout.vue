<script lang="ts">
import { useT } from '@/components/_internal/i18n'
/** 模块级 t：prop 默认值工厂在 setup 之前执行（defineProps 被提升），不能引用 setup 局部变量 */
const t = useT()
</script>

<script setup lang="ts">
// ⛔ 保护 — 布局骨架，禁止：clamp() → px，侧边栏结构/宽度 → 硬编码，slot 层级修改
//    需我确认：navItems 结构、logo/mini 模式切换、进度条行为
import { ref, computed, onMounted, onUnmounted, provide, nextTick } from 'vue'
import { RouterView, useRouter, useRoute } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'
import AccordionNav from './AccordionNav.vue'
import ErrorBoundary from '@/components/feedback/ErrorBoundary.vue'
import { getPrevNext, getCategory, navLabel, type NavNode } from './utils/navData'
import { useThrottleFn } from '@/components/_internal/useDebounce'
import { BP_MD, BP_LG } from '@/components/_internal/breakpoints'

const props = withDefaults(
  defineProps<{
    /** 侧栏导航树（NavNode[]；不传时渲染空态，不渲染演示菜单） */
    navItems?: NavNode[]
    /** 侧栏 Logo 文字（默认用内置 i18n） */
    logoText?: string
    /** 顶栏显示的用户名 */
    username?: string
  }>(),
  {
    logoText: () => t('appLayout.logoText'),
    username: '',
  },
)

const emit = defineEmits<{ /** 点击退出登录（导航跳转由宿主自理） */ logout: [] }>()

const router = useRouter()
const route = useRoute()
const sidebarOpen = ref(false)
const sidebarCollapsed = ref(false)
const isMobile = ref(false)

provide('isMobile', isMobile)
provide('toggleSidebar', () => {
  sidebarOpen.value = !sidebarOpen.value
})
provide('toggleCollapse', toggleCollapse)

function checkScreen() {
  const w = window.innerWidth
  const wasMobile = isMobile.value
  isMobile.value = w < BP_MD
  if (isMobile.value) sidebarCollapsed.value = false
  if (w >= BP_LG) {
    sidebarCollapsed.value = false
  } else if (!wasMobile && w >= BP_MD && w < BP_LG) {
    sidebarCollapsed.value = true
  }
  if (!isMobile.value) sidebarOpen.value = false
}

// 监听内容区 DOM 变化 + 路由切换，自动更新滚动状态
let mutationObserver: MutationObserver | null = null

// 节流：合并短时间内多次 DOM 变化/滚动事件，固定间隔执行一次
const { run: scheduleScrollCheck, cancel: cancelScrollCheck } = useThrottleFn(updateScrollPercent, 50)

onMounted(() => {
  checkScreen()
  window.addEventListener('resize', checkScreen)
  updateScrollPercent()
  // 环境降级：无 MutationObserver（旧 Safari/WebView）时跳过自动滚动检测，靠 scroll 事件
  if (bodyRef.value && typeof MutationObserver !== 'undefined') {
    mutationObserver = new MutationObserver(() => scheduleScrollCheck())
    mutationObserver.observe(bodyRef.value, { childList: true, subtree: true })
  }
})
onUnmounted(() => {
  window.removeEventListener('resize', checkScreen)
  document.removeEventListener('mousemove', onProgressMouseMove)
  document.removeEventListener('mouseup', onProgressMouseUp)
  mutationObserver?.disconnect()
  cancelScrollCheck()
  cancelBodyScroll()
  // 注销路由守卫：不注销会在组件卸载后继续执行（多实例/HMR 时累积泄漏）
  if (removeAfterEach) removeAfterEach()
})

// 路由变化：收起移动端抽屉 + 刷新滚动进度（保存注销函数，卸载时清理）
const removeAfterEach = router.afterEach(async () => {
  if (isMobile.value) sidebarOpen.value = false
  await nextTick()
  updateScrollPercent()
})

function closeSidebar() {
  sidebarOpen.value = false
}
function toggleCollapse() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

/* ---- 导航面包屑 ---- */
const categoryName = computed(() => getCategory(route.path, props.navItems))
const nav = computed(() => getPrevNext(route.path, props.navItems))
function goDemo(path: string) {
  if (path) router.push(path)
}

/* ---- 滚动进度（可拖拽调节） ---- */
const bodyRef = ref<HTMLElement | null>(null)
const progressRef = ref<HTMLElement | null>(null)
const scrollPercent = ref(0)
const hasScroll = ref(false)
const isDragging = ref(false)

// 滚动节流 30ms
const { run: onBodyScroll, cancel: cancelBodyScroll } = useThrottleFn(() => {
  if (isDragging.value) return
  updateScrollPercent()
}, 30)
function updateScrollPercent() {
  const el = bodyRef.value
  if (!el) return
  const max = el.scrollHeight - el.clientHeight
  hasScroll.value = max > 0
  scrollPercent.value = max > 0 ? Math.round((el.scrollTop / max) * 100) : 0
}
const progressStyle = computed(() => ({ width: scrollPercent.value + '%' }))

function scrollToPosition(clientX: number) {
  const bar = progressRef.value
  const body = bodyRef.value
  if (!bar || !body) return
  const rect = bar.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  const max = body.scrollHeight - body.clientHeight
  body.scrollTop = ratio * max
  scrollPercent.value = Math.round(ratio * 100)
}
function onProgressMouseDown(e: MouseEvent) {
  isDragging.value = true
  scrollToPosition(e.clientX)
  document.addEventListener('mousemove', onProgressMouseMove)
  document.addEventListener('mouseup', onProgressMouseUp)
}
function onProgressMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  scrollToPosition(e.clientX)
}
function onProgressMouseUp() {
  isDragging.value = false
  document.removeEventListener('mousemove', onProgressMouseMove)
  document.removeEventListener('mouseup', onProgressMouseUp)
}
</script>

<template>
  <div class="vcl-app-layout">
    <Transition name="vcl-fade">
      <div v-if="isMobile && sidebarOpen" class="vcl-sidebar-overlay" @click="closeSidebar" />
    </Transition>

    <aside class="sidebar" :class="{ open: sidebarOpen, collapsed: sidebarCollapsed }">
      <div class="vcl-sidebar-header">
        <div class="vcl-logo">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </div>
        <span v-show="!sidebarCollapsed" class="vcl-logo-text">{{ logoText }}</span>
        <button
          v-if="!isMobile"
          class="vcl-collapse-btn"
          :aria-label="sidebarCollapsed ? t('common.expand') : t('common.collapse')"
          :title="sidebarCollapsed ? t('common.expand') : t('common.collapse')"
          @click="toggleCollapse"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline v-if="sidebarCollapsed" points="9 18 15 12 9 6" />
            <polyline v-else points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>
      <AccordionNav :collapsed="sidebarCollapsed" :items="navItems" />
    </aside>

    <main class="vcl-content">
      <div class="vcl-content-topbar">
        <div class="vcl-topbar-glow" />
        <button
          v-if="isMobile"
          class="vcl-topbar-hamburger"
          :aria-label="t('common.menu')"
          @click="sidebarOpen = !sidebarOpen"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span class="vcl-topbar-prompt">~</span>
        <span class="vcl-topbar-category">{{ categoryName }}</span>
        <span class="vcl-topbar-sep">/</span>
        <span class="vcl-topbar-title">{{ nav.current ? navLabel(nav.current.label) : '' }}</span>

        <div class="vcl-topbar-spacer" />
        <div class="topbar-tools">
          <!--
            预设类名速查（CSS 已内置，直接 class 引用即可）：
              .topbar-tool-btn             → 32×32 纯图标按钮
              .topbar-tool-text            → 32px 高 纯文字按钮
              .topbar-tool-label           → 32px 高 图标+文字按钮
              ★ 以上三种均支持 .active（主色高亮）和 .is-danger（红色危险）
              .topbar-tool-sep             → 按钮组间竖线分隔
            示例：
              <button class="topbar-tool-btn" title="搜索" aria-label="搜索"><IconSvg type="search" size="sm" /></button>
              <span class="topbar-tool-sep" />
              <button class="topbar-tool-text active">编辑</button>
              <button class="topbar-tool-label"><IconSvg type="download" size="sm" /><span>导出</span></button>
          -->
          <slot name="topbar-tools" />
        </div>

        <!-- 用户区 -->
        <div class="vcl-topbar-right">
          <slot name="topbar-right">
            <template v-if="username">
              <div class="vcl-user-info">
                <div class="vcl-user-avatar">
                  {{ username.charAt(0).toUpperCase() }}
                </div>
                <span class="vcl-user-name" :title="username">{{ username }}</span>
              </div>
              <button
                class="vcl-logout-btn"
                :title="t('common.logout')"
                :aria-label="t('common.logout')"
                @click="emit('logout')"
              >
                <IconSvg type="log-out" size="sm" />
              </button>
            </template>
          </slot>
        </div>
      </div>

      <div ref="bodyRef" class="content-body" @scroll="onBodyScroll">
        <!-- watch-key=fullPath：切页或换查询参数即复位边界错误态，避免某页抛错后 fallback 顶掉整个 RouterView -->
        <ErrorBoundary :watch-key="route.fullPath">
          <RouterView />
        </ErrorBoundary>
      </div>

      <div class="vcl-content-bottombar">
        <button v-if="nav.prev" class="vcl-nav-btn" @click="goDemo(nav.prev.route!)">
          <IconSvg type="arrow-left" size="sm" /><span class="vcl-toolbar-label" :title="navLabel(nav.prev.label)">{{
            navLabel(nav.prev.label)
          }}</span>
        </button>
        <span v-else class="vcl-nav-btn is-empty" />

        <div v-if="hasScroll" class="vcl-nav-center" @mousedown="onProgressMouseDown">
          <div ref="progressRef" class="vcl-nav-progress-track">
            <div class="vcl-nav-progress" :style="progressStyle" />
          </div>
          <span class="vcl-nav-percent">{{ scrollPercent }}%</span>
        </div>

        <button v-if="nav.next" class="vcl-nav-btn" @click="goDemo(nav.next.route!)">
          <span class="vcl-toolbar-label" :title="navLabel(nav.next.label)">{{ navLabel(nav.next.label) }}</span
          ><IconSvg type="arrow-right" size="sm" />
        </button>
        <span v-else class="vcl-nav-btn is-empty" />
      </div>
    </main>
  </div>
</template>

<style>
/* 全局样式块类名契约（本组件未 scoped，以下类会进入宿主全局样式表）：
   - vcl-*：组件内部业务类，宿主不应依赖
   - .sidebar / .content-body：跨组件契约类（DataTable 全屏按类名查询），改名会静默破坏全屏定位
   - .topbar-tool-*：文档化预设类（topbar-tools 插槽用），宿主按注释示例直接引用 */
.vcl-app-layout {
  display: flex;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  contain: layout style;
}

.vcl-sidebar-overlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-sticky, 100) - 10);
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
}

.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  background: var(--color-sidebar);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: var(--z-sticky, 100);
  transition:
    width var(--transition-normal),
    min-width var(--transition-normal);
  will-change: width;
  contain: layout style;
}

@media (max-width: 767px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(260px, 85vw);
    transform: translateX(-100%);
    box-shadow: var(--shadow-lg);
    transition: transform var(--transition-normal);
  }
  .sidebar.open {
    transform: translateX(0);
  }
  .sidebar.collapsed {
    width: min(260px, 85vw);
  }
}

.vcl-sidebar-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-4);
  min-height: 56px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--color-sidebar-text-active);
}

.sidebar.collapsed {
  width: 72px;
  min-width: 72px;
}
.sidebar.collapsed .vcl-sidebar-header {
  flex-direction: column;
  gap: var(--space-2);
  justify-content: center;
  padding: var(--space-4) var(--space-2);
  min-height: 72px;
}
.sidebar.collapsed .vcl-collapse-btn {
  margin-left: 0;
}

.vcl-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  min-width: 34px;
  height: 34px;
  background: var(--color-primary);
  border-radius: var(--radius-md);
  color: white;
  flex-shrink: 0;
}
.vcl-logo-text {
  font-size: clamp(13px, 2vw, 15px);
  font-weight: 600;
  white-space: nowrap;
  letter-spacing: 0.3px;
}

.vcl-collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin-left: auto;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-sidebar-text);
  cursor: pointer;
  transition:
    background var(--transition-fast),
    color var(--transition-fast);
  flex-shrink: 0;
}
.vcl-collapse-btn:hover {
  background: var(--color-sidebar-hover);
  color: var(--color-sidebar-text-active);
}

.vcl-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--color-bg);
  padding: var(--space-2);
}

/* ---- 顶栏 ---- */
.vcl-content-topbar {
  flex-shrink: 0;
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) clamp(12px, 2vw, 16px);
  background:
    linear-gradient(180deg, rgba(var(--color-primary-rgb), 0.03) 0%, transparent 2px),
    linear-gradient(90deg, rgba(var(--color-primary-rgb), 0.015) 1px, transparent 1px) 0 0 / 3px 100%,
    var(--color-sidebar);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  border-bottom: 1px solid rgba(var(--color-primary-rgb), 0.15);
  overflow: hidden;
}
.vcl-topbar-glow {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--color-primary) 20%,
    var(--color-primary) 50%,
    var(--color-primary) 80%,
    transparent 100%
  );
  opacity: 0.5;
}
.vcl-topbar-hamburger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-right: var(--space-1);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--transition-fast);
}
.vcl-topbar-hamburger:hover {
  background: rgba(var(--color-primary-rgb), 0.08);
  color: var(--color-primary);
}
.vcl-topbar-prompt {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: var(--ctrl-font-size);
  color: var(--color-primary);
  opacity: 0.7;
  margin-right: var(--space-1);
}
.vcl-topbar-category {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: var(--ctrl-font-size);
  font-weight: 600;
  color: var(--color-primary);
  letter-spacing: 0.3px;
}
.vcl-topbar-sep {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: var(--ctrl-font-size);
  color: var(--color-text-secondary);
  font-weight: 300;
}
.vcl-topbar-title {
  font-size: var(--ctrl-font-size);
  font-weight: 500;
  color: var(--color-sidebar-text-active);
  letter-spacing: 0.2px;
}

/* ---- 顶栏工具 + 用户区 ---- */
.vcl-topbar-spacer {
  flex: 1;
}
.topbar-tools {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
  /* 子元素可引用以下预设类名获得标准工具栏按钮样式：
     .topbar-tool-btn     → 图标按钮（32×32 暗色半透明）
     .topbar-tool-btn.active → 激活态（主色背景描边）
     .topbar-tool-sep     → 按钮组之间的竖线分隔 */
}
.vcl-topbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}

/* 工具栏按钮 — 32×32 暗色图标按钮，默认带微弱底色可辨识 */
.topbar-tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: clamp(28px, 4vw, 32px);
  height: clamp(28px, 4vw, 32px);
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.08); /* 微弱亮边，框出按钮区域 */
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.04); /* 默认微白底 — 告知用户这里有功能 */
  color: var(--color-text-secondary); /* 与 hamburger 一致的暗色图标 */
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
  position: relative;
}
.topbar-tool-btn:hover {
  color: var(--color-primary);
  background: rgba(var(--color-primary-rgb), 0.08);
  border-color: rgba(var(--color-primary-rgb), 0.15);
}
.topbar-tool-btn:active {
  transform: scale(0.95);
  background: rgba(var(--color-primary-rgb), 0.12);
  transition:
    transform var(--transition-fast),
    background var(--transition-fast);
}
/* 键盘焦点环 — 保留可访问性 */
.topbar-tool-btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
/* 激活/选中态 — 有主色边框 + 微亮底色 */
.topbar-tool-btn.active {
  color: var(--color-primary);
  background: rgba(var(--color-primary-rgb), 0.12);
  border-color: rgba(var(--color-primary-rgb), 0.25);
}
.topbar-tool-btn.active:hover {
  background: rgba(var(--color-primary-rgb), 0.18);
  border-color: rgba(var(--color-primary-rgb), 0.35);
}
/* 危险操作变体 — 红色激活 */
.topbar-tool-btn.is-danger:hover {
  color: var(--color-danger);
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.2);
}
.topbar-tool-btn.is-danger.active {
  color: var(--color-danger);
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.25);
}

/* 工具栏按钮组之间的竖线分隔 */
.topbar-tool-sep {
  width: 1px;
  height: 18px;
  margin: 0 var(--space-1);
  background: rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  border-radius: 1px;
}

/* 工具栏文字按钮 — 纯文字标签，与图标按钮并列等高 */
.topbar-tool-text {
  display: flex;
  align-items: center;
  height: clamp(28px, 4vw, 32px);
  padding: 0 var(--space-3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-muted);
  font-size: clamp(11px, 1.5vw, 15px);
  font-weight: 500;
  letter-spacing: 0.2px;
  white-space: nowrap;
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}
.topbar-tool-text:hover {
  color: var(--color-sidebar-text-active);
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
}
.topbar-tool-text:active {
  transform: scale(0.97);
  transition: transform var(--transition-fast);
}
.topbar-tool-text:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
/* 文字按钮 — 主色高亮态 */
.topbar-tool-text.active {
  color: var(--color-primary);
  background: rgba(var(--color-primary-rgb), 0.12);
  border-color: rgba(var(--color-primary-rgb), 0.25);
  font-weight: 600;
}
.topbar-tool-text.active:hover {
  background: rgba(var(--color-primary-rgb), 0.18);
  border-color: rgba(var(--color-primary-rgb), 0.35);
}
/* 文字按钮 — 危险红色 */
.topbar-tool-text.is-danger:hover {
  color: var(--color-danger);
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.2);
}
.topbar-tool-text.is-danger.active {
  color: var(--color-danger);
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.25);
}

/* 工具栏图标+文字按钮 — 图标左、文字右，与纯图标按钮并列等高 */
.topbar-tool-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: nowrap; /* 绝不换行 —— 图标和文字始终同排 */
  height: clamp(28px, 4vw, 32px);
  padding: 0 var(--space-3) 0 var(--space-2);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-muted);
  font-size: clamp(11px, 1.5vw, 15px);
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}
/* 文字 span：行高=字号，靠 flex align-items:center 居中，避免 line-height 撑高干扰对齐 */
.topbar-tool-label > span {
  line-height: 1;
}
/* SVG 图标：固定 16px，block 消除 inline 基线偏移 */
.topbar-tool-label > svg {
  display: block;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.topbar-tool-label:hover {
  color: var(--color-sidebar-text-active);
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
}
.topbar-tool-label:hover > svg {
  color: var(--color-primary);
}
.topbar-tool-label:active {
  transform: scale(0.97);
  transition: transform var(--transition-fast);
}
.topbar-tool-label:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
/* 图标+文字按钮 — 主色高亮态 */
.topbar-tool-label.active {
  color: var(--color-primary);
  background: rgba(var(--color-primary-rgb), 0.12);
  border-color: rgba(var(--color-primary-rgb), 0.25);
  font-weight: 600;
}
.topbar-tool-label.active:hover {
  background: rgba(var(--color-primary-rgb), 0.18);
  border-color: rgba(var(--color-primary-rgb), 0.35);
}
/* 图标+文字按钮 — 危险红色 */
.topbar-tool-label.is-danger:hover {
  color: var(--color-danger);
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.2);
}
.topbar-tool-label.is-danger:hover > svg {
  color: var(--color-danger);
}
.topbar-tool-label.is-danger.active {
  color: var(--color-danger);
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.25);
}

.vcl-user-info {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.vcl-user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(11px, 1.5vw, 15px);
  font-weight: 600;
  line-height: 1;
}
.vcl-user-name {
  font-size: var(--ctrl-font-size);
  color: var(--color-text-muted);
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vcl-logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-normal);
}
.vcl-logout-btn:hover {
  color: var(--color-danger);
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.06);
}

/* ---- 内容滚动区 ---- */
.content-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: var(--color-surface);
  border-left: 1px solid var(--color-border-light);
  border-right: 1px solid var(--color-border-light);
  scrollbar-width: none;
}
.content-body::-webkit-scrollbar {
  display: none;
}

/* ---- 底栏 ---- */
.vcl-content-bottombar {
  flex-shrink: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) clamp(12px, 2vw, 16px);
  background: linear-gradient(0deg, rgba(var(--color-primary-rgb), 0.02) 0%, transparent 2px), var(--color-sidebar);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  border-top: 1px solid rgba(var(--color-primary-rgb), 0.12);
}
.vcl-nav-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 7px var(--space-4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-sidebar-text);
  font-size: clamp(11px, 1.5vw, 15px);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-normal);
}
.vcl-nav-btn:hover {
  color: var(--color-surface);
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 16px rgba(255, 255, 255, 0.06);
  transform: translateY(-1px);
}
.vcl-nav-btn:active {
  transform: translateY(0);
  box-shadow: none;
}
.vcl-nav-btn.is-empty {
  visibility: hidden;
}
.vcl-toolbar-label {
  font-weight: 500;
  letter-spacing: 0.2px;
  max-width: clamp(80px, 14vw, 160px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vcl-nav-center {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: clamp(80px, 16vw, 140px);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}
.vcl-nav-center:hover .vcl-nav-progress-track {
  height: 4px;
  border-radius: var(--radius-sm);
}
.vcl-nav-center:hover .vcl-nav-progress {
  box-shadow: 0 0 10px rgba(var(--color-primary-rgb), 0.6);
}
.vcl-nav-center:active .vcl-nav-progress {
  box-shadow: 0 0 14px rgba(var(--color-primary-rgb), 0.75);
}
.vcl-nav-progress-track {
  flex: 1;
  height: 2px;
  background: rgba(var(--color-primary-rgb), 0.12);
  border-radius: var(--radius-sm);
  transition:
    height var(--transition-fast),
    border-radius var(--transition-fast);
  overflow: hidden;
}
.vcl-nav-progress {
  height: 100%;
  background: var(--color-primary);
  border-radius: var(--radius-sm);
  box-shadow: 0 0 6px rgba(var(--color-primary-rgb), 0.4);
  transition:
    width var(--transition-normal),
    box-shadow var(--transition-fast);
  pointer-events: none;
}
.vcl-nav-percent {
  font-size: clamp(10px, 1.3vw, 13px);
  color: var(--color-primary);
  font-weight: 600;
  opacity: 0.7;
  min-width: clamp(28px, 4vw, 32px);
  text-align: right;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  pointer-events: none;
}

.vcl-fade-enter-active,
.vcl-fade-leave-active {
  transition: opacity var(--transition-normal);
}
.vcl-fade-enter-from,
.vcl-fade-leave-to {
  opacity: 0;
}
</style>
