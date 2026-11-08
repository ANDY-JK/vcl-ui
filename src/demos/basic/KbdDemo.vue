<script setup lang="ts">
// KbdDemo — 快捷键标记演示
// 重点：能不能塞进表格行/菜单行而不撑高（密排的核心验收点）
import { ref } from 'vue'
import Kbd from '@/components/basic/Kbd.vue'

const last = ref('—')

const shortcuts = [
  { label: '快速搜索', key: 'Mod+K' },
  { label: '保存当前表单', key: 'Mod+S' },
  { label: '撤销上一步', key: 'Mod+Z' },
  { label: '关闭面板', key: 'Esc' },
]
</script>

<template>
  <div class="demo-container">
    <h1>Kbd 快捷键标记</h1>
    <p class="desc">统一快捷键的键帽字形与尺寸。<code>Mod</code> 会按平台展开（macOS → ⌘，其余 → Ctrl）。</p>

    <section class="demo-section">
      <h2>基础</h2>
      <p>
        <Kbd keys="Ctrl+K" />
        <Kbd keys="Mod+S" />
        <Kbd keys="Mod+Shift+P" />
        <Kbd keys="Esc" />
        <Kbd keys="Enter" />
      </p>
      <p class="result">分隔符可关：<Kbd :keys="['Ctrl', 'K']" sep="" /></p>
    </section>

    <section class="demo-section">
      <h2>两档尺寸</h2>
      <p><Kbd keys="Mod+K" size="sm" /> <span class="hint">sm —— 行内用</span></p>
      <p><Kbd keys="Mod+K" size="md" /> <span class="hint">md —— 常规</span></p>
    </section>

    <section class="demo-section">
      <h2>塞进列表行（密排验收：行高不应变化）</h2>
      <ul class="rows">
        <li v-for="(item, i) in shortcuts" :key="i" class="row" @click="last = item.label">
          <span class="row-label">{{ item.label }}</span>
          <Kbd :keys="item.key" size="sm" />
        </li>
      </ul>
      <p class="result">最近点击：{{ last }}</p>
    </section>
  </div>
</template>

<style scoped>
.hint {
  font-size: var(--vcl-text-caption-size);
  line-height: var(--vcl-text-caption-line);
  color: var(--vcl-color-text-muted);
  margin-inline-start: var(--vcl-space-2);
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  max-width: calc(320px * var(--vcl-scale));
  border: 1px solid var(--vcl-color-border-light);
  border-radius: var(--vcl-radius-md);
  overflow: hidden;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--vcl-space-3);
  padding: calc(6px * var(--vcl-scale)) var(--vcl-space-3);
  border-bottom: 1px solid var(--vcl-color-border-light);
  cursor: pointer;
}
.row:last-child {
  border-bottom: none;
}
@media (hover: hover) {
  .row:hover {
    background: var(--vcl-color-bg-alt);
  }
}
.row-label {
  font-size: var(--vcl-text-label-size);
  line-height: var(--vcl-text-label-line);
}
</style>
