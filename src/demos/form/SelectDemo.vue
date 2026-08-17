<script setup lang="ts">
import { ref } from 'vue'
import type { Option, CascaderOption } from '@/components/shared/types'
import Select from '@/components/form/Select.vue'
import Card from '@/components/data/Card.vue'

/* ====== 单选 ====== */
const singleVal = ref('')
const frameworks: Option[] = [
  { value: 1, label: 'React' },
  { value: 2, label: 'Vue' },
  { value: 3, label: 'Angular' },
  { value: 4, label: 'Svelte', disabled: true },
  { value: 5, label: 'SolidJS' },
  { value: 6, label: 'Qwik' },
]

/* ====== 多选 ====== */
const multiVal = ref<(string | number)[]>([])

/* ====== 拼音搜索 ====== */
const cnVal = ref('')
const cnCities: Option[] = [
  { value: '北京市', label: '北京' },
  { value: '上海市', label: '上海' },
  { value: '广州市', label: '广州' },
  { value: '深圳市', label: '深圳' },
  { value: '杭州市', label: '杭州' },
  { value: '成都市', label: '成都' },
  { value: '武汉市', label: '武汉' },
  { value: '南京市', label: '南京' },
  { value: '西安市', label: '西安' },
  { value: '重庆市', label: '重庆' },
]

/* ====== 带描述 ====== */
const descVal = ref('')
const descOptions: Option[] = [
  { value: 'admin', label: '管理员', desc: '拥有全部权限，可管理用户和系统设置' },
  { value: 'editor', label: '编辑者', desc: '可编辑内容，不可管理用户' },
  { value: 'viewer', label: '只读', desc: '仅可查看内容，不可编辑' },
]

/* ====== Combobox ====== */
const comboVal = ref('')
const comboTechs: Option[] = [
  { value: 'vue', label: 'Vue 3' },
  { value: 'react', label: 'React 19' },
  { value: 'angular', label: 'Angular 19' },
  { value: 'svelte', label: 'Svelte 5' },
  { value: 'solid', label: 'SolidJS' },
  { value: 'astro', label: 'Astro', disabled: true },
]

/* ====== Combobox 多选 ====== */
const comboMultiVal = ref<(string | number)[]>([])

/* ====== 级联选择 ====== */
const cascaderVal = ref('')
const cascaderData: CascaderOption[] = [
  {
    value: 'zhejiang', label: '浙江省',
    children: [
      { value: 'hangzhou', label: '杭州市', children: [
        { value: 'xihu', label: '西湖区' },
        { value: 'binjiang', label: '滨江区' },
      ]},
      { value: 'ningbo', label: '宁波市', children: [
        { value: 'jiangbei', label: '江北区' },
      ]},
    ],
  },
  {
    value: 'jiangsu', label: '江苏省',
    children: [
      { value: 'nanjing', label: '南京市', children: [
        { value: 'xuanwu', label: '玄武区' },
      ]},
    ],
  },
]

/* ====== 树选择 ====== */
const treeSelectVal = ref<(string | number)[]>([])
const treeData: CascaderOption[] = [
  {
    value: 'dept-tech', label: '技术部',
    children: [
      { value: 'tech-frontend', label: '前端组' },
      { value: 'tech-backend', label: '后端组' },
      { value: 'tech-devops', label: '运维组' },
    ],
  },
  {
    value: 'dept-product', label: '产品部',
    children: [
      { value: 'product-manager', label: '产品经理' },
      { value: 'product-design', label: 'UI 设计' },
    ],
  },
]

/* ====== 日期/时间 ====== */
const dateVal = ref('')
const dateRangeVal = ref<[string, string] | null>(null)
const timeVal = ref('')

/* ====== 菜单模式 ====== */
const menuItems = [
  { label: '编辑', icon: 'square-pen' },
  { label: '复制', icon: 'file' },
  { label: '分享', icon: 'link', divided: true },
  { label: '删除', icon: 'trash', danger: true, action: () => alert('已删除') },
]
const contextMenuRef = ref<InstanceType<typeof Select>>()
function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  contextMenuRef.value?.openMenu(e)
}
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Select 选择器</h2>
    <p class="demo-desc">
      统一组件，多功能：<strong>下拉选择</strong>（options 单选/多选/拼音搜索）、
      <strong>组合框</strong>（type="combobox" 可输入可下拉）、
      <strong>级联/树选择</strong>（type="cascader|tree-select"）、
      <strong>日期/时间</strong>（type="date|date-range|time"）、
      <strong>菜单</strong>（items 操作菜单/分隔线/危险项）。
      全部使用上浮骑缝标签（label 属性）。
    </p>

    <!-- 选择模式 -->
    <div class="grid-2-col" style="margin-bottom: 24px">
      <Card title="单选">
        <Select v-model="singleVal" :options="frameworks" label="选择框架" />
        <p class="demo-val">选中: {{ singleVal || '(未选)' }}</p>
      </Card>

      <Card title="多选">
        <Select v-model="multiVal" :options="frameworks" multiple label="多选框架" />
        <p class="demo-val">选中: {{ multiVal.length ? multiVal.join(', ') : '(未选)' }}</p>
      </Card>

      <Card title="拼音搜索">
        <p class="demo-hint">输入 <code>bj</code> → 北京，<code>hz</code> → 杭州</p>
        <Select v-model="cnVal" :options="cnCities" label="城市" />
        <p class="demo-val">选中: {{ cnVal || '(未选)' }}</p>
      </Card>

      <Card title="带描述 + 禁用项">
        <Select v-model="descVal" :options="descOptions" label="角色" />
        <p class="demo-val">选中: {{ descVal || '(未选)' }}</p>
      </Card>
    </div>

    <!-- Combobox -->
    <div class="grid-2-col" style="margin-bottom: 24px">
      <Card title="Combobox 组合框">
        <Select v-model="comboVal" type="combobox" :options="comboTechs" label="选择或输入" />
        <p class="demo-val">选中: {{ comboVal || '(未选)' }}</p>
      </Card>

      <Card title="Combobox 多选 Tags">
        <Select v-model="comboMultiVal" type="combobox" :options="comboTechs" multiple label="技术栈" />
        <p class="demo-val">选中: {{ comboMultiVal.length ? comboMultiVal.join(', ') : '(空)' }}</p>
      </Card>
    </div>

    <!-- 级联 / 树选择 -->
    <div class="grid-2-col" style="margin-bottom: 24px">
      <Card title="Cascader 级联选择" overflowVisible>
        <Select v-model="cascaderVal" type="cascader" :cascaderOptions="cascaderData" label="选择地区" />
        <p class="demo-val">选中: {{ cascaderVal || '(未选)' }}</p>
      </Card>

      <Card title="TreeSelect 树选择" overflowVisible>
        <Select v-model="treeSelectVal" type="tree-select" :cascaderOptions="treeData" label="选择部门" />
        <p class="demo-val">选中: {{ treeSelectVal.length ? treeSelectVal.join(', ') : '(未选)' }}</p>
      </Card>
    </div>

    <!-- 日期 / 时间 -->
    <div class="grid-2-col" style="margin-bottom: 24px">
      <Card title="Date 日期选择" overflowVisible>
        <Select v-model="dateVal" type="date" label="选择日期" clearable />
        <p class="demo-val">选中: {{ dateVal || '(未选)' }}</p>
      </Card>

      <Card title="Date Range 日期范围" overflowVisible>
        <Select v-model="dateRangeVal" type="date-range" label="日期范围" clearable />
        <p class="demo-val">选中: {{ dateRangeVal ? `${dateRangeVal[0]} ~ ${dateRangeVal[1]}` : '(未选)' }}</p>
      </Card>

      <Card title="Time 时间选择" overflowVisible>
        <Select v-model="timeVal" type="time" label="选择时间" clearable />
        <p class="demo-val">选中: {{ timeVal || '(未选)' }}</p>
      </Card>
    </div>

    <!-- 菜单模式 -->
    <Card title="菜单模式">
      <div style="display: flex; gap: 16px; align-items: center; margin-bottom: 16px;">
        <Select type="menu" :items="menuItems" label="操作" />
        <span class="demo-hint">← 点击查看菜单效果</span>
      </div>
    </Card>

    <Card title="右键菜单" style="margin-top: 16px">
      <div class="context-menu-area" @contextmenu="onContextMenu">
        在此区域右键 → 弹出菜单
      </div>
      <Select ref="contextMenuRef" type="menu" :items="menuItems" label="操作" style="display: none" />
    </Card>
  </div>
</template>

<style scoped>
.demo-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
.demo-desc { color: var(--color-text-muted); margin-bottom: 24px; font-size: 14px; line-height: 1.6; }
.demo-hint { font-size: 12px; color: var(--color-text-muted); margin-bottom: 6px; }
.demo-val { margin-top: 6px; font-size: 12px; color: var(--color-text-muted); }
code { background: var(--color-bg-alt); padding: 1px 5px; border-radius: 3px; font-size: 12px; }
.context-menu-area {
  display: flex; align-items: center; justify-content: center;
  height: 100px; border: 2px dashed var(--color-border); border-radius: var(--radius-md);
  color: var(--color-text-muted); font-size: 13px; cursor: context-menu;
}
</style>
