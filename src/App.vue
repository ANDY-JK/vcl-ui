<script setup lang="ts">
import { ref } from 'vue'
import AppLayout from '@/components/layout/AppLayout.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { navTree } from '@/components/layout/utils/navData'

/* ---- topbar-tools 示例：工具栏按钮状态 ---- */
const notifActive = ref(false)
const searchOpen = ref(false)
const editMode = ref(false)

/* 显示缩放已全量动态化（2026-09-30）：--vcl-scale = 可视宽度/1920 连续等比，
   无固定段、无手动旋钮——tokens.css 单一真源，这里不再有任何显示尺寸逻辑。 */
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
