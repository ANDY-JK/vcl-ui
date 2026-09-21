<script setup lang="ts">
import { ref } from 'vue'
import type { Option, CascaderOption } from '@/components/shared/types'
import Select from '@/components/form/Select.vue'
import Card from '@/components/data/Card.vue'
import Toast from '@/components/feedback/Toast.vue'

const toastRef = ref<InstanceType<typeof Toast> | null>(null)

/* ════════════════════════════════════════
   基础选择 — 单选 / 多选 / 拼音搜索
   type="select"（默认），searchable=true（默认），pinyinEnabled=true（默认）
   ════════════════════════════════════════ */
const singleVal = ref('')
const frameworks: Option[] = [
  { value: 1, label: 'React' },
  { value: 2, label: 'Vue' },
  { value: 3, label: 'Angular' },
  { value: 4, label: 'Svelte', disabled: true },
  { value: 5, label: 'SolidJS' },
  { value: 6, label: 'Qwik' },
]

const multiVal = ref<(string | number)[]>([])

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

const descVal = ref('')
const descOptions: Option[] = [
  { value: 'admin', label: '管理员', desc: '拥有全部权限，可管理用户和系统设置' },
  { value: 'editor', label: '编辑者', desc: '可编辑内容，不可管理用户' },
  { value: 'viewer', label: '只读', desc: '仅可查看内容，不可编辑' },
]

/* ════════════════════════════════════════
   多选 tag 溢出场景 — 选项很多时 tag 区域可滚动
   ════════════════════════════════════════ */
const overflowVal = ref<(string | number)[]>([])
const allCities: Option[] = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '杭州',
  '成都',
  '武汉',
  '南京',
  '西安',
  '重庆',
  '苏州',
  '天津',
  '长沙',
  '沈阳',
  '青岛',
  '大连',
  '宁波',
  '厦门',
  '福州',
  '济南',
  '哈尔滨',
  '长春',
  '昆明',
  '贵阳',
  '南宁',
  '合肥',
  '南昌',
  '太原',
  '石家庄',
  '兰州',
  '银川',
  '海口',
].map((name, i) => ({ value: i + 1, label: name }))

/* ════════════════════════════════════════
   可输入选择 — Combobox（select + allowCreate + 可编辑输入框）
   本质上就是 select 开启了输入能力：可搜索、可创建、回车选中
   ════════════════════════════════════════ */
const comboVal = ref('')
const comboTechs: Option[] = [
  { value: 'vue', label: 'Vue 3' },
  { value: 'react', label: 'React 19' },
  { value: 'angular', label: 'Angular 19' },
  { value: 'svelte', label: 'Svelte 5' },
  { value: 'solid', label: 'SolidJS' },
  { value: 'astro', label: 'Astro', disabled: true },
]

const comboMultiVal = ref<(string | number)[]>([])

/* ════════════════════════════════════════
   树形选择 — Cascader 级联 / TreeSelect 树选择
   两者共用 cascader-options 数据结构，区别仅在数据层级结构
   cascader：逐级选择（省→市→区）；tree-select：展开树选叶子节点
   单选/多选统一用 tag 显示完整路径，避免长路径被截断
   ════════════════════════════════════════ */
const cascaderSingleVal = ref<(string | number)[]>([])
const cascaderMultiVal = ref<(string | number)[]>([])
const cascaderData: CascaderOption[] = [
  {
    value: 'zhejiang',
    label: '浙江省',
    children: [
      {
        value: 'hangzhou',
        label: '杭州市',
        children: [
          { value: 'xihu', label: '西湖区' },
          { value: 'binjiang', label: '滨江区' },
        ],
      },
      { value: 'ningbo', label: '宁波市', children: [{ value: 'jiangbei', label: '江北区' }] },
    ],
  },
  {
    value: 'jiangsu',
    label: '江苏省',
    children: [{ value: 'nanjing', label: '南京市', children: [{ value: 'xuanwu', label: '玄武区' }] }],
  },
]

const treeSelectSingleVal = ref<(string | number)[]>([])
const treeSelectMultiVal = ref<(string | number)[]>([])
const treeData: CascaderOption[] = [
  {
    value: 'dept-tech',
    label: '技术部',
    children: [
      { value: 'tech-frontend', label: '前端组' },
      { value: 'tech-backend', label: '后端组' },
      { value: 'tech-devops', label: '运维组' },
    ],
  },
  {
    value: 'dept-product',
    label: '产品部',
    children: [
      { value: 'product-manager', label: '产品经理' },
      { value: 'product-design', label: 'UI 设计' },
    ],
  },
  {
    value: 'dept-market',
    label: '市场部',
    children: [
      { value: 'market-bd', label: '商务拓展' },
      { value: 'market-pr', label: '公关传播' },
      { value: 'market-content', label: '内容运营' },
    ],
  },
]

/* ════════════════════════════════════════
   日期 / 时间
   type="date" | "date-range" | "time"
   面板宽度自适应父控件，窄时保证最小 264px
   ════════════════════════════════════════ */
const dateVal = ref('')
const dateRangeVal = ref<[string, string] | null>(null)
const timeVal = ref('')

/* ════════════════════════════════════════
   菜单模式
   type="menu" + items：操作菜单 / 右键菜单
   ════════════════════════════════════════ */
const menuItems = [
  { label: '编辑', icon: 'square-pen' },
  { label: '复制', icon: 'file' },
  { label: '分享', icon: 'link', divided: true },
  { label: '删除', icon: 'trash', danger: true, action: () => toastRef.value?.show('已删除', 'success') },
]
const contextMenuRef = ref<InstanceType<typeof Select>>()
function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  contextMenuRef.value?.openMenu(e)
}
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Select 选择器</h1>
    <p class="demo-desc">
      一个组件覆盖全部选择场景：下拉选择（单选/多选/拼音搜索）、可输入选择（combobox）、
      树形选择（级联/树单选/多选）、日期时间、菜单。统一样式、统一交互、统一 tag 显示策略。
    </p>

    <!-- ══════ 基础选择 ══════ -->
    <Card title="基础选择 — 单选 / 多选 / 拼音搜索" title-as="h2" style="margin-bottom: 24px">
      <p class="demo-hint">
        <code>type="select"</code>（默认）— 拼音搜索标配（<code>pinyinEnabled=true</code>）。输入
        <code>bj</code> 可搜到北京。<br />
        <strong>统一格式（单选/多选一致）：</strong>① 已选值 tag 展示（单选 1 个 / 多选 N 个），可单独删除； ② trigger
        直接输入过滤，回车/失焦提交，<code>allowCreate</code> 允许自定义值； ③
        已选中内容后再开下拉仍展示全部选项，选中项高亮 ✓
      </p>
      <div class="grid-2-col">
        <div>
          <Select v-model="singleVal" :options="frameworks" label="单选框架" clearable />
          <p class="demo-val">选中: {{ singleVal || '(未选)' }}</p>
        </div>
        <div>
          <Select v-model="multiVal" :options="frameworks" multiple label="多选框架（tag 显示）" clearable />
          <p class="demo-val">选中: {{ multiVal.length ? multiVal.join(', ') : '(未选)' }}</p>
        </div>
        <div>
          <Select v-model="cnVal" :options="cnCities" label="城市（拼音搜索）" clearable />
          <p class="demo-val">选中: {{ cnVal || '(未选)' }}</p>
        </div>
        <div>
          <Select
            v-model="descVal"
            :options="descOptions"
            label="角色（描述，禁自建）"
            :allow-create="false"
            clearable
          />
          <p class="demo-val">选中: {{ descVal || '(未选)' }}</p>
        </div>
      </div>
    </Card>

    <!-- ══════ 多选 tag 溢出场景 ══════ -->
    <Card title="多选 tag 溢出 — 选项很多时 tag 区域可滚动" title-as="h2" style="margin-bottom: 24px">
      <p class="demo-hint">
        当多选选项很多时（如全国 32 个城市），tag 区域不会无限撑高。<br />
        <strong>防截断策略：</strong>trigger 最大高度限制 + 内部滚动；单个 tag 文本过长时
        <code>text-overflow: ellipsis</code>。
      </p>
      <div class="grid-2-col">
        <div>
          <Select v-model="overflowVal" :options="allCities" multiple label="全国城市（多选）" clearable />
          <p class="demo-val">已选 {{ overflowVal.length }} 个城市</p>
        </div>
      </div>
    </Card>

    <!-- ══════ 可输入选择 ══════ -->
    <Card title="可输入选择 — Combobox（本质 = select + 可输入）" title-as="h2" style="margin-bottom: 24px">
      <p class="demo-hint">
        <code>type="combobox"</code> —
        输入文字自动搜索匹配项，回车选中；无匹配时回车创建新选项（<code>allowCreate=true</code>）。 多选时以 tag
        标签显示已选项，可逐个删除。打开面板时自动显示全部选项。<br />
        <strong>与 select 已统一：</strong>tag 展示 / 直接输入 / 面板全量三能力单选多选完全一致，combobox 仅是
        "可输入选择"的语义别名（默认 placeholder 提示可输入）。
      </p>
      <div class="grid-2-col">
        <div>
          <Select v-model="comboVal" type="combobox" :options="comboTechs" label="选择或输入" clearable />
          <p class="demo-val">选中: {{ comboVal || '(未选)' }}</p>
        </div>
        <div>
          <Select
            v-model="comboMultiVal"
            type="combobox"
            :options="comboTechs"
            multiple
            label="技术栈（多选 tag）"
            clearable
          />
          <p class="demo-val">选中: {{ comboMultiVal.length ? comboMultiVal.join(', ') : '(空)' }}</p>
        </div>
      </div>
    </Card>

    <!-- ══════ 树形选择 ══════ -->
    <Card title="树形选择 — Cascader 级联 / TreeSelect 树（单选 + 多选）" title-as="h2" style="margin-bottom: 24px" overflow-visible>
      <p class="demo-hint">
        两者共用 <code>cascader-options</code> 数据结构，区别仅在交互方式：<br />
        <code>type="cascader"</code> — 展开树逐级选择（省→市→区）；<code>type="tree-select"</code> —
        展开树选叶子节点。<br />
        <strong>显示策略：</strong>无论单选/多选，统一用 tag 显示完整路径（如「浙江省 / 杭州市 /
        西湖区」），避免长路径在 input 中被截断。
      </p>
      <div class="grid-2-col">
        <!-- Cascader 单选 -->
        <div>
          <Select
            v-model="cascaderSingleVal"
            type="cascader"
            :cascader-options="cascaderData"
            label="选择地区（单选）"
            clearable
          />
          <p class="demo-val">选中: {{ cascaderSingleVal.length ? cascaderSingleVal.join(', ') : '(未选)' }}</p>
        </div>
        <!-- Cascader 多选 -->
        <div>
          <Select
            v-model="cascaderMultiVal"
            type="cascader"
            :cascader-options="cascaderData"
            multiple
            label="选择地区（多选）"
            clearable
          />
          <p class="demo-val">选中: {{ cascaderMultiVal.length ? cascaderMultiVal.join(', ') : '(未选)' }}</p>
        </div>
        <!-- TreeSelect 单选 -->
        <div>
          <Select
            v-model="treeSelectSingleVal"
            type="tree-select"
            :cascader-options="treeData"
            label="选择部门（单选）"
            clearable
          />
          <p class="demo-val">选中: {{ treeSelectSingleVal.length ? treeSelectSingleVal.join(', ') : '(未选)' }}</p>
        </div>
        <!-- TreeSelect 多选 -->
        <div>
          <Select
            v-model="treeSelectMultiVal"
            type="tree-select"
            :cascader-options="treeData"
            multiple
            label="选择部门（多选）"
            clearable
          />
          <p class="demo-val">选中: {{ treeSelectMultiVal.length ? treeSelectMultiVal.join(', ') : '(未选)' }}</p>
        </div>
      </div>
    </Card>

    <!-- ══════ 日期 / 时间 ══════ -->
    <Card title="日期 / 时间 — Date / DateRange / Time" title-as="h2" style="margin-bottom: 24px" overflow-visible>
      <p class="demo-hint">
        <code>type="date"</code> 单日期 · <code>type="date-range"</code> 日期范围 ·
        <code>type="time"</code> 时间选择。<br />
        面板保持固有宽度（264–300px），不随父控件拉伸：父控件再宽日历也不会被拉散；窄时自动错开不被视口裁剪。
      </p>
      <div class="grid-3-col">
        <div>
          <Select v-model="dateVal" type="date" label="选择日期" clearable />
          <p class="demo-val">选中: {{ dateVal || '(未选)' }}</p>
        </div>
        <div>
          <Select v-model="dateRangeVal" type="date-range" label="日期范围" clearable />
          <p class="demo-val">选中: {{ dateRangeVal ? `${dateRangeVal[0]} ~ ${dateRangeVal[1]}` : '(未选)' }}</p>
        </div>
        <div>
          <Select v-model="timeVal" type="time" label="选择时间" clearable />
          <p class="demo-val">选中: {{ timeVal || '(未选)' }}</p>
        </div>
      </div>
    </Card>

    <!-- ══════ 菜单模式 ══════ -->
    <Card title="菜单模式 — Menu / 右键菜单" title-as="h2">
      <p class="demo-hint">
        <code>type="menu"</code> + <code>items</code> —
        操作菜单，支持分隔线（<code>divided</code>）、危险项（<code>danger</code>）、禁用项。
      </p>
      <div style="display: flex; gap: 16px; align-items: center; margin-bottom: 16px">
        <Select type="menu" :items="menuItems" label="操作" />
        <span class="demo-hint">← 点击查看菜单效果</span>
      </div>
      <div class="context-menu-area" @contextmenu="onContextMenu">在此区域右键 → 弹出菜单</div>
      <Select ref="contextMenuRef" type="menu" :items="menuItems" label="操作" style="display: none" />
    </Card>

    <Toast ref="toastRef" position="bottom-right" />
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
.demo-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 12px;
  line-height: 1.6;
}
.demo-val {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
}
code {
  background: var(--color-bg-alt);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
}
.grid-2-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.grid-3-col {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
}
@media (max-width: 768px) {
  .grid-2-col,
  .grid-3-col {
    grid-template-columns: 1fr;
  }
}
.context-menu-area {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100px;
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-size: 13px;
  cursor: context-menu;
}
</style>
