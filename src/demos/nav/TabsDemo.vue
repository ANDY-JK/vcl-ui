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
    <h1 class="demo-title">Tabs 标签页</h1>
    <p class="demo-desc">underline / pills / card / tabbar 四种变体。</p>

    <Card title="Tabs 标签页" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div style="display: flex; flex-direction: column; gap: calc(24px * var(--vcl-scale))">
        <div>
          <p
            style="
              font-size: calc(12px * var(--vcl-scale));
              color: var(--vcl-color-text-muted);
              margin-bottom: calc(8px * var(--vcl-scale));
            "
          >
            <code>variant="underline"</code>
          </p>
          <Tabs v-model="activeTab" :items="tabItems" variant="underline" />
        </div>
        <div>
          <p
            style="
              font-size: calc(12px * var(--vcl-scale));
              color: var(--vcl-color-text-muted);
              margin-bottom: calc(8px * var(--vcl-scale));
            "
          >
            <code>variant="pills"</code>
          </p>
          <Tabs v-model="activeTab" :items="tabItems.slice(0, 3)" variant="pills" />
        </div>
        <div>
          <p
            style="
              font-size: calc(12px * var(--vcl-scale));
              color: var(--vcl-color-text-muted);
              margin-bottom: calc(8px * var(--vcl-scale));
            "
          >
            <code>variant="card"</code>
          </p>
          <Tabs v-model="activeTab" :items="tabItems.slice(0, 3)" variant="card" />
        </div>
      </div>
    </Card>

    <Card title="TabPanel 内容面板" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <p
        style="
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
          margin-bottom: calc(12px * var(--vcl-scale));
        "
      >
        与 Tabs 配套的内容区：点哪个标签显示哪个面板。<code>lazy</code> 面板首次点开才渲染（重内容推荐）；
        切走默认保留状态（下面的输入框填一半切回来还在）。
      </p>
      <Tabs v-model="panelTab" :items="panelItems" variant="underline" />
      <div style="padding-top: calc(16px * var(--vcl-scale))">
        <TabPanel value="info">
          <div style="display: flex; flex-direction: column; gap: calc(8px * var(--vcl-scale))">
            <p style="margin: 0; font-size: calc(13px * var(--vcl-scale))">
              基本信息面板 — 切走再切回来，输入框内容不会丢。
            </p>
            <input
              placeholder="在这里随便输入点什么，再切到「明细」再回来"
              style="
                height: calc(34px * var(--vcl-scale));
                padding: 0 calc(10px * var(--vcl-scale));
                border: 1px solid var(--vcl-color-border);
                border-radius: var(--vcl-radius-md);
                background: var(--vcl-color-surface);
                color: var(--vcl-color-text);
              "
            />
          </div>
        </TabPanel>
        <TabPanel value="detail" lazy>
          <p style="margin: 0; font-size: calc(13px * var(--vcl-scale))">
            明细面板（lazy）— 首次点开才渲染这段文字；重内容/异步数据推荐这种写法。
          </p>
        </TabPanel>
      </div>
    </Card>

    <Card title="TabBar 底部导航" title-as="h2">
      <p
        style="
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
          margin-bottom: calc(12px * var(--vcl-scale));
        "
      >
        <code>variant="tabbar"</code> 移动端底部标签栏
      </p>
      <div
        style="
          max-width: calc(375px * var(--vcl-scale));
          margin: 0 auto;
          border: 1px solid var(--vcl-color-border);
          border-radius: var(--vcl-radius-lg);
          overflow: hidden;
          box-shadow: var(--vcl-shadow-md);
        "
      >
        <div
          style="
            min-height: calc(140px * var(--vcl-scale));
            background: var(--vcl-color-bg);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--vcl-color-text-muted);
            font-size: calc(13px * var(--vcl-scale));
          "
        >
          {{ mobileTab }}
        </div>
        <Tabs v-model="mobileTab" variant="tabbar" :items="bottomTabs" />
      </div>
    </Card>

    <Card title="Props" title-as="h2">
      <table style="width: 100%; font-size: calc(13px * var(--vcl-scale)); border-collapse: collapse">
        <tbody>
          <tr style="border-bottom: 2px solid var(--vcl-color-border); text-align: left">
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">Prop</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">类型</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">默认</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">说明</th>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>variant</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">string</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">underline</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              underline | pills | card | tabbar
            </td>
          </tr>
          <tr>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              <code>items</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">TabItem[]</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">—</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">标签项数组</td>
          </tr>
        </tbody>
      </table>
    </Card>
  </div>
</template>

<style scoped>
.demo-title {
  font-size: calc(22px * var(--vcl-scale));
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
