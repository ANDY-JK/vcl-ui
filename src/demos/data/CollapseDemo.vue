<script setup lang="ts">
import Collapse from '@/components/data/Collapse.vue'
import Card from '@/components/data/Card.vue'
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Collapse 折叠面板</h2>
    <p class="demo-desc">可展开/折叠的内容面板，支持默认展开和禁用。</p>

    <Card title="Collapse 折叠面板">
      <div style="display:flex;flex-direction:column;gap:8px;">
        <Collapse title="什么是 Vue？">
          <p style="color:var(--color-text-secondary);">Vue 是一套用于构建用户界面的渐进式 JavaScript 框架。</p>
        </Collapse>
        <Collapse title="什么是对比度？" open>
          <p style="color:var(--color-text-secondary);">对比度指文本颜色与背景色之间的亮度差异，WCAG 要求至少 4.5:1。</p>
        </Collapse>
        <Collapse title="禁用状态" disabled>
          <p>此面板不可展开</p>
        </Collapse>
      </div>
    </Card>

    <Card title="Props">
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <tr style="border-bottom:2px solid var(--color-border);text-align:left;"><th style="padding:4px 8px;">Prop</th><th style="padding:4px 8px;">类型</th><th style="padding:4px 8px;">默认</th><th style="padding:4px 8px;">说明</th></tr>
        <tr><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>title</code></td><td style="padding:3px 8px;">string</td><td style="padding:3px 8px;">—</td><td style="padding:3px 8px;">面板标题</td></tr>
        <tr><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>open</code></td><td style="padding:3px 8px;">boolean</td><td style="padding:3px 8px;">false</td><td style="padding:3px 8px;">默认展开</td></tr>
        <tr><td style="padding:3px 8px;"><code>disabled</code></td><td style="padding:3px 8px;">boolean</td><td style="padding:3px 8px;">false</td><td style="padding:3px 8px;">禁用展开</td></tr>
      </table>
    </Card>
  </div>
</template>

<style scoped>
.demo-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
.demo-desc { color: var(--color-text-muted); margin-bottom: 24px; font-size: 14px; }
code { background: var(--color-bg-alt); padding: 1px 5px; border-radius: 3px; font-size: 12px; }
</style>
