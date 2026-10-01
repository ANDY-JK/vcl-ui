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

const emit = defineEmits<{
  /** 点击退出登录（导航跳转由宿主自理） */
  logout: []
}>()

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
        <template v-if="categoryName || nav.current">
          <span class="vcl-topbar-prompt">~</span>
          <template v-if="categoryName">
            <span class="vcl-topbar-category">{{ categoryName }}</span>
            <span class="vcl-topbar-sep">/</span>
          </template>
          <span v-if="nav.current" class="vcl-topbar-title" :title="navLabel(nav.current.label)">{{
            navLabel(nav.current.label)
          }}</span>
        </template>

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
          <!-- @slot topbar-tools: 顶栏工具栏左端自定义按钮区 -->
          <slot name="topbar-tools" />
        </div>

        <!-- 用户区 -->
        <div class="vcl-topbar-right">
          <!-- @slot topbar-right: 顶栏右侧用户区；不传则回退基于 username 属性的内置头像 + 用户名 -->
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
/* 容器声明必须在 sidebar 与 content-body 的**共同祖先**上：
   容器查询按「查询容器的后代」匹配，此前把它挂在 .content-body，而 .sidebar 是它的兄弟节点，
   @container layout 永远不匹配——移动端抽屉规则整段失效（汉堡按钮点了没反应、侧栏仍占位）。
   挂到根节点后查询宽度 = 视口宽，与 JS 侧 `innerWidth < BP_MD` 的移动端判定同源。 */
.vcl-app-layout {
  display: flex;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  contain: layout style;
  container-type: inline-size;
  container-name: layout;
}

.vcl-sidebar-overlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--vcl-z-sticky, 100) - 10);
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
}

.sidebar {
  width: var(--vcl-sidebar-width);
  min-width: var(--vcl-sidebar-width);
  background: var(--vcl-color-sidebar);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: var(--vcl-z-sticky, 100);
  transition:
    width var(--vcl-transition-normal),
    min-width var(--vcl-transition-normal);
  will-change: width;
  contain: layout style;
}

@container layout (max-width: 767px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(260px * var(--vcl-scale), 85vw);
    transform: translateX(-100%);
    box-shadow: var(--vcl-shadow-lg);
    transition: transform var(--vcl-transition-normal);
  }
  .sidebar.open {
    transform: translateX(0);
  }
  .sidebar.collapsed {
    width: min(260px * var(--vcl-scale), 85vw);
  }
}

.vcl-sidebar-header {
  display: flex;
  align-items: center;
  gap: var(--vcl-space-3);
  padding: var(--vcl-space-5) var(--vcl-space-4);
  min-height: calc(56px * var(--vcl-scale));
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--vcl-color-sidebar-text-active);
}

.sidebar.collapsed {
  width: calc(72px * var(--vcl-scale));
  min-width: calc(72px * var(--vcl-scale));
}
.sidebar.collapsed .vcl-sidebar-header {
  flex-direction: column;
  gap: var(--vcl-space-2);
  justify-content: center;
  padding: var(--vcl-space-4) var(--vcl-space-2);
  min-height: calc(72px * var(--vcl-scale));
}
.sidebar.collapsed .vcl-collapse-btn {
  margin-left: 0;
}

.vcl-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(34px * var(--vcl-scale));
  min-width: calc(34px * var(--vcl-scale));
  height: calc(34px * var(--vcl-scale));
  background: var(--vcl-color-primary);
  border-radius: var(--vcl-radius-md);
  color: white;
  flex-shrink: 0;
}
.vcl-logo-text {
  font-size: calc(15px * var(--vcl-scale));
  font-weight: 600;
  white-space: nowrap;
  letter-spacing: 0.3px;
}

.vcl-collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(26px * var(--vcl-scale));
  height: calc(26px * var(--vcl-scale));
  margin-left: auto;
  padding: 0;
  border: none;
  border-radius: var(--vcl-radius-sm);
  background: transparent;
  color: var(--vcl-color-sidebar-text);
  cursor: pointer;
  transition:
    background var(--vcl-transition-fast),
    color var(--vcl-transition-fast);
  flex-shrink: 0;
}
.vcl-collapse-btn:hover {
  background: var(--vcl-color-sidebar-hover);
  color: var(--vcl-color-sidebar-text-active);
}

.vcl-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--vcl-color-bg);
  padding: var(--vcl-space-2);
}

/* ---- 顶栏 ---- */
.vcl-content-topbar {
  flex-shrink: 0;
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--vcl-space-2);
  padding: var(--vcl-space-3) calc(16px * var(--vcl-scale));
  background:
    linear-gradient(180deg, rgba(var(--vcl-color-primary-rgb), 0.03) 0%, transparent 2px),
    linear-gradient(90deg, rgba(var(--vcl-color-primary-rgb), 0.015) 1px, transparent 1px) 0 0 / 3px 100%,
    var(--vcl-color-sidebar);
  border-radius: var(--vcl-radius-md) var(--vcl-radius-md) 0 0;
  border-bottom: 1px solid rgba(var(--vcl-color-primary-rgb), 0.15);
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
    var(--vcl-color-primary) 20%,
    var(--vcl-color-primary) 50%,
    var(--vcl-color-primary) 80%,
    transparent 100%
  );
  opacity: 0.5;
}
.vcl-topbar-hamburger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(28px * var(--vcl-scale));
  height: calc(28px * var(--vcl-scale));
  margin-right: var(--vcl-space-1);
  border: none;
  border-radius: var(--vcl-radius-sm);
  background: transparent;
  color: var(--vcl-color-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--vcl-transition-fast);
}
.vcl-topbar-hamburger:hover {
  background: rgba(var(--vcl-color-primary-rgb), 0.08);
  color: var(--vcl-color-primary-on-surface);
}
.vcl-topbar-prompt {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: var(--vcl-ctrl-font-size);
  color: var(--vcl-color-primary-on-surface);
  opacity: 0.7;
  margin-right: var(--vcl-space-1);
}
.vcl-topbar-category {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: var(--vcl-ctrl-font-size);
  font-weight: 600;
  color: var(--vcl-color-primary-on-surface);
  letter-spacing: 0.3px;
  /* 分类名被右侧工具挤压时竖排换行（「表单输/入」）——单行 + 不收缩，长标题由 title 出省略号兜底 */
  white-space: nowrap;
  flex-shrink: 0;
}
.vcl-topbar-sep {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: var(--vcl-ctrl-font-size);
  color: var(--vcl-color-text-secondary);
  font-weight: 300;
  white-space: nowrap;
  flex-shrink: 0;
}
.vcl-topbar-title {
  font-size: var(--vcl-ctrl-font-size);
  font-weight: 500;
  color: var(--vcl-color-sidebar-text-active);
  letter-spacing: 0.2px;
  /* 标题过长不换行：空间不足时省略号，绝不竖排 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* 给标题留地板，而不是让它被工具区挤成 0 宽整段消失：
     一个页面连自己叫什么名字都看不见，比省略号难受得多。
     地板取 min(6em, 26%)——窄屏按比例让位，宽屏不抢工具的位。 */
  min-width: min(6em, 26%);
  flex-shrink: 1;
}

/* ---- 顶栏工具 + 用户区 ---- */
.vcl-topbar-spacer {
  flex: 1;
}
.topbar-tools {
  display: flex;
  align-items: center;
  gap: var(--vcl-space-2);
  /* 装不下时收缩为可横向滚动的工具条，而不是被顶栏的 overflow:hidden 裁掉——
     被裁掉的按钮用户既看不见也点不到（实测 360px 下 8 个按钮只有 4 个可达）。
     宽屏空间充足，不触发滚动，观感不变。 */
  flex-shrink: 1;
  min-width: 0;
  overflow-x: auto;
  /* 子元素可引用以下预设类名获得标准工具栏按钮样式：
     .topbar-tool-btn     → 图标按钮（32×32 暗色半透明）
     .topbar-tool-btn.active → 激活态（主色背景描边）
     .topbar-tool-sep     → 按钮组之间的竖线分隔 */
}
.topbar-tools > * {
  flex-shrink: 0; /* 收缩交给容器滚动，按钮自身不被压扁 */
}
.vcl-topbar-right {
  display: flex;
  align-items: center;
  gap: var(--vcl-space-3);
  flex-shrink: 0;
}

/* 工具栏按钮 — 32×32 暗色图标按钮，默认带微弱底色可辨识 */
.topbar-tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(32px * var(--vcl-scale));
  height: calc(32px * var(--vcl-scale));
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.08); /* 微弱亮边，框出按钮区域 */
  border-radius: var(--vcl-radius-sm);
  background: rgba(255, 255, 255, 0.04); /* 默认微白底 — 告知用户这里有功能 */
  color: var(--vcl-color-text-secondary); /* 与 hamburger 一致的暗色图标 */
  cursor: pointer;
  transition: all var(--vcl-transition-fast);
  flex-shrink: 0;
  position: relative;
}
.topbar-tool-btn:hover {
  color: var(--vcl-color-primary-on-surface);
  background: rgba(var(--vcl-color-primary-rgb), 0.08);
  border-color: rgba(var(--vcl-color-primary-rgb), 0.15);
}
.topbar-tool-btn:active {
  transform: scale(0.95);
  background: rgba(var(--vcl-color-primary-rgb), 0.12);
  transition:
    transform var(--vcl-transition-fast),
    background var(--vcl-transition-fast);
}
/* 键盘焦点环 — 保留可访问性 */
.topbar-tool-btn:focus-visible {
  outline: 2px solid var(--vcl-color-primary);
  outline-offset: 2px;
}
/* 激活/选中态 — 有主色边框 + 微亮底色 */
.topbar-tool-btn.active {
  color: #9db1fb; /* 2026-10-01 顶栏恒深色，active 用亮蓝字（原 on-surface 深蓝压深底仅 2.2） */
  background: rgba(var(--vcl-color-primary-rgb), 0.3);
  border-color: rgba(var(--vcl-color-primary-rgb), 0.25);
}
.topbar-tool-btn.active:hover {
  background: rgba(var(--vcl-color-primary-rgb), 0.4);
  border-color: rgba(var(--vcl-color-primary-rgb), 0.35);
}
/* 危险操作变体 — 红色激活 */
.topbar-tool-btn.is-danger:hover {
  color: #fca5a5; /* 2026-10-01 顶栏恒深色，danger hover 用亮红 */
  background: rgba(248, 113, 113, 0.16);
  border-color: rgba(239, 68, 68, 0.2);
}
.topbar-tool-btn.is-danger.active {
  color: var(--vcl-color-danger-on-surface);
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.25);
}

/* 工具栏按钮组之间的竖线分隔 */
.topbar-tool-sep {
  width: 1px;
  height: calc(18px * var(--vcl-scale));
  margin: 0 var(--vcl-space-1);
  background: rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  border-radius: 1px;
}

/* 工具栏文字按钮 — 纯文字标签，与图标按钮并列等高 */
.topbar-tool-text {
  display: flex;
  align-items: center;
  height: calc(32px * var(--vcl-scale));
  padding: 0 var(--vcl-space-3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--vcl-radius-sm);
  background: rgba(255, 255, 255, 0.04);
  color: var(--vcl-color-text-muted);
  font-size: calc(15px * var(--vcl-scale));
  font-weight: 500;
  letter-spacing: 0.2px;
  white-space: nowrap;
  cursor: pointer;
  transition: all var(--vcl-transition-fast);
  flex-shrink: 0;
}
.topbar-tool-text:hover {
  color: var(--vcl-color-sidebar-text-active);
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
}
.topbar-tool-text:active {
  transform: scale(0.97);
  transition: transform var(--vcl-transition-fast);
}
.topbar-tool-text:focus-visible {
  outline: 2px solid var(--vcl-color-primary);
  outline-offset: 2px;
}
/* 文字按钮 — 主色高亮态 */
.topbar-tool-text.active {
  color: #9db1fb; /* 2026-10-01 顶栏恒深色，active 用亮蓝字（原 on-surface 深蓝压深底仅 2.2） */
  background: rgba(var(--vcl-color-primary-rgb), 0.3);
  border-color: rgba(var(--vcl-color-primary-rgb), 0.25);
  font-weight: 600;
}
.topbar-tool-text.active:hover {
  background: rgba(var(--vcl-color-primary-rgb), 0.4);
  border-color: rgba(var(--vcl-color-primary-rgb), 0.35);
}
/* 文字按钮 — 危险红色 */
.topbar-tool-text.is-danger:hover {
  color: #fca5a5; /* 2026-10-01 顶栏恒深色，danger hover 用亮红 */
  background: rgba(248, 113, 113, 0.16);
  border-color: rgba(239, 68, 68, 0.2);
}
.topbar-tool-text.is-danger.active {
  color: var(--vcl-color-danger-on-surface);
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.25);
}

/* 工具栏图标+文字按钮 — 图标左、文字右，与纯图标按钮并列等高 */
.topbar-tool-label {
  display: inline-flex;
  align-items: center;
  gap: var(--vcl-space-2);
  flex-wrap: nowrap; /* 绝不换行 —— 图标和文字始终同排 */
  height: calc(32px * var(--vcl-scale));
  padding: 0 var(--vcl-space-3) 0 var(--vcl-space-2);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--vcl-radius-sm);
  background: rgba(255, 255, 255, 0.04);
  color: var(--vcl-color-text-muted);
  font-size: calc(15px * var(--vcl-scale));
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: all var(--vcl-transition-fast);
  flex-shrink: 0;
}
/* 文字 span：行高=字号，靠 flex align-items:center 居中，避免 line-height 撑高干扰对齐 */
.topbar-tool-label > span {
  line-height: 1;
}
/* SVG 图标：固定 16px，block 消除 inline 基线偏移 */
.topbar-tool-label > svg {
  display: block;
  width: calc(16px * var(--vcl-scale));
  height: calc(16px * var(--vcl-scale));
  flex-shrink: 0;
  /* 2026-10-02 光学补偿：图标字形重心偏上，下移 0.5px 与 CJK 文字视觉中线对齐（盒子本已 align-items:center，此为墨迹级微调） */
  transform: translateY(0.5px);
}
.topbar-tool-label:hover {
  color: var(--vcl-color-sidebar-text-active);
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
}
.topbar-tool-label:hover > svg {
  color: var(--vcl-color-primary-on-surface);
}
.topbar-tool-label:active {
  transform: scale(0.97);
  transition: transform var(--vcl-transition-fast);
}
.topbar-tool-label:focus-visible {
  outline: 2px solid var(--vcl-color-primary);
  outline-offset: 2px;
}
/* 图标+文字按钮 — 主色高亮态 */
.topbar-tool-label.active {
  color: #9db1fb; /* 2026-10-01 顶栏恒深色，active 用亮蓝字（原 on-surface 深蓝压深底仅 2.2） */
  background: rgba(var(--vcl-color-primary-rgb), 0.3);
  border-color: rgba(var(--vcl-color-primary-rgb), 0.25);
  font-weight: 600;
}
.topbar-tool-label.active:hover {
  background: rgba(var(--vcl-color-primary-rgb), 0.4);
  border-color: rgba(var(--vcl-color-primary-rgb), 0.35);
}
/* 图标+文字按钮 — 危险红色 */
.topbar-tool-label.is-danger:hover {
  color: #fca5a5; /* 2026-10-01 顶栏恒深色，danger hover 用亮红 */
  background: rgba(248, 113, 113, 0.16);
  border-color: rgba(239, 68, 68, 0.2);
}
.topbar-tool-label.is-danger:hover > svg {
  color: var(--vcl-color-danger-on-surface);
}
.topbar-tool-label.is-danger.active {
  color: var(--vcl-color-danger-on-surface);
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.25);
}

.vcl-user-info {
  display: flex;
  align-items: center;
  gap: var(--vcl-space-2);
}
.vcl-user-avatar {
  width: calc(28px * var(--vcl-scale));
  height: calc(28px * var(--vcl-scale));
  border-radius: 50%;
  background: var(--vcl-color-primary);
  color: var(--vcl-color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: calc(15px * var(--vcl-scale));
  font-weight: 600;
  line-height: 1;
}
.vcl-user-name {
  font-size: var(--vcl-ctrl-font-size);
  color: var(--vcl-color-text-muted);
  max-width: calc(100px * var(--vcl-scale));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vcl-logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(30px * var(--vcl-scale));
  height: calc(30px * var(--vcl-scale));
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--vcl-radius-md);
  background: rgba(255, 255, 255, 0.03);
  color: var(--vcl-color-text-secondary);
  cursor: pointer;
  transition: all var(--vcl-transition-normal);
}
.vcl-logout-btn:hover {
  color: var(--vcl-color-danger-on-surface);
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.06);
}

/* ---- 内容滚动区 ---- */
.content-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: var(--vcl-color-surface);
  border-left: 1px solid var(--vcl-color-border-light);
  border-right: 1px solid var(--vcl-color-border-light);
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
  padding: var(--vcl-space-2) calc(16px * var(--vcl-scale));
  background:
    linear-gradient(0deg, rgba(var(--vcl-color-primary-rgb), 0.02) 0%, transparent 2px), var(--vcl-color-sidebar);
  border-radius: 0 0 var(--vcl-radius-md) var(--vcl-radius-md);
  border-top: 1px solid rgba(var(--vcl-color-primary-rgb), 0.12);
}
.vcl-nav-btn {
  display: flex;
  align-items: center;
  gap: var(--vcl-space-2);
  padding: calc(7px * var(--vcl-scale)) var(--vcl-space-4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--vcl-radius-md);
  background: rgba(255, 255, 255, 0.03);
  color: var(--vcl-color-sidebar-text);
  font-size: calc(15px * var(--vcl-scale));
  font-weight: 500;
  cursor: pointer;
  transition: all var(--vcl-transition-normal);
}
.vcl-nav-btn:hover {
  color: var(--vcl-color-surface);
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
  max-width: calc(160px * var(--vcl-scale));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vcl-nav-center {
  display: flex;
  align-items: center;
  gap: var(--vcl-space-3);
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: calc(140px * var(--vcl-scale));
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}
.vcl-nav-center:hover .vcl-nav-progress-track {
  height: calc(4px * var(--vcl-scale));
  border-radius: var(--vcl-radius-sm);
}
.vcl-nav-center:hover .vcl-nav-progress {
  box-shadow: 0 0 10px rgba(var(--vcl-color-primary-rgb), 0.6);
}
.vcl-nav-center:active .vcl-nav-progress {
  box-shadow: 0 0 14px rgba(var(--vcl-color-primary-rgb), 0.75);
}
.vcl-nav-progress-track {
  flex: 1;
  height: 2px;
  background: rgba(var(--vcl-color-primary-rgb), 0.12);
  border-radius: var(--vcl-radius-sm);
  transition:
    height var(--vcl-transition-fast),
    border-radius var(--vcl-transition-fast);
  overflow: hidden;
}
.vcl-nav-progress {
  height: 100%;
  background: var(--vcl-color-primary);
  border-radius: var(--vcl-radius-sm);
  box-shadow: 0 0 6px rgba(var(--vcl-color-primary-rgb), 0.4);
  transition:
    width var(--vcl-transition-normal),
    box-shadow var(--vcl-transition-fast);
  pointer-events: none;
}
.vcl-nav-percent {
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-primary-on-surface);
  font-weight: 600;
  opacity: 0.7;
  min-width: calc(32px * var(--vcl-scale));
  text-align: right;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  pointer-events: none;
}

.vcl-fade-enter-active,
.vcl-fade-leave-active {
  transition: opacity var(--vcl-transition-normal);
}
.vcl-fade-enter-from,
.vcl-fade-leave-to {
  opacity: 0;
}
</style>
