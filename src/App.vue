<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import MiniLayout from '@/components/layout/MiniLayout.vue'
import IconSvg from '@/components/basic/IconSvg.vue'

const route = useRoute()
const isMini = computed(() => route.path.startsWith('/mini'))

/* ---- topbar-tools 示例：工具栏按钮状态 ---- */
const notifActive = ref(false)
const searchOpen = ref(false)
const editMode = ref(false)
</script>

<template>
  <MiniLayout v-if="isMini" />
  <AppLayout v-else>
    <!-- 工具栏按钮示例 — 三种变体全量展示 -->
    <template #topbar-tools>
      <!-- 纯图标 -->
      <button class="topbar-tool-btn" :class="{ active: searchOpen }" title="搜索" @click="searchOpen = !searchOpen">
        <IconSvg type="search" size="sm" />
      </button>
      <button class="topbar-tool-btn" :class="{ active: notifActive }" title="通知" @click="notifActive = !notifActive">
        <IconSvg type="bell" size="sm" />
      </button>
      <button class="topbar-tool-btn" title="主题切换">
        <IconSvg type="moon" size="sm" />
      </button>

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
