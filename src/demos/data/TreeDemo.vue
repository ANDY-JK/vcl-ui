<script setup lang="ts">
import { ref } from 'vue'
import Tree from '@/components/data/Tree.vue'
import Card from '@/components/data/Card.vue'

/* ====== Sample data ====== */
interface TreeNode {
  key: string | number
  label: string
  children?: TreeNode[]
  disabled?: boolean
  checked?: boolean
  icon?: string
}

const treeData: TreeNode[] = [
  {
    key: '1',
    label: '产品中心',
    icon: 'package',
    children: [
      {
        key: '1-1',
        label: '在售产品',
        icon: 'shopping-bag',
        children: [
          { key: '1-1-1', label: '旗舰版', icon: 'star' },
          { key: '1-1-2', label: '专业版', icon: 'zap' },
          { key: '1-1-3', label: '基础版', icon: 'circle' },
        ],
      },
      {
        key: '1-2',
        label: '已下架',
        icon: 'archive',
        children: [
          { key: '1-2-1', label: '旧版工具', icon: 'wrench' },
        ],
      },
    ],
  },
  {
    key: '2',
    label: '用户管理',
    icon: 'users',
    children: [
      {
        key: '2-1',
        label: '管理员',
        icon: 'shield',
        children: [
          { key: '2-1-1', label: '张伟' },
          { key: '2-1-2', label: '李娜' },
        ],
      },
      {
        key: '2-2',
        label: '普通用户',
        icon: 'user',
        disabled: true,
        children: [
          { key: '2-2-1', label: '王磊' },
          { key: '2-2-2', label: '陈静' },
        ],
      },
    ],
  },
  {
    key: '3',
    label: '系统设置',
    icon: 'settings',
    children: [
      { key: '3-1', label: '基本配置', icon: 'sliders' },
      { key: '3-2', label: '权限管理', icon: 'lock' },
      { key: '3-3', label: '日志查看', icon: 'file-text' },
    ],
  },
]

const checkableData: TreeNode[] = [
  {
    key: 'a',
    label: '权限管理',
    icon: 'shield',
    children: [
      {
        key: 'a1',
        label: '用户权限',
        children: [
          { key: 'a1-1', label: '查看用户', checked: true },
          { key: 'a1-2', label: '编辑用户' },
          { key: 'a1-3', label: '删除用户' },
        ],
      },
      {
        key: 'a2',
        label: '角色管理',
        children: [
          { key: 'a2-1', label: '查看角色', checked: true },
          { key: 'a2-2', label: '分配角色', checked: true },
        ],
      },
    ],
  },
  {
    key: 'b',
    label: '内容管理',
    icon: 'file-text',
    children: [
      { key: 'b1', label: '查看内容' },
      { key: 'b2', label: '发布内容' },
      { key: 'b3', label: '审核内容' },
    ],
  },
]

const selectableData: TreeNode[] = [
  {
    key: 's1',
    label: '前端开发',
    icon: 'code-2',
    children: [
      {
        key: 's1-1',
        label: 'Vue 生态',
        children: [
          { key: 's1-1-1', label: 'Vue 3' },
          { key: 's1-1-2', label: 'Nuxt' },
          { key: 's1-1-3', label: 'Pinia' },
        ],
      },
      {
        key: 's1-2',
        label: 'React 生态',
        children: [
          { key: 's1-2-1', label: 'React 19' },
          { key: 's1-2-2', label: 'Next.js' },
        ],
      },
    ],
  },
  {
    key: 's2',
    label: '后端开发',
    icon: 'server',
    children: [
      { key: 's2-1', label: 'Node.js' },
      { key: 's2-2', label: 'Go' },
      { key: 's2-3', label: 'Python' },
    ],
  },
]

/* ====== Reactive state for demos ====== */
const checkedKeys = ref<(string | number)[]>([])
const selectedKey = ref<string | number | null>(null)

function onCheckChange(keys: (string | number)[], node: TreeNode) {
  checkedKeys.value = keys
  console.log('check-change:', keys, node.label)
}

function onNodeClick(node: TreeNode) {
  console.log('node-click:', node.label)
}
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Tree 树形控件</h2>
    <p class="demo-desc">
      递归树形控件，用于展示层级数据。支持 <strong>展开/折叠</strong>、<strong>多选联动</strong>、<strong>单选高亮</strong>、<strong>图标</strong> 和 <strong>禁用</strong>。
    </p>

    <div class="grid-2-col" style="margin-bottom: 24px">
      <!-- Basic tree -->
      <Card title="基础用法" overflowVisible>
        <p style="margin-bottom: 8px; font-size: 12px; color: var(--color-text-muted)">
          点击箭头或标签展开/折叠子节点
        </p>
        <Tree
          :data="treeData"
          @node-click="onNodeClick"
        />
      </Card>

      <!-- Checkable tree -->
      <Card title="多选联动" overflowVisible>
        <p style="margin-bottom: 8px; font-size: 12px; color: var(--color-text-muted)">
          勾选父节点自动选中所有子节点，半选状态自动计算
        </p>
        <Tree
          :data="checkableData"
          checkable
          @check-change="onCheckChange"
        />
        <p style="margin-top: 8px; font-size: 11px; color: var(--color-text-muted)">
          已选中: {{ checkedKeys.length > 0 ? checkedKeys.join(', ') : '无' }}
        </p>
      </Card>

      <!-- Selectable tree -->
      <Card title="单选模式" overflowVisible>
        <p style="margin-bottom: 8px; font-size: 12px; color: var(--color-text-muted)">
          点击节点高亮选中，不会自动展开/折叠
        </p>
        <Tree
          :data="selectableData"
          selectable
          :selectedKey="selectedKey"
          @update:selectedKey="(k) => (selectedKey = k)"
        />
        <p style="margin-top: 8px; font-size: 11px; color: var(--color-text-muted)">
          当前选中: {{ selectedKey ?? '无' }}
        </p>
      </Card>

      <!-- Expand all / default expanded -->
      <Card title="默认展开" overflowVisible>
        <p style="margin-bottom: 8px; font-size: 12px; color: var(--color-text-muted)">
          通过 defaultExpandedKeys 指定初始展开的节点
        </p>
        <Tree
          :data="treeData"
          :defaultExpandedKeys="['1', '2']"
        />
      </Card>
    </div>

    <Card title="API">
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid var(--color-border);text-align:left;">
            <th style="padding:4px 8px;">属性</th>
            <th style="padding:4px 8px;">类型</th>
            <th style="padding:4px 8px;">默认值</th>
            <th style="padding:4px 8px;">说明</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>data</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>TreeNode[]</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">—</td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">树形数据源</td></tr>
          <tr><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>checkable</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>boolean</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>false</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">是否显示复选框</td></tr>
          <tr><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>selectable</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>boolean</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>false</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">点击节点高亮选中</td></tr>
          <tr><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>selectedKey</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>string | number | null</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>null</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">当前选中的节点 key</td></tr>
          <tr><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>defaultExpandedKeys</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>(string | number)[]</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>[]</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">初始展开的节点 key 列表</td></tr>
          <tr><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>expandAll</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>boolean</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);"><code>false</code></td><td style="padding:3px 8px;border-bottom:1px solid var(--color-border-light);">是否展开所有节点</td></tr>
        </tbody>
      </table>
      <p style="font-size:12px;color:var(--color-text-muted);margin-top:12px">
        <strong>TreeNode 接口：</strong><code>key</code> · <code>label</code> · <code>children?</code> · <code>disabled?</code> · <code>checked?</code> · <code>icon?</code>
      </p>
      <p style="font-size:12px;color:var(--color-text-muted);margin-top:8px">
        <strong>Events：</strong><code>@node-click(node)</code> · <code>@check-change(keys, node)</code> · <code>@update:selectedKey(key)</code>
      </p>
    </Card>
  </div>
</template>

<style scoped>
.demo-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
.demo-desc { color: var(--color-text-muted); margin-bottom: 24px; font-size: 14px; }
code { background: var(--color-bg-alt); padding: 1px 5px; border-radius: 3px; font-size: 12px; }
</style>
