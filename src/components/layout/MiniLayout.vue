<script setup lang="ts">
// ⛔ 保护 — 最小化布局骨架，禁止：clamp() → px，结构层级修改
//    需我确认：菜单渲染逻辑、路由匹配规则
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'

interface TabItem {
  name: string
  label: string
  icon: string
  route: string
}

interface ScanType {
  name: string
  label: string
  icon: string
  color: string
}

const tabs: TabItem[] = [
  { name: 'home', label: '首页', icon: 'house', route: '/mini/home' },
  { name: 'category', label: '分类', icon: 'grid3x3', route: '/mini/category' },
  { name: 'favorites', label: '收藏', icon: 'heart', route: '/mini/favorites' },
  { name: 'profile', label: '我的', icon: 'user', route: '/mini/profile' },
]

const scanTypes: ScanType[] = [
  { name: 'inbound', label: '入库扫码', icon: 'download', color: '#4F6EF7' },
  { name: 'outbound', label: '出库扫码', icon: 'upload', color: '#F59E0B' },
  { name: 'check', label: '盘点扫码', icon: 'circle-check', color: '#22AD5F' },
  { name: 'transfer', label: '调拨扫码', icon: 'rotate-cw', color: '#8B5CF6' },
  { name: 'query', label: '扫码查询', icon: 'search', color: '#06B6D4' },
]

const router = useRouter()
const route = useRoute()

// 子页面模式：route.meta.subPage = true 时隐藏 TabBar + 显示返回头
const isSubPage = computed(() => route.meta.subPage === true)
const pageTitle = computed(() => (route.meta.title as string) || '')

const activeTab = computed(() => {
  const path = route.path
  const found = tabs.find(t => path.startsWith(t.route))
  return found?.name || 'home'
})

function goTab(tab: TabItem) {
  if (activeTab.value !== tab.name) router.push(tab.route)
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/mini/home')
  }
}

const showScan = ref(false)

function openScan() {
  showScan.value = true
}

function selectScan(type: ScanType) {
  showScan.value = false
  router.push(`/mini/scan/${type.name}`)
}

/* 安全区适配 */
const safeBottom = ref('env(safe-area-inset-bottom, 0px)')
</script>

<template>
  <div class="mini-layout">
    <!-- 子页面模式：返回头 -->
    <header v-if="isSubPage" class="sub-header">
      <button class="back-btn" @click="goBack" aria-label="返回">
        <IconSvg type="arrow-left" size="md" />
      </button>
      <span class="sub-title">{{ pageTitle }}</span>
      <span class="sub-spacer" />
    </header>

    <!-- Tab 模式：搜索栏 -->
    <div v-else class="search-bar">
      <IconSvg type="search" size="sm" />
      <input
        type="text"
        class="search-input"
        placeholder="搜索商品/订单..."
        @focus="router.push('/mini/products')"
        readonly
      />
      <a href="#/button" class="back-to-pc" title="返回PC组件库">← 组件库</a>
    </div>

    <!-- 内容区 -->
    <main class="mini-content">
      <RouterView />
    </main>

    <!-- Tab 模式：底部 TabBar -->
    <nav v-if="!isSubPage" class="mini-tabbar" :style="{ paddingBottom: safeBottom }">
      <button
        v-for="tab in tabs.slice(0, 2)"
        :key="tab.name"
        class="tab-item"
        :class="{ active: activeTab === tab.name }"
        @click="goTab(tab)"
      >
        <IconSvg :type="tab.icon" size="md" />
        <span class="tab-label">{{ tab.label }}</span>
      </button>
      <!-- 中间扫码 -->
      <div class="scan-spot">
        <button class="scan-btn" @click="openScan" aria-label="扫码">
          <IconSvg type="plus" size="lg" color="white" />
        </button>
      </div>
      <button
        v-for="tab in tabs.slice(2)"
        :key="tab.name"
        class="tab-item"
        :class="{ active: activeTab === tab.name }"
        @click="goTab(tab)"
      >
        <IconSvg :type="tab.icon" size="md" />
        <span class="tab-label">{{ tab.label }}</span>
      </button>
    </nav>

    <!-- 扫码类型选择 -->
    <!-- #ifndef MP_WEIXIN -->
    <Teleport to="body">
    <!-- #endif -->
      <Transition name="sheet">
        <div v-if="showScan" class="scan-overlay" @click.self="showScan = false">
          <div class="scan-sheet">
            <div class="sheet-title">选择扫码类型</div>
            <div class="sheet-grid">
              <button
                v-for="st in scanTypes" :key="st.name"
                class="scan-type-btn"
                @click="selectScan(st)"
              >
                <div class="scan-type-icon" :style="{ background: st.color }">
                  <IconSvg :type="st.icon" size="md" color="white" />
                </div>
                <span class="scan-type-label">{{ st.label }}</span>
              </button>
            </div>
            <button class="sheet-cancel" @click="showScan = false">取消</button>
          </div>
        </div>
      </Transition>
    <!-- #ifndef MP_WEIXIN -->
    </Teleport>
    <!-- #endif -->
  </div>
</template>

<style scoped>
.mini-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: clamp(340px, 44vw, 540px);
  margin: 0 auto;
  background: var(--color-bg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

/* 子页面返回头 */
.sub-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 var(--space-2);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border-light);
}
.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.back-btn:hover { background: var(--color-bg-alt); }
.sub-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  text-align: center;
}
.sub-spacer { width: 36px; }

/* 搜索栏 */
.search-bar {
  flex-shrink: 0;
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) 12px;
  background: var(--color-surface);
  color: var(--color-text-muted);
}
.search-input {
  flex: 1; border: none; background: var(--color-bg);
  border-radius: 20px; padding: var(--space-2) 12px;
  font-size: 13px; outline: none; color: var(--color-text);
  cursor: pointer;
}
.search-input::placeholder { color: var(--color-text-muted); }
.back-to-pc {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--color-primary);
  text-decoration: none;
  padding: var(--space-1) 8px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  opacity: 0.6;
  transition: opacity var(--transition-fast);
}
.back-to-pc:hover { opacity: 1; }

.mini-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.mini-tabbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border-light);
  padding-top: var(--space-1);
  min-height: 50px;
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) 0;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color var(--transition-fast);
  font-family: inherit;
}
.tab-item.active {
  color: var(--color-primary);
}
.tab-label {
  font-size: 10px;
  font-weight: 500;
}

/* 中间扫码按钮位 */
.scan-spot {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
}
.scan-btn {
  display: flex; align-items: center; justify-content: center;
  width: 44px; height: 44px;
  margin-top: -14px;
  border: 4px solid var(--color-bg);
  border-radius: 50%;
  background: var(--color-primary);
  box-shadow: 0 2px 12px rgba(79,110,247,0.35);
  cursor: pointer; transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.scan-btn:hover { transform: scale(1.08); box-shadow: 0 4px 18px rgba(79,110,247,0.45); }

/* 扫码选择弹层 */
.scan-overlay {
  position: fixed; inset: 0; z-index: var(--z-overlay, 1500); /* 全屏遮罩：高于弹窗(modal 1000)、低于下拉(dropdown 2000) */
  display: flex; align-items: flex-end;
  background: rgba(0,0,0,0.35);
  backdrop-filter: blur(2px);
}
.scan-sheet {
  width: clamp(320px, 88vw, 540px); margin: 0 auto;
  background: var(--color-surface);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding: var(--space-5) 16px calc(16px + env(safe-area-inset-bottom, 0px));
}
.sheet-title {
  font-size: 15px; font-weight: 600; color: var(--color-text);
  text-align: center; margin-bottom: var(--space-4);
}
.sheet-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.scan-type-btn {
  display: flex; flex-direction: column; align-items: center; gap: var(--space-2);
  padding: var(--space-3) 8px; border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md); background: var(--color-bg);
  cursor: pointer; transition: all var(--transition-fast); font-family: inherit;
}
.scan-type-btn:hover { border-color: var(--color-primary); background: var(--color-primary-light); }
.scan-type-icon {
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; border-radius: 50%;
}
.scan-type-label { font-size: 12px; color: var(--color-text-secondary); font-weight: 500; }
.sheet-cancel {
  width: 100%; padding: var(--space-3); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); background: var(--color-surface);
  font-size: 14px; color: var(--color-text-secondary);
  cursor: pointer; transition: background var(--transition-fast); font-family: inherit;
}
.sheet-cancel:hover { background: var(--color-bg-alt); }

/* 弹层动画 */
.sheet-enter-active { transition: all var(--transition-normal); }
.sheet-leave-active { transition: all var(--transition-fast); }
.sheet-enter-from .scan-sheet,
.sheet-leave-to .scan-sheet { transform: translateY(100%); }
.sheet-enter-from { opacity: 0; }
.sheet-leave-to { opacity: 0; }
</style>
