<script setup lang="ts">
import { ref } from 'vue'
import Tabs from '@/components/nav/Tabs.vue'
import TabPanel from '@/components/nav/TabPanel.vue'
import Card from '@/components/data/Card.vue'

const activeTab = ref('tab1')
const mobileTab = ref('/home')
const panelTab = ref('info')

const tabItems = [
  { label: '全部', value: 'tab1' },
  { label: '进行中', value: 'tab2' },
  { label: '已完成', value: 'tab3' },
  { label: '已取消', value: 'tab4' },
]
const bottomTabs = [
  { label: '首页', value: '/home', icon: 'house' },
  { label: '发现', value: '/explore', icon: 'search' },
  { label: '消息', value: '/messages', icon: 'bell' },
  { label: '我的', value: '/profile', icon: 'user' },
]
const panelItems = [
  { label: '基本信息', value: 'info' },
  { label: '明细（懒加载）', value: 'detail' },
]
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Tabs 标签页</h2>
    <p class="demo-desc">underline / pills / card / tabbar 四种变体。</p>

    <Card title="Tabs 标签页" style="margin-bottom: 24px">
      <div style="display: flex; flex-direction: column; gap: 24px">
        <div>
          <p style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 8px">
            <code>variant="underline"</code>
          </p>
          <Tabs v-model="activeTab" :items="tabItems" variant="underline" />
        </div>
        <div>
          <p style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 8px">
            <code>variant="pills"</code>
          </p>
          <Tabs v-model="activeTab" :items="tabItems.slice(0, 3)" variant="pills" />
        </div>
        <div>
          <p style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 8px">
            <code>variant="card"</code>
          </p>
          <Tabs v-model="activeTab" :items="tabItems.slice(0, 3)" variant="card" />
        </div>
      </div>
    </Card>

    <Card title="TabPanel 内容面板" style="margin-bottom: 24px">
      <p style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 12px">
        与 Tabs 配套的内容区：点哪个标签显示哪个面板。<code>lazy</code> 面板首次点开才渲染（重内容推荐）；
        切走默认保留状态（下面的输入框填一半切回来还在）。
      </p>
      <Tabs v-model="panelTab" :items="panelItems" variant="underline" />
      <div style="padding-top: 16px">
        <TabPanel value="info">
          <div style="display: flex; flex-direction: column; gap: 8px">
            <p style="margin: 0; font-size: 13px">基本信息面板 — 切走再切回来，输入框内容不会丢。</p>
            <input
              placeholder="在这里随便输入点什么，再切到「明细」再回来"
              style="
                height: 34px;
                padding: 0 10px;
                border: 1px solid var(--color-border);
                border-radius: var(--radius-md);
                background: var(--color-surface);
                color: var(--color-text);
              "
            />
          </div>
        </TabPanel>
        <TabPanel value="detail" lazy>
          <p style="margin: 0; font-size: 13px">
            明细面板（lazy）— 首次点开才渲染这段文字；重内容/异步数据推荐这种写法。
          </p>
        </TabPanel>
      </div>
    </Card>

    <Card title="TabBar 底部导航">
      <p style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 12px">
        <code>variant="tabbar"</code> 移动端底部标签栏
      </p>
      <div
        style="
          max-width: 375px;
          margin: 0 auto;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: var(--shadow-md);
        "
      >
        <div
          style="
            min-height: 140px;
            background: var(--color-bg);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--color-text-muted);
            font-size: 13px;
          "
        >
          {{ mobileTab }}
        </div>
        <Tabs v-model="mobileTab" variant="tabbar" :items="bottomTabs" />
      </div>
    </Card>

    <Card title="Props">
      <table style="width: 100%; font-size: 13px; border-collapse: collapse">
        <tr style="border-bottom: 2px solid var(--color-border); text-align: left">
          <th style="padding: 4px 8px">Prop</th>
          <th style="padding: 4px 8px">类型</th>
          <th style="padding: 4px 8px">默认</th>
          <th style="padding: 4px 8px">说明</th>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>variant</code>
          </td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">underline</td>
          <td style="padding: 3px 8px">underline | pills | card | tabbar</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px">
            <code>items</code>
          </td>
          <td style="padding: 3px 8px">TabItem[]</td>
          <td style="padding: 3px 8px">—</td>
          <td style="padding: 3px 8px">标签项数组</td>
        </tr>
      </table>
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
