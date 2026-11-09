<script setup lang="ts">
import { ref } from 'vue'
import ToggleList from '@/components/data/ToggleList.vue'
import type { TableRow } from '@/components/_internal/api-any'
import Card from '@/components/data/Card.vue'
import Toast from '@/components/feedback/Toast.vue'

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

function onToggle(item: TableRow, val: boolean) {
  // eslint-disable-next-line no-console -- 演示页事件日志:演示行为的人类可读取证,不进产物
  console.log('toggle', item.display_name, val)
}

const toastRef = ref<InstanceType<typeof Toast> | null>(null)

function onButtonClick(payload: { name: string; phone: string; address: string }) {
  // 用库自带 Toast 做页内反馈——原生 alert 会阻塞页面（自动化/无障碍都难受）
  toastRef.value?.show(`发快递给 ${payload.name}（${payload.phone}）— ${payload.address}`, 'success')
}
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">ToggleList 开关列表</h1>
    <p class="demo-desc">两种模式：开关切换列表、操作按钮列表。支持图标、描述、额外列。</p>

    <Card title="系统设置（switch 变体）" title-as="h2" style="margin-bottom: calc(16px * var(--vcl-scale))">
      <ToggleList
        :items="switchItems"
        variant="switch"
        :extra-columns="[{ key: 'is_enabled', label: '状态' }]"
        @toggle="onToggle"
      />
    </Card>

    <Card title="通知设置（switch 变体）" title-as="h2" style="margin-bottom: calc(16px * var(--vcl-scale))">
      <ToggleList :items="notifyItems" variant="switch" toggle-field="is_enabled" @toggle="onToggle" />
    </Card>

    <Card title="发快递（button 变体）" title-as="h2">
      <ToggleList :items="buttonItems" variant="button" button-label="发快递" @button-click="onButtonClick" />
    </Card>

    <Toast ref="toastRef" position="bottom-right" />

    <Card title="Props" title-as="h2" style="margin-top: calc(24px * var(--vcl-scale))">
      <table style="width: 100%; font-size: calc(13px * var(--vcl-scale)); border-collapse: collapse">
        <thead>
          <tr style="border-bottom: 2px solid var(--vcl-color-border); text-align: left">
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">Prop</th>
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">类型</th>
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">默认值</th>
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>items</code></td>
            <td>Record&lt;string, any>[]</td>
            <td>—</td>
            <td>列表数据（行对象按各 *Field prop 取列）</td>
          </tr>
          <tr>
            <td><code>idKey</code></td>
            <td>string</td>
            <td>'id'</td>
            <td>行唯一键字段名（默认 'id'）</td>
          </tr>
          <tr>
            <td><code>titleField</code></td>
            <td>string</td>
            <td>'display_name'</td>
            <td>标题字段名（默认 'display_name'）</td>
          </tr>
          <tr>
            <td><code>descriptionField</code></td>
            <td>string</td>
            <td>'description'</td>
            <td>描述字段名（默认 'description'）</td>
          </tr>
          <tr>
            <td><code>iconField</code></td>
            <td>string</td>
            <td>'icon'</td>
            <td>图标字段名（默认 'icon'）</td>
          </tr>
          <tr>
            <td><code>toggleField</code></td>
            <td>string</td>
            <td>'is_enabled'</td>
            <td>开关绑定字段名（默认 'is_enabled'）</td>
          </tr>
          <tr>
            <td><code>extraColumns</code></td>
            <td>ExtraColumn[]</td>
            <td>() => []</td>
            <td>追加列（状态标签等，ExtraColumn：取值字段/格式化/标签色）</td>
          </tr>
          <tr>
            <td><code>disabled</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>整列禁用（开关与按钮不可操作）</td>
          </tr>
          <tr>
            <td><code>isLoading</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>加载态（显示骨架行）</td>
          </tr>
          <tr>
            <td><code>emptyText</code></td>
            <td>string</td>
            <td>''</td>
            <td>空数据文案（空串用内置 i18n）</td>
          </tr>
          <tr>
            <td><code>variant</code></td>
            <td>'switch' \| 'button'</td>
            <td>'switch'</td>
            <td>'switch' = 开关列表, 'button' = 操作按钮（发快递等场景）</td>
          </tr>
          <tr>
            <td><code>buttonLabel</code></td>
            <td>string</td>
            <td>''</td>
            <td>variant='button' 时按钮文字（空串用内置 i18n）</td>
          </tr>
          <tr>
            <td><code>phoneField</code></td>
            <td>string</td>
            <td>'phone'</td>
            <td>variant='button' 时手机号字段</td>
          </tr>
        </tbody>
      </table>
      <p
        style="
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
          margin-top: calc(8px * var(--vcl-scale));
        "
      >
        Events: <code>@toggle(item, value)</code> | <code>@item-click(item)</code> |
        <code>@button-click({ name, phone, address, item })</code>
      </p>
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
  line-height: 1.6;
}
code {
  background: var(--vcl-color-bg-alt);
  padding: 1px calc(5px * var(--vcl-scale));
  border-radius: calc(3px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
}
</style>
