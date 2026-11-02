<script setup lang="ts">
import { ref } from 'vue'
import Menu from '@/components/nav/Menu.vue'
import Card from '@/components/data/Card.vue'

const selectedKey = ref<string | number>('dashboard')
const hSelectedKey = ref<string | number>('home')

const menuItems = [
  { key: 'dashboard', label: '仪表盘', icon: 'layout-dashboard' },
  { key: 'analytics', label: '分析', icon: 'chart-line' },
  { key: 'div1', label: '', divided: true },
  {
    key: 'content',
    label: '内容管理',
    icon: 'file-text',
    children: [
      { key: 'posts', label: '文章列表', icon: 'list' },
      { key: 'drafts', label: '草稿箱', icon: 'file-pen-line' },
      { key: 'media', label: '媒体库', icon: 'image' },
      {
        key: 'categories',
        label: '分类管理',
        icon: 'folder-tree',
        children: [
          { key: 'cat-news', label: '新闻', icon: 'newspaper' },
          { key: 'cat-blog', label: '博客', icon: 'book-open' },
        ],
      },
    ],
  },
  {
    key: 'users',
    label: '用户管理',
    icon: 'users',
    children: [
      { key: 'user-list', label: '用户列表', icon: 'user-round' },
      { key: 'roles', label: '角色权限', icon: 'shield-check', disabled: true },
      { key: 'activity', label: '操作日志', icon: 'scroll-text' },
    ],
  },
  { key: 'div2', label: '', divided: true },
  {
    key: 'settings',
    label: '系统设置',
    icon: 'settings',
    children: [
      { key: 'general', label: '基本设置', icon: 'cog' },
      { key: 'security', label: '安全策略', icon: 'lock' },
      { key: 'backup', label: '数据备份', icon: 'database-backup', disabled: true },
    ],
  },
  { key: 'help', label: '帮助', icon: 'circle-help' },
]

const hMenuItems = [
  { key: 'home', label: '首页', icon: 'house' },
  {
    key: 'products',
    label: '产品',
    icon: 'package',
    children: [
      { key: 'software', label: '软件产品', icon: 'monitor' },
      { key: 'hardware', label: '硬件设备', icon: 'cpu' },
      { key: 'service', label: '技术服务', icon: 'wrench' },
    ],
  },
  {
    key: 'solutions',
    label: '解决方案',
    icon: 'lightbulb',
    children: [
      { key: 'enterprise', label: '企业版', icon: 'building-2' },
      {
        key: 'industry',
        label: '行业方案',
        icon: 'factory',
        children: [
          { key: 'finance', label: '金融', icon: 'landmark' },
          { key: 'medical', label: '医疗', icon: 'heart-pulse' },
        ],
      },
    ],
  },
  { key: 'pricing', label: '定价', icon: 'tags' },
  { key: 'about', label: '关于', icon: 'info' },
]

function onSelect(item: { key: string | number; label: string }) {
  console.log('Menu select:', item)
}
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Menu 多级菜单</h1>
    <p class="demo-desc">
      支持 vertical（侧边栏）和 horizontal（顶部导航）两种模式，可递归渲染多级子菜单。 选中值：<code>{{
        selectedKey
      }}</code>
    </p>

    <!-- ========== Vertical Sidebar ========== -->
    <Card
      title="Vertical 侧边栏菜单"
      title-as="h2"
      style="margin-bottom: calc(24px * var(--vcl-scale))"
      overflow-visible
    >
      <p
        style="
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
          margin-bottom: calc(12px * var(--vcl-scale));
        "
      >
        <code>mode="vertical"</code> — 点击展开子菜单，内联缩进 + 滑动动画，支持多级嵌套
      </p>
      <div
        style="
          max-width: calc(260px * var(--vcl-scale));
          background: var(--vcl-color-sidebar);
          border-radius: var(--vcl-radius-lg);
          padding: var(--vcl-space-3) var(--vcl-space-1);
        "
      >
        <Menu v-model:selected-key="selectedKey" :items="menuItems" mode="vertical" theme="dark" @select="onSelect" />
      </div>
    </Card>

    <!-- ========== Collapsed Vertical ========== -->
    <Card
      title="Collapsed 图标模式"
      title-as="h2"
      style="margin-bottom: calc(24px * var(--vcl-scale))"
      overflow-visible
    >
      <p
        style="
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
          margin-bottom: calc(12px * var(--vcl-scale));
        "
      >
        <code>:collapsed="true"</code> — 仅显示图标，子菜单 hover 时以浮层弹出
      </p>
      <div
        style="
          max-width: calc(60px * var(--vcl-scale));
          background: var(--vcl-color-sidebar);
          border-radius: var(--vcl-radius-lg);
          padding: var(--vcl-space-3) var(--vcl-space-1);
        "
      >
        <Menu
          v-model:selected-key="selectedKey"
          :items="menuItems"
          mode="vertical"
          theme="dark"
          :collapsed="true"
          @select="onSelect"
        />
      </div>
    </Card>

    <!-- ========== Horizontal Topbar ========== -->
    <Card title="Horizontal 顶部导航" overflow-visible>
      <p
        style="
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
          margin-bottom: calc(12px * var(--vcl-scale));
        "
      >
        <code>mode="horizontal"</code> — 横向排列，hover 展开下拉面板（150ms 延迟），选中值：<code>{{
          hSelectedKey
        }}</code>
      </p>
      <div
        style="
          background: var(--vcl-color-surface);
          border: 1px solid var(--vcl-color-border);
          border-radius: var(--vcl-radius-lg);
          padding: var(--vcl-space-2) var(--vcl-space-4);
        "
      >
        <Menu v-model:selected-key="hSelectedKey" :items="hMenuItems" mode="horizontal" @select="onSelect" />
      </div>
    </Card>

    <!-- ========== API Table ========== -->
    <Card title="Props" title-as="h2">
      <table style="width: 100%; font-size: calc(13px * var(--vcl-scale)); border-collapse: collapse">
        <thead>
          <tr style="border-bottom: 2px solid var(--vcl-color-border); text-align: left">
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">Prop</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">类型</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">默认</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>items</code></td>
            <td>MenuItem[]</td>
            <td>—</td>
            <td>菜单树（MenuItem：key/label/children）</td>
          </tr>
          <tr>
            <td><code>mode</code></td>
            <td>'vertical' \| 'horizontal'</td>
            <td>'vertical'</td>
            <td>排列方向（默认 vertical，纵向可折叠子级）</td>
          </tr>
          <tr>
            <td><code>selectedKey</code></td>
            <td>string \| number</td>
            <td>—</td>
            <td>受控选中项 key</td>
          </tr>
          <tr>
            <td><code>collapsed</code></td>
            <td>boolean</td>
            <td>—</td>
            <td>折叠态（纵向：仅显示图标 + 悬停浮层子菜单）</td>
          </tr>
          <tr>
            <td><code>multiple</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>允许多个子菜单同时展开（默认关=手风琴）</td>
          </tr>
          <tr>
            <td><code>level</code></td>
            <td>number</td>
            <td>0</td>
            <td>嵌套层级（递归子菜单内部用，消费方勿传）</td>
          </tr>
          <tr>
            <td><code>theme</code></td>
            <td>'light' \| 'dark'</td>
            <td>'light'</td>
            <td>配色：light 浅色 \| dark 深色（侧栏内嵌时用）</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <Card title="Events" title-as="h2">
      <table style="width: 100%; font-size: calc(13px * var(--vcl-scale)); border-collapse: collapse">
        <thead>
          <tr style="border-bottom: 2px solid var(--vcl-color-border); text-align: left">
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">事件</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">参数</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>select</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              MenuItem
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              点击叶子节点时触发
            </td>
          </tr>
          <tr>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              <code>update:selected-key</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">string | number</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              选中 key 变更（支持 v-model:selected-key）
            </td>
          </tr>
        </tbody>
      </table>
    </Card>

    <Card title="MenuItem 接口" title-as="h2">
      <table style="width: 100%; font-size: calc(13px * var(--vcl-scale)); border-collapse: collapse">
        <thead>
          <tr style="border-bottom: 2px solid var(--vcl-color-border); text-align: left">
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">字段</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">类型</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">必填</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>key</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              string | number
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              是
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              唯一标识
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>label</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              string
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              是
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              显示文本
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>icon</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              string
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              否
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              IconSvg 图标名
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>children</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              MenuItem[]
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              否
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              子菜单项（递归渲染）
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>disabled</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              boolean
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              否
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              禁用该项
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>divided</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              boolean
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              否
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              在此项前显示分隔线
            </td>
          </tr>
          <tr>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              <code>action</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">() => void</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">否</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              自定义点击回调（触发时同时 emit select）
            </td>
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
  line-height: 1.6;
}
code {
  background: var(--vcl-color-bg-alt);
  padding: 1px calc(5px * var(--vcl-scale));
  border-radius: calc(3px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
}
</style>
