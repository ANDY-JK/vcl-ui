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
  'home',
  'search',
  'plus',
  'x',
  'check',
  'chevron-down',
  'chevron-right',
  'bell',
  'settings',
  'user',
  'mail',
  'calendar',
  'clock',
  'trash',
  'download',
  'eye',
  'star',
  'heart',
  'file',
  'folder',
  'menu',
  'more-vertical',
]
const iconColor = ref('#6366F1')

/* IconPicker */
const pickerIcon1 = ref('house')
const pickerIcon2 = ref('settings')
const pickerIcon3 = ref('user')

/* Morphicons 形变动画：切换 type 时从旧图标平滑形变到新图标（全量图标均可形变） */
const morphPairs = [
  { from: 'menu', to: 'x', label: '菜单 → 关闭' },
  { from: 'play', to: 'pause', label: '播放 → 暂停' },
  { from: 'plus', to: 'minus', label: '展开 → 收起' },
  { from: 'chevron-down', to: 'chevron-up', label: '折叠 → 展开' },
  { from: 'sun', to: 'moon', label: '白天 → 夜间' },
  { from: 'eye', to: 'eye-off', label: '显示 → 隐藏' },
  { from: 'lock', to: 'lock-open', label: '锁定 → 解锁' },
  { from: 'list', to: 'layout-grid', label: '列表 → 网格' },
]
const morphStates = ref(morphPairs.map(() => false))
function toggleMorph(i: number) {
  morphStates.value[i] = !morphStates.value[i]
}
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Icon 图标</h1>
    <p class="demo-desc">
      Lucide（随包 182 个常用名，默认）、Solar（Apple 风格 334 个）与 Morphicons（形变动画，全量）三套图标源。
      单图标渲染用 IconSvg，图标选择器用 IconPicker；选择器只列随包可渲染的名字，点了必有图。
    </p>

    <!-- ══════════════ IconSvg 单图标渲染 ══════════════ -->
    <Card title="Solar 图标（Apple 风格）" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <p
        style="
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
          margin-bottom: calc(12px * var(--vcl-scale));
        "
      >
        Solar 图标集（MIT 协议）通过 <code>provider="solar"</code> 渲染，默认使用 <code>-linear</code> 变体。
      </p>
      <div style="display: flex; align-items: center; gap: calc(16px * var(--vcl-scale)); flex-wrap: wrap">
        <IconSvg type="home-linear" provider="solar" size="xl" color="#6366F1" />
        <IconSvg type="user-circle-linear" provider="solar" size="xl" color="#6366F1" />
        <IconSvg type="bell-linear" provider="solar" size="xl" color="#6366F1" />
        <IconSvg type="star-linear" provider="solar" size="xl" color="#6366F1" />
        <IconSvg type="chat-round-dots-linear" provider="solar" size="xl" color="#6366F1" />
        <IconSvg type="settings-linear" provider="solar" size="xl" color="#6366F1" />
        <IconSvg type="calendar-linear" provider="solar" size="xl" color="#6366F1" />
        <IconSvg type="lock-linear" provider="solar" size="xl" color="#6366F1" />
      </div>
    </Card>

    <Card title="Morphicons 形变动画" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <p
        style="
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
          margin-bottom: calc(12px * var(--vcl-scale));
        "
      >
        通过 <code>provider="morphicons"</code> 渲染（MIT 协议，零运行时依赖）。覆盖 Lucide 全量 1737 个图标及其别名，
        任意两个图标间均可形变；切换
        <code>type</code> 时以弹簧物理从旧形状平滑过渡到新形状，适合状态切换按钮。点击下方图标试试。
      </p>
      <div style="display: flex; align-items: center; gap: calc(20px * var(--vcl-scale)); flex-wrap: wrap">
        <button
          v-for="(p, i) in morphPairs"
          :key="p.label"
          type="button"
          :aria-label="p.label"
          :aria-pressed="morphStates[i]"
          style="
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: calc(6px * var(--vcl-scale));
            padding: calc(12px * var(--vcl-scale)) calc(10px * var(--vcl-scale));
            background: var(--vcl-color-surface);
            border: 1px solid var(--vcl-color-border-light);
            border-radius: var(--vcl-radius-md);
            cursor: pointer;
            font-family: inherit;
          "
          @click="toggleMorph(i)"
        >
          <IconSvg :type="morphStates[i] ? p.to : p.from" provider="morphicons" size="xl" color="#6366F1" />
          <span style="font-size: calc(10px * var(--vcl-scale)); color: var(--vcl-color-text-muted)">{{
            p.label
          }}</span>
        </button>
      </div>
    </Card>

    <Card title="尺寸" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div style="display: flex; align-items: center; gap: calc(24px * var(--vcl-scale)); flex-wrap: wrap">
        <div
          v-for="s in sizes"
          :key="s.value"
          style="display: flex; flex-direction: column; align-items: center; gap: calc(6px * var(--vcl-scale))"
        >
          <IconSvg type="star" :size="s.value" :color="iconColor" />
          <span style="font-size: calc(11px * var(--vcl-scale)); color: var(--vcl-color-text-muted)">{{
            s.label
          }}</span>
        </div>
      </div>
    </Card>

    <Card title="颜色自定义" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div style="display: flex; align-items: center; gap: calc(16px * var(--vcl-scale)); flex-wrap: wrap">
        <IconSvg type="heart" size="xl" :color="iconColor" />
        <input
          type="color"
          :value="iconColor"
          aria-label="自定义图标颜色"
          style="
            width: calc(36px * var(--vcl-scale));
            height: calc(36px * var(--vcl-scale));
            border: none;
            border-radius: var(--vcl-radius-sm);
            cursor: pointer;
            padding: 0;
          "
          @input="iconColor = ($event.target as HTMLInputElement).value"
        />
        <div style="display: flex; gap: calc(6px * var(--vcl-scale))">
          <button
            v-for="c in ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4']"
            :key="c"
            :style="{
              background: c,
              borderColor: iconColor === c ? 'var(--vcl-color-text)' : 'transparent',
              transform: iconColor === c ? 'scale(1.2)' : 'none',
            }"
            style="
              width: calc(22px * var(--vcl-scale));
              height: calc(22px * var(--vcl-scale));
              border-radius: 50%;
              border: 2px solid transparent;
              cursor: pointer;
              transition: all var(--vcl-transition-fast);
            "
            :aria-label="c"
            @click="iconColor = c"
          />
        </div>
      </div>
    </Card>

    <Card title="常用图标速查" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div
        style="
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(calc(80px * var(--vcl-scale)), 1fr));
          gap: calc(8px * var(--vcl-scale));
        "
      >
        <div
          v-for="name in commonIcons"
          :key="name"
          style="
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: calc(6px * var(--vcl-scale));
            padding: calc(10px * var(--vcl-scale)) calc(6px * var(--vcl-scale));
            border: 1px solid var(--vcl-color-border-light);
            border-radius: var(--vcl-radius-md);
            font-size: calc(10px * var(--vcl-scale));
            color: var(--vcl-color-text-secondary);
          "
        >
          <IconSvg :type="name" size="md" color="var(--vcl-color-text)" />
          <span>{{ name }}</span>
        </div>
      </div>
    </Card>

    <!-- ══════════════ IconPicker 图标选择器 ══════════════ -->
    <Card
      title="IconPicker 图标选择器 — Lucide 图标库"
      title-as="h2"
      style="margin-bottom: calc(24px * var(--vcl-scale))"
    >
      <IconPicker v-model="pickerIcon1" placeholder="选择图标" />
      <p
        style="
          margin-top: calc(6px * var(--vcl-scale));
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
        "
      >
        当前选择：{{ pickerIcon1 || '无' }}
      </p>
    </Card>

    <Card title="IconPicker — 带预设颜色" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <IconPicker
        v-model="pickerIcon2"
        placeholder="选择图标"
        :preset-colors="['#4F6EF7', '#00B96B', '#FF6B6B', '#FAAD14', '#722ED1']"
      />
      <p
        style="
          margin-top: calc(6px * var(--vcl-scale));
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
        "
      >
        当前选择：{{ pickerIcon2 || '无' }}
      </p>
    </Card>

    <Card title="IconPicker — Solar 图标库" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <IconPicker v-model="pickerIcon3" placeholder="选择 Solar 图标" provider="solar" />
      <p
        style="
          margin-top: calc(6px * var(--vcl-scale));
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
        "
      >
        当前选择：{{ pickerIcon3 || '无' }}
      </p>
    </Card>

    <!-- ══════════════ Props 表 ══════════════ -->
    <Card title="IconSvg Props" title-as="h2">
      <table class="props-table">
        <thead>
          <tr>
            <th>Prop</th>
            <th>类型</th>
            <th>默认</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>type</code></td>
            <td>string</td>
            <td>—</td>
            <td>图标名（kebab-case）</td>
          </tr>
          <tr>
            <td><code>size</code></td>
            <td>'xs' | 'sm' | 'md' | 'lg' | 'xl'</td>
            <td>'md'</td>
            <td>尺寸 12/16/20/24/28px</td>
          </tr>
          <tr>
            <td><code>provider</code></td>
            <td>'lucide' | 'solar' | 'morphicons'</td>
            <td>'lucide'</td>
            <td>图标提供者（morphicons 为形变动画）</td>
          </tr>
          <tr>
            <td><code>color</code></td>
            <td>string</td>
            <td>'currentColor'</td>
            <td>描边颜色</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <Card title="IconPicker Props" title-as="h2" style="margin-top: calc(24px * var(--vcl-scale))">
      <table class="props-table">
        <thead>
          <tr>
            <th>Prop</th>
            <th>类型</th>
            <th>默认</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>modelValue</code></td>
            <td>string</td>
            <td>—</td>
            <td>v-model 绑定值</td>
          </tr>
          <tr>
            <td><code>color / bgColor</code></td>
            <td>string</td>
            <td>—</td>
            <td>图标颜色 / 背景色</td>
          </tr>
          <tr>
            <td><code>placeholder</code></td>
            <td>string</td>
            <td>—</td>
            <td>触发按钮占位文字</td>
          </tr>
          <tr>
            <td><code>presetColors</code></td>
            <td>string[]</td>
            <td>—</td>
            <td>预定义色板</td>
          </tr>
          <tr>
            <td><code>provider</code></td>
            <td>'lucide' | 'solar' | 'morphicons'</td>
            <td>'lucide'</td>
            <td>图标提供者</td>
          </tr>
        </tbody>
      </table>
    </Card>
  </div>
</template>

<style scoped>
.demo-title {
  font-size: var(--vcl-fs-20);
  font-weight: 700;
  margin-bottom: calc(4px * var(--vcl-scale));
}
.demo-desc {
  color: var(--vcl-color-text-muted);
  margin-bottom: calc(24px * var(--vcl-scale));
  font-size: calc(14px * var(--vcl-scale));
}
code {
  background: var(--vcl-color-bg-alt);
  padding: 1px calc(5px * var(--vcl-scale));
  border-radius: calc(3px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
}
.props-table {
  width: 100%;
  font-size: calc(13px * var(--vcl-scale));
  border-collapse: collapse;
}
.props-table th {
  padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
  border-bottom: 2px solid var(--vcl-color-border);
  text-align: left;
}
.props-table td {
  padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
  border-bottom: 1px solid var(--vcl-color-border-light);
}
</style>
