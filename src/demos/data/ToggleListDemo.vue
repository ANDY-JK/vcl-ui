<script setup lang="ts">
import { ref } from 'vue'
import ToggleList from '@/components/data/ToggleList.vue'
import Card from '@/components/data/Card.vue'

// 示例 1：系统设置（Switch 变体）
const switchItems = ref([
  { id: 1, display_name: 'WiFi', description: '无线网络连接', is_enabled: true, icon: 'wifi' },
  { id: 2, display_name: '蓝牙', description: '短距离无线通信', is_enabled: false, icon: 'bluetooth' },
  { id: 3, display_name: '飞行模式', description: '关闭所有无线连接', is_enabled: false, icon: 'plane' },
  { id: 4, display_name: '省电模式', description: '降低功耗延长续航', is_enabled: true, icon: 'battery-low' },
])

// 示例 2：通知设置（Switch 变体）— 原 ListDemo 的数据
const notifyItems = ref([
  { id: 1, display_name: '消息推送', description: '接收系统通知和消息提醒', icon: 'bell', is_enabled: true },
  { id: 2, display_name: '邮件通知', description: '通过邮件接收重要更新', icon: 'mail', is_enabled: false },
  { id: 3, display_name: '暗黑模式', description: '切换到深色主题界面', icon: 'eye-off', is_enabled: true },
  { id: 4, display_name: '自动备份', description: '每天凌晨自动备份数据到云端', icon: 'cloud', is_enabled: true },
  { id: 5, display_name: '开发者模式', description: '开启高级调试功能', icon: 'settings', is_enabled: false },
])

// 示例 3：发快递（Button 变体）
const buttonItems = ref([
  { id: 1, display_name: '张三', description: '北京市朝阳区望京SOHO T1-1806', phone: '13800138000', icon: 'user' },
  { id: 2, display_name: '李四', description: '上海市浦东新区陆家嘴环路1000号', phone: '13900139000', icon: 'user' },
  { id: 3, display_name: '王五', description: '深圳市南山区科技园南路88号', phone: '13700137000', icon: 'user' },
])

function onToggle(item: Record<string, any>, val: boolean) {
  console.log('toggle', item.display_name, val)
}

function onButtonClick(payload: { name: string; phone: string; address: string }) {
  alert(`发快递给 ${payload.name}（${payload.phone}）\n地址：${payload.address}`)
}
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">ToggleList 开关列表</h1>
    <p class="demo-desc">两种模式：开关切换列表、操作按钮列表。支持图标、描述、额外列。</p>

    <Card title="系统设置（switch 变体）" title-as="h2" style="margin-bottom: 16px">
      <ToggleList
        :items="switchItems"
        variant="switch"
        :extra-columns="[{ key: 'is_enabled', label: '状态' }]"
        @toggle="onToggle"
      />
    </Card>

    <Card title="通知设置（switch 变体）" title-as="h2" style="margin-bottom: 16px">
      <ToggleList :items="notifyItems" variant="switch" toggle-field="is_enabled" @toggle="onToggle" />
    </Card>

    <Card title="发快递（button 变体）" title-as="h2">
      <ToggleList :items="buttonItems" variant="button" button-label="发快递" @button-click="onButtonClick" />
    </Card>

    <Card title="Props" title-as="h2" style="margin-top: 24px">
      <table style="width: 100%; font-size: 13px; border-collapse: collapse">
        <thead>
          <tr style="border-bottom: 2px solid var(--color-border); text-align: left">
            <th style="padding: 6px 8px">Prop</th>
            <th style="padding: 6px 8px">类型</th>
            <th style="padding: 6px 8px">默认值</th>
            <th style="padding: 6px 8px">说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              <code>items</code>
            </td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              Record&lt;string, any&gt;[]
            </td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">—</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">列表数据</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              <code>variant</code>
            </td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">'switch' | 'button'</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">'switch'</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">变体：开关 / 操作按钮</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              <code>titleField</code>
            </td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">string</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">'display_name'</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">标题字段映射</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              <code>descriptionField</code>
            </td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">string</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">'description'</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">描述字段映射</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              <code>toggleField</code>
            </td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">string</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">'is_enabled'</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">开关值字段映射</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              <code>buttonLabel</code>
            </td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">string</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">'发快递'</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              按钮文字（variant='button'）
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 8px">
              <code>extraColumns</code>
            </td>
            <td style="padding: 6px 8px">ExtraColumn[]</td>
            <td style="padding: 6px 8px">[]</td>
            <td style="padding: 6px 8px">额外信息列</td>
          </tr>
        </tbody>
      </table>
      <p style="font-size: 12px; color: var(--color-text-muted); margin-top: 8px">
        Events: <code>@toggle(item, value)</code> | <code>@itemClick(item)</code> |
        <code>@buttonClick({ name, phone, address, item })</code>
      </p>
    </Card>
  </div>
</template>

<style scoped>
.demo-title {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;
}
.demo-desc {
  color: var(--color-text-muted);
  margin-bottom: 24px;
  font-size: 14px;
  line-height: 1.6;
}
code {
  background: var(--color-bg-alt);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
}
</style>
