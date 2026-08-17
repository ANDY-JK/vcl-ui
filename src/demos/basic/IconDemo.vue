<script setup lang="ts">
import { ref } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import IconPicker from '@/components/form/IconPicker.vue'
import Card from '@/components/data/Card.vue'

/* 尺寸展示 */
const sizes: Array<{ label: string; value: 'xs' | 'sm' | 'md' | 'lg' | 'xl' }> = [
  { label: 'xs (12px)', value: 'xs' },
  { label: 'sm (16px)', value: 'sm' },
  { label: 'md (20px)', value: 'md' },
  { label: 'lg (24px)', value: 'lg' },
  { label: 'xl (28px)', value: 'xl' },
]

/* 常用图标快捷展示 */
const commonIcons = [
  'home', 'search', 'plus', 'x', 'check', 'chevron-down', 'chevron-right',
  'bell', 'settings', 'user', 'mail', 'calendar', 'clock', 'trash',
  'download', 'eye', 'star', 'heart', 'file', 'folder', 'menu', 'more-vertical',
]
const iconColor = ref('#6366F1')

/* IconPicker */
const pickerIcon1 = ref('house')
const pickerIcon2 = ref('settings')
const pickerIcon3 = ref('user')
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Icon 图标</h2>
    <p class="demo-desc">
      Lucide（1704 个，默认）和 Solar（Apple 风格，MIT 协议）双图标集。单图标渲染用 IconSvg，图标选择器用 IconPicker。
    </p>

    <!-- ══════════════ IconSvg 单图标渲染 ══════════════ -->
    <Card title="Solar 图标（Apple 风格）" style="margin-bottom: 24px">
      <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:12px;">
        Solar 图标集（MIT 协议）通过 <code>provider="solar"</code> 渲染，默认使用 <code>-linear</code> 变体。
      </p>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <IconSvg type="home" provider="solar" size="xl" color="#6366F1" />
        <IconSvg type="magnifer" provider="solar" size="xl" color="#6366F1" />
        <IconSvg type="bell" provider="solar" size="xl" color="#6366F1" />
        <IconSvg type="star" provider="solar" size="xl" color="#6366F1" />
        <IconSvg type="chat-round-dots" provider="solar" size="xl" color="#6366F1" />
        <IconSvg type="settings" provider="solar" size="xl" color="#6366F1" />
        <IconSvg type="calendar" provider="solar" size="xl" color="#6366F1" />
        <IconSvg type="lock" provider="solar" size="xl" color="#6366F1" />
      </div>
    </Card>

    <Card title="尺寸" style="margin-bottom: 24px">
      <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
        <div v-for="s in sizes" :key="s.value" style="display:flex;flex-direction:column;align-items:center;gap:6px;">
          <IconSvg type="star" :size="s.value" :color="iconColor" />
          <span style="font-size:11px;color:var(--color-text-muted);">{{ s.label }}</span>
        </div>
      </div>
    </Card>

    <Card title="颜色自定义" style="margin-bottom: 24px">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <IconSvg type="heart" size="xl" :color="iconColor" />
        <input type="color" :value="iconColor" @input="iconColor = ($event.target as HTMLInputElement).value" style="width:36px;height:36px;border:none;border-radius:var(--radius-sm);cursor:pointer;padding:0;" />
        <div style="display:flex;gap:6px;">
          <button
            v-for="c in ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4']"
            :key="c"
            :style="{ background: c, borderColor: iconColor === c ? 'var(--color-text)' : 'transparent', transform: iconColor === c ? 'scale(1.2)' : 'none' }"
            style="width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;transition:all var(--transition-fast);"
            @click="iconColor = c"
          />
        </div>
      </div>
    </Card>

    <Card title="常用图标速查" style="margin-bottom:24px">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;">
        <div
          v-for="name in commonIcons"
          :key="name"
          style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px;border:1px solid var(--color-border-light);border-radius:var(--radius-md);font-size:10px;color:var(--color-text-secondary);"
        >
          <IconSvg :type="name" size="md" color="var(--color-text)" />
          <span>{{ name }}</span>
        </div>
      </div>
    </Card>

    <!-- ══════════════ IconPicker 图标选择器 ══════════════ -->
    <Card title="IconPicker 图标选择器 — Lucide 图标库" style="margin-bottom:24px">
      <IconPicker v-model="pickerIcon1" placeholder="选择图标" />
      <p style="margin-top:6px;font-size:12px;color:var(--color-text-muted);">当前选择：{{ pickerIcon1 || '无' }}</p>
    </Card>

    <Card title="IconPicker — 带预设颜色" style="margin-bottom:24px">
      <IconPicker v-model="pickerIcon2" placeholder="选择图标" :preset-colors="['#4F6EF7', '#00B96B', '#FF6B6B', '#FAAD14', '#722ED1']" />
      <p style="margin-top:6px;font-size:12px;color:var(--color-text-muted);">当前选择：{{ pickerIcon2 || '无' }}</p>
    </Card>

    <Card title="IconPicker — Solar 图标库" style="margin-bottom:24px">
      <IconPicker v-model="pickerIcon3" placeholder="选择 Solar 图标" provider="solar" />
      <p style="margin-top:6px;font-size:12px;color:var(--color-text-muted);">当前选择：{{ pickerIcon3 || '无' }}</p>
    </Card>

    <!-- ══════════════ Props 表 ══════════════ -->
    <Card title="IconSvg Props">
      <table class="props-table">
        <thead><tr><th>Prop</th><th>类型</th><th>默认</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><code>type</code></td><td>string</td><td>—</td><td>图标名（kebab-case）</td></tr>
          <tr><td><code>size</code></td><td>'xs' | 'sm' | 'md' | 'lg' | 'xl'</td><td>'md'</td><td>尺寸 12/16/20/24/28px</td></tr>
          <tr><td><code>provider</code></td><td>'lucide' | 'solar'</td><td>'lucide'</td><td>图标提供者</td></tr>
          <tr><td><code>color</code></td><td>string</td><td>'currentColor'</td><td>描边颜色</td></tr>
        </tbody>
      </table>
    </Card>

    <Card title="IconPicker Props" style="margin-top:24px">
      <table class="props-table">
        <thead><tr><th>Prop</th><th>类型</th><th>默认</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><code>modelValue</code></td><td>string</td><td>—</td><td>v-model 绑定值</td></tr>
          <tr><td><code>color / bgColor</code></td><td>string</td><td>—</td><td>图标颜色 / 背景色</td></tr>
          <tr><td><code>placeholder</code></td><td>string</td><td>—</td><td>触发按钮占位文字</td></tr>
          <tr><td><code>presetColors</code></td><td>string[]</td><td>—</td><td>预定义色板</td></tr>
          <tr><td><code>provider</code></td><td>'lucide' | 'solar'</td><td>'lucide'</td><td>图标提供者</td></tr>
        </tbody>
      </table>
    </Card>
  </div>
</template>

<style scoped>
.demo-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
.demo-desc { color: var(--color-text-muted); margin-bottom: 24px; font-size: 14px; }
code { background: var(--color-bg-alt); padding: 1px 5px; border-radius: 3px; font-size: 12px; }
.props-table { width: 100%; font-size: 13px; border-collapse: collapse; }
.props-table th { padding: 6px 8px; border-bottom: 2px solid var(--color-border); text-align: left; }
.props-table td { padding: 6px 8px; border-bottom: 1px solid var(--color-border-light); }
</style>
