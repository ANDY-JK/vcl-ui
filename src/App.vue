<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppLayout from '@/components/layout/AppLayout.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { navTree } from '@/components/layout/utils/navData'

/* ---- topbar-tools 示例：工具栏按钮状态 ---- */
const notifActive = ref(false)
const searchOpen = ref(false)
const editMode = ref(false)

/* ---- 显示缩放 — 小分辨率设备的用户旋钮 ----
   乘进 tokens.css 的 --vcl-scale（经 --vcl-zoom），默认 1 不动曲线；
   另一台小屏电脑在顶栏调一次，localStorage 按设备记忆即永久生效。
   档位必须与 ZOOM_OPTIONS 同源，避免下拉值与落盘值两处漂移。 */
const ZOOM_KEY = 'vcl-zoom'
const ZOOM_OPTIONS = [0.75, 0.8, 0.85, 0.9, 1, 1.1] as const
const zoom = ref(1)

function applyZoom(v: number): void {
  zoom.value = v
  document.documentElement.style.setProperty('--vcl-zoom', String(v))
  try {
    localStorage.setItem(ZOOM_KEY, String(v))
  } catch {
    // 隐私模式 / 配额满：记不住不影响本次会话
  }
}

onMounted(() => {
  let saved = NaN
  try {
    saved = parseFloat(localStorage.getItem(ZOOM_KEY) || '')
  } catch {
    // 无 Storage 环境：用默认 1
  }
  applyZoom((ZOOM_OPTIONS as readonly number[]).includes(saved) ? saved : 1)
})
</script>

<template>
  <AppLayout :nav-items="navTree">
    <!-- 工具栏按钮示例 — 三种变体全量展示 -->
    <template #topbar-tools>
      <!-- 纯图标 -->
      <button class="topbar-tool-btn" :class="{ active: searchOpen }" title="搜索" @click="searchOpen = !searchOpen">
        <IconSvg type="search" size="sm" />
      </button>
      <button class="topbar-tool-btn" :class="{ active: notifActive }" title="通知" @click="notifActive = !notifActive">
        <IconSvg type="bell" size="sm" />
      </button>
      <RouterLink class="topbar-tool-btn" to="/theme-editor" title="主题定制">
        <IconSvg type="moon" size="sm" />
      </RouterLink>

      <span class="topbar-tool-sep" />

      <!-- 显示缩放 — 全站等比（小分辨率设备调低一档即可获得"成比例"的观感） -->
      <label class="topbar-zoom" title="显示缩放：全站等比缩放，按设备记忆">
        <span class="topbar-zoom-label">缩放</span>
        <select
          :value="zoom"
          aria-label="显示缩放"
          @change="applyZoom(parseFloat(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="z in ZOOM_OPTIONS" :key="z" :value="z">{{ Math.round(z * 100) }}%</option>
        </select>
      </label>

      <span class="topbar-tool-sep" />

      <!-- 纯文字 -->
      <button class="topbar-tool-text" :class="{ active: editMode }" @click="editMode = !editMode">编辑</button>
      <button class="topbar-tool-text is-danger">删除</button>

      <span class="topbar-tool-sep" />

      <!-- 图标 + 文字 -->
      <button class="topbar-tool-label" title="导出">
        <IconSvg type="download" size="sm" />
        <span>导出</span>
      </button>
      <button class="topbar-tool-label active" title="预览">
        <IconSvg type="eye" size="sm" />
        <span>预览</span>
      </button>

      <span class="topbar-tool-sep" />

      <button class="topbar-tool-btn" title="帮助">
        <IconSvg type="help-circle" size="sm" />
      </button>
    </template>
  </AppLayout>
</template>

<style scoped>
/* 缩放控件 — 与 topbar-tool-* 同一暗色质感（32px 高、微白底、亮边框） */
.topbar-zoom {
  display: flex;
  align-items: center;
  gap: var(--vcl-space-1);
  height: calc(32px * var(--vcl-scale));
  color: var(--vcl-color-text-secondary);
  font-size: calc(12px * var(--vcl-scale));
  flex-shrink: 0;
}
.topbar-zoom select {
  height: 100%;
  padding: 0 var(--vcl-space-2);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--vcl-radius-sm);
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  font-size: inherit;
  cursor: pointer;
  transition: border-color var(--vcl-transition-fast);
}
.topbar-zoom select:hover {
  border-color: rgba(var(--vcl-color-primary-rgb), 0.15);
}
.topbar-zoom select:focus-visible {
  outline: 2px solid var(--vcl-color-primary);
  outline-offset: 1px;
}
</style>
