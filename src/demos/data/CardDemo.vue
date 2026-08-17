<script setup lang="ts">
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'

const stats = [
  { value: '12,847', label: '总用户数', icon: 'user', trend: 12 },
  { value: '¥89,400', label: '本月收入', icon: 'star', trend: 8, color: 'var(--color-success)' },
  { value: '342', label: '订单数', icon: 'package', trend: -3 },
  { value: '98.5%', label: '系统可用率', icon: 'shield', trend: 0.5, color: 'var(--color-success)' },
]
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Card 卡片</h2>
    <p class="demo-desc">
      <code>type="stat"</code> 统计数值卡片 | <code>type="grid"</code> 通用容器卡片（默认）。
      支持 <code>highlight</code>、<code>summary</code>、header/body/footer 三段结构。
    </p>

    <!-- stat 模式 -->
    <h3 style="font-size:16px;font-weight:600;margin-bottom:16px;">stat — 统计卡片</h3>
    <Card v-for="s in stats" :key="s.label" type="stat" :value="s.value" :label="s.label" :icon="s.icon" :trend="s.trend" :color="s.color" style="margin-bottom:12px" />

    <div style="display:grid;grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-bottom: 32px;">
      <Card type="stat" value="12,847" label="总用户数" icon="user" trend="12" />
      <Card type="stat" value="¥89,400" label="本月收入" icon="star" trend="8" color="var(--color-success)" />
      <Card type="stat" value="342" label="订单数" icon="box" trend="-3" />
      <Card type="stat" value="98.5%" label="系统可用率" icon="shield" trend="0.5" color="var(--color-success)" />
    </div>

    <!-- grid 模式 -->
    <h3 style="font-size:16px;font-weight:600;margin-bottom:16px;">grid — 通用容器卡片</h3>
    <div class="grid-2-col">
      <Card title="基础卡片">
        <p style="color:var(--color-text-secondary);">带 header + body + footer 三段结构。</p>
        <template #footer>
          <div style="display:flex;justify-content:flex-end;gap:8px;">
            <Button text="取消" variant="ghost" size="sm" />
            <Button text="保存" variant="primary" size="sm" />
          </div>
        </template>
      </Card>

      <Card title="高亮卡片" highlight>
        <p style="color:var(--color-text-secondary);">蓝色边框高亮，用于重点区域。</p>
      </Card>

      <Card title="汇总模式" summary>
        <p style="color:var(--color-text);font-weight:600;">总金额: ¥128,400</p>
        <p style="color:var(--color-text-muted);font-size:12px;">summary 模式：蓝色浅底，无边框</p>
      </Card>

      <Card>
        <p style="color:var(--color-text-muted);">无 title 模式：纯内容，无 header。</p>
      </Card>
    </div>

    <Card title="Props" style="margin-top:24px;">
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <tr style="border-bottom:2px solid var(--color-border);text-align:left;"><th style="padding:4px 8px;">Prop</th><th style="padding:4px 8px;">默认</th><th style="padding:4px 8px;">说明</th></tr>
        <tr><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>type</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">grid</td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">grid | stat</td></tr>
        <tr><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>title</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">—</td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">卡片标题（grid 模式）</td></tr>
        <tr><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>highlight</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">false</td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">高亮边框</td></tr>
        <tr><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>summary</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">false</td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">汇总模式</td></tr>
        <tr><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>icon</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">—</td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">图标名（stat 模式）</td></tr>
        <tr><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>label</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">—</td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">标签文字（stat 模式）</td></tr>
        <tr><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>color</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">—</td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">图标颜色（stat 模式）</td></tr>
        <tr><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>value</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">—</td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">统计数值（stat 模式）</td></tr>
        <tr><td style="padding:3px 8px;"><code>trend</code></td><td style="padding:3px 8px;">—</td><td style="padding:3px 8px;">趋势百分比（stat 模式）</td></tr>
      </table>
    </Card>
  </div>
</template>

<style scoped>
.demo-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
.demo-desc { color: var(--color-text-muted); margin-bottom: 24px; font-size: 14px; line-height: 1.6; }
code { background: var(--color-bg-alt); padding: 1px 5px; border-radius: 3px; font-size: 12px; }
</style>
