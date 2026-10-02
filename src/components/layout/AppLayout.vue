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

<style src="./app-layout.css"></style>
