<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { navTree, type NavNode } from '@/components/layout/utils/navData'
import { useFormNav } from '@/components/form-builder/useFormNav'
import { encodeShareId } from '@/components/form-builder/designer/share'

/* ---- topbar-tools 示例：工具栏按钮状态 ---- */
const notifActive = ref(false)
const searchOpen = ref(false)
const editMode = ref(false)

/* 显示缩放已全量动态化（2026-09-30）：--vcl-scale = 可视宽度/1920 连续等比，
   无固定段、无手动旋钮——tokens.css 单一真源，这里不再有任何显示尺寸逻辑。 */

/* ══════════════════════════════════════════════════════════════════════
   动态导航演示：用户自建的表单自动成为导航项
   ──────────────────────────────────────────────────────────────────────
   产品形态就是这样：外壳只提供「一个低代码入口 + 一条动态分组」，
   其余导航项由用户在设计器里自建，宿主不写死任何一条表单路由。

   数据来源是 useFormNav() → FormStore.listForms()。示例站用本地库；
   接自己的数据库只需把 FormStore 换成 createRestFormStore({ baseUrl })，
   这里一行都不用改——导航跟着 store 走，与数据从哪来无关。
   ══════════════════════════════════════════════════════════════════════ */
const route = useRoute()
const { items: formNavItems, refresh: refreshFormNav } = useFormNav({
  // 示例站路由是短链 `#/form/S.<formId>`；宿主有自己的约定就用 toPath 完全接管
  toPath: (form) => `/form/${encodeShareId(form.id)}`,
})

// 用户在设计器里新建/改名/删除表单后回到外壳时同步一次（demo 拿路由变化当触发点；
// 真实宿主可以在保存成功的回调里直接 await refresh()）
watch(
  () => route.path,
  () => {
    void refreshFormNav()
  },
)

/** 静态组件导航 + 一条动态分组 */
const navItems = computed<NavNode[]>(() => [
  ...navTree,
  {
    label: '我创建的表单',
    children: formNavItems.value.length
      ? formNavItems.value.map((i) => ({ label: `「${i.label}」`, route: i.path }))
      : [{ label: '（还没有表单，去设计器建一个）', route: '/form-builder' }],
  },
])
</script>

<template>
  <AppLayout :nav-items="navItems">
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
