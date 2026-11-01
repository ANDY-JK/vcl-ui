<script setup lang="ts">
// ⛔ 保护 — 面包屑，禁止：clamp() → px，RouterLink 路径逻辑
//    需我确认：separator 分隔符、item 接口字段
import { RouterLink } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'
import type { Crumb } from './types'

export type { Crumb }

interface Props {
  /** 面包屑列表（Crumb：label + 可选 path/to，有路径则渲染为路由链接） */
  items: Crumb[]
  /** 自定义分隔符文本；不传时使用 chevron 图标 */
  separator?: string
}

withDefaults(defineProps<Props>(), {})

/** 判断是否使用 router-link：path/to 是 hash 路由（/#/xxx 或 /xxx 开头） */
function isRouteLink(p: string) {
  return p.startsWith('#') || p.startsWith('/')
}

function normalizeTo(p: string): string {
  const cleaned = p.replace(/^#/, '')
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`
}

/** 绝对 http(s) 链接：新标签页打开，避免 SPA 内丢失应用状态 */
function isExternalHttp(p: string) {
  return /^https?:\/\//i.test(p)
}
</script>

<template>
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <template v-for="(item, idx) in items" :key="idx">
      <RouterLink
        v-if="(item.path || item.to) && isRouteLink((item.path || item.to)!)"
        class="crumb-link"
        :to="normalizeTo((item.path || item.to)!)"
      >
        {{ item.label }}
      </RouterLink>
      <a
        v-else-if="item.path || item.to"
        class="crumb-link"
        :href="(item.path || item.to)!"
        :target="isExternalHttp((item.path || item.to)!) ? '_blank' : undefined"
        :rel="isExternalHttp((item.path || item.to)!) ? 'noopener' : undefined"
        >{{ item.label }}</a
      >
      <span v-else class="crumb-current" aria-current="page">{{ item.label }}</span>
      <span v-if="separator && idx < items.length - 1" class="crumb-sep-text">{{ separator }}</span>
      <IconSvg v-else-if="idx < items.length - 1" type="chevron-right" size="sm" class="crumb-sep" />
    </template>
  </nav>
</template>

<style scoped>
.breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--vcl-space-2);
  font-size: calc(15px * var(--vcl-scale));
  flex-wrap: wrap;
}

.crumb-link {
  color: var(--vcl-color-text-muted);
  text-decoration: none;
  transition: color var(--vcl-transition-fast);
}
@media (hover: hover) {
  .crumb-link:hover {
    color: var(--vcl-color-primary-on-surface);
  }
}

.crumb-current {
  color: var(--vcl-color-text);
  font-weight: 500;
}

.crumb-sep {
  color: var(--vcl-color-text-muted);
  flex-shrink: 0;
}

.crumb-sep-text {
  color: var(--vcl-color-text-muted);
  flex-shrink: 0;
}
</style>
