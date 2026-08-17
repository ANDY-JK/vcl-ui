<script setup lang="ts">
import { ref } from 'vue'
import Button from '@/components/basic/Button.vue'
import Card from '@/components/data/Card.vue'

const loading = ref(false)

function simulateLoading() {
  loading.value = true
  setTimeout(() => { loading.value = false }, 1500)
}
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Button 按钮</h2>
    <p class="demo-desc">五种变体 + 三种尺寸 + 加载/禁用/图标/箭头状态。</p>

    <!-- 变体 -->
    <Card title="按钮变体 (Variants)" style="margin-bottom: 24px">
      <div class="demo-row">
        <Button text="Primary 主按钮" variant="primary" />
        <Button text="Secondary 次按钮" variant="secondary" />
        <Button text="Outline 描边" variant="outline" />
        <Button text="Danger 危险" variant="danger" />
        <Button text="Ghost 幽灵" variant="ghost" />
      </div>
    </Card>

    <!-- 尺寸 -->
    <Card title="按钮尺寸 (Sizes)" style="margin-bottom: 24px">
      <div class="demo-row">
        <Button text="Small 小" size="sm" variant="primary" />
        <Button text="Medium 中" size="md" variant="primary" />
        <Button text="Large 大" size="lg" variant="primary" />
      </div>
    </Card>

    <!-- 状态组合 -->
    <Card title="状态组合" style="margin-bottom: 24px">
      <div class="demo-row">
        <Button text="带图标" variant="primary" icon="plus" />
        <Button text="带箭头" variant="outline" showArrow />
        <Button text="通栏宽度" variant="primary" block />
        <Button text="加载中..." variant="primary" :loading="loading" @click="simulateLoading" />
        <Button text="禁用状态" variant="primary" disabled />
        <Button icon="trash" variant="danger" size="sm" />
        <Button text="仅图标+文字" variant="secondary" icon="settings" />
      </div>
    </Card>

    <Card title="Props">
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <thead><tr style="border-bottom:2px solid var(--color-border);text-align:left;">
          <th style="padding:6px 8px;">Prop</th><th style="padding:6px 8px;">类型</th><th style="padding:6px 8px;">默认值</th><th style="padding:6px 8px;">说明</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);"><code>text</code></td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">string</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">—</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">按钮文字</td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);"><code>variant</code></td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">'primary'</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">按钮变体</td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);"><code>size</code></td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">'sm' | 'md' | 'lg'</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">'md'</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">按钮尺寸</td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);"><code>icon</code></td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">string</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">—</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">图标名</td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);"><code>showArrow</code></td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">boolean</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">false</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">显示右侧箭头</td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);"><code>block</code></td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">boolean</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">false</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">通栏宽度</td></tr>
          <tr><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);"><code>loading</code></td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">boolean</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">false</td><td style="padding:6px 8px;border-bottom:1px solid var(--color-border-light);">加载中状态</td></tr>
          <tr><td style="padding:6px 8px;"><code>disabled</code></td><td style="padding:6px 8px;">boolean</td><td style="padding:6px 8px;">false</td><td style="padding:6px 8px;">禁用状态</td></tr>
        </tbody>
      </table>
    </Card>
  </div>
</template>

<style scoped>
.demo { }
.demo-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
.demo-desc { color: var(--color-text-muted); margin-bottom: 24px; font-size: 14px; }
.demo-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
</style>
