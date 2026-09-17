<script setup lang="ts">
import { ref } from 'vue'
import DataTable from '@/components/data/DataTable.vue'
import Card from '@/components/data/Card.vue'
import ModalBox from '@/components/layout/ModalBox.vue'
import type { RowAction, RowContextAction } from '@/components/data/composables/types'

// ========== 基础数据 ==========
const baseCols = [
  { key: 'name', title: '员工姓名', sortable: true },
  { key: 'dept', title: '所属部门及科室', sortable: true, align: 'center' as const },
  { key: 'position', title: '现任岗位及职称职务' },
  { key: 'desc', title: '工作内容及备注说明信息' },
  { key: 'status', title: '当前在职状态', align: 'center' as const, filterValues: ['在线', '离线'] },
  { key: 'amount', title: '月薪金额(人民币元)', align: 'right' as const, sortable: true },
  { key: 'date', title: '入职报到日期', sortable: true },
  { key: 'remark', title: '备注' },
]
const baseData = [
  {
    id: 1,
    name: '张三',
    dept: '技术部',
    position: '前端开发工程师',
    desc: '负责组件库维护与前端架构设计\n微服务架构设计与性能优化\nVue3 + TypeScript + Vite 全栈技术方案',
    status: '在线',
    amount: 15800,
    date: '2024-03-15',
    remark: null,
  },
  {
    id: 2,
    name: '李四',
    dept: '产品部',
    position: '高级产品经理',
    desc: 'B端SaaS产品规划',
    status: '在线',
    amount: 22000,
    date: '2024-01-10',
    remark: '跟进中',
  },
  {
    id: 3,
    name: '王五',
    dept: '设计部',
    position: 'UI/UX 设计师',
    desc: '负责视觉规范制定',
    status: '离线',
    amount: 13500,
    date: '2024-06-01',
    remark: undefined,
  },
  {
    id: 4,
    name: '赵六',
    dept: '技术部',
    position: '后端开发',
    desc: '微服务架构设计与实现',
    status: '在线',
    amount: 18500,
    date: '2024-12-20',
    remark: '',
  },
  {
    id: 5,
    name: '孙七',
    dept: '市场部',
    position: '市场总监',
    desc: '品牌推广',
    status: '离线',
    amount: 25000,
    date: '2024-02-28',
    remark: '  ',
  },
  {
    id: 6,
    name: '周八',
    dept: '技术部',
    position: '测试工程师',
    desc: '自动化测试用例编写',
    status: '在线',
    amount: 12000,
    date: '2024-07-05',
    remark: '已归档',
  },
  {
    id: 7,
    name: '吴九',
    dept: '运营部',
    position: '内容运营',
    desc: '社区内容管理',
    status: '在线',
    amount: 10500,
    date: '2024-09-18',
    remark: null,
  },
  {
    id: 8,
    name: '郑十',
    dept: '产品部',
    position: '产品助理',
    desc: '需求文档整理',
    status: '离线',
    amount: 9000,
    date: '2024-11-20',
    remark: '  待补充  ',
  },
]

// ========== 全功能 ==========
const fullCols = [
  { key: 'id', title: '记录序号', align: 'center' as const, fixed: 'left' as const },
  { key: 'product', title: '商品全称及规格型号', sortable: true },
  { key: 'category', title: '商品所属分类', align: 'center' as const },
  { key: 'price', title: '销售单价(元)', align: 'right' as const, sortable: true },
  { key: 'stock', title: '当前库存数量', align: 'center' as const, sortable: true },
  { key: 'supplier', title: '供应商全称及联系方式', sortable: true },
  { key: 'status', title: '销售状态', align: 'center' as const, fixed: 'right' as const },
]
const fullData = Array.from({ length: 25 }, (_, i) => {
  const categories = ['电子产品', '办公用品', '日用百货', '食品饮料', '服装鞋帽']
  const suppliers = ['XX科技有限公司', 'YY贸易有限公司', 'ZZ供应链管理公司', 'AA商贸', 'BB集团']
  const statuses = ['在售', '下架', '缺货']
  return {
    id: i + 1,
    product: `${categories[i % 5].replace('品', '')}商品-${String(i + 1).padStart(2, '0')}`,
    category: categories[i % 5],
    price: Math.round((Math.random() * 900 + 10) * 100) / 100,
    stock: Math.floor(Math.random() * 500),
    supplier: suppliers[i % 5],
    status: statuses[i % 3],
  }
})
const fullSelectedKeys = ref<string[]>([])
const fullCurrentPage = ref(1)

// ========== 编辑模式 ==========
const editLog = ref('')
const editCols = [
  { key: 'product', title: '商品全称及规格型号描述', sortable: true },
  { key: 'category', title: '商品所属分类目录', align: 'center' as const },
  { key: 'stock', title: '实时库存数量', align: 'center' as const, sortable: true },
  { key: 'sales', title: '累计销售数量统计', align: 'center' as const, sortable: true },
  { key: 'price', title: '销售单价(人民币元)', align: 'right' as const, sortable: true },
  { key: 'supplier', title: '供应商公司全称及联系人' },
  { key: 'sku', title: 'SKU 编码', sortable: true },
  { key: 'brand', title: '品牌名称' },
  { key: 'origin', title: '产地（省/市）', align: 'center' as const },
  { key: 'unit', title: '计量单位', align: 'center' as const },
  { key: 'weight', title: '单件重量(kg)', align: 'right' as const, sortable: true },
  { key: 'remark', title: '备注说明' },
]
const editData = [
  {
    id: 1,
    product: '无线蓝牙耳机',
    category: '电子产品',
    stock: 256,
    sales: 183,
    price: 299,
    supplier: 'XX科技有限公司',
    sku: 'SKU-1001',
    brand: '声阔',
    origin: '广东深圳',
    unit: '副',
    weight: 0.18,
    remark: '支持蓝牙 5.3',
  },
  {
    id: 2,
    product: '机械键盘',
    category: '电子产品',
    stock: 128,
    sales: 97,
    price: 459,
    supplier: 'YY贸易有限公司',
    sku: 'SKU-1002',
    brand: 'Keychron',
    origin: '江苏苏州',
    unit: '把',
    weight: 0.86,
    remark: '红轴 87 键',
  },
  {
    id: 3,
    product: '办公椅人体工学',
    category: '办公用品',
    stock: 45,
    sales: 32,
    price: 1299,
    supplier: 'ZZ供应链管理公司',
    sku: 'SKU-2001',
    brand: '西昊',
    origin: '浙江湖州',
    unit: '张',
    weight: 12.5,
    remark: '需自行组装',
  },
  {
    id: 4,
    product: 'A4打印纸',
    category: '办公用品',
    stock: 800,
    sales: 620,
    price: 25,
    supplier: 'AA商贸',
    sku: 'SKU-2002',
    brand: '得力',
    origin: '山东济南',
    unit: '包',
    weight: 2.2,
    remark: '70g 500 张',
  },
  {
    id: 5,
    product: '保温杯不锈钢',
    category: '日用百货',
    stock: 300,
    sales: 215,
    price: 89,
    supplier: 'BB集团',
    sku: 'SKU-3001',
    brand: '膳魔师',
    origin: '广东东莞',
    unit: '个',
    weight: 0.32,
    remark: '500ml 316 不锈钢',
  },
  {
    id: 6,
    product: '充电宝20000mAh',
    category: '电子产品',
    stock: 150,
    sales: 98,
    price: 159,
    supplier: 'XX科技有限公司',
    sku: 'SKU-1003',
    brand: '罗马仕',
    origin: '广东惠州',
    unit: '个',
    weight: 0.4,
    remark: '22.5W 快充',
  },
]

// ========== 列级编辑开关（对齐 SaaS 副本） ==========
const colEditCols = [
  { key: 'name', title: '员工姓名', sortable: true },
  { key: 'dept', title: '所属部门' },
  { key: 'code', title: '工号（只读）', editable: false },
  { key: 'status', title: '在职状态', options: ['在职', '离职', '试用期'], editable: false },
]
const colEditData = [
  { id: 1, name: '张三', dept: '技术部', code: 'E001', status: '在职' },
  { id: 2, name: '李四', dept: '产品部', code: 'E002', status: '在职' },
  { id: 3, name: '王五', dept: '设计部', code: 'E003', status: '试用期' },
  { id: 4, name: '赵六', dept: '市场部', code: 'E004', status: '在职' },
  { id: 5, name: '孙七', dept: '运营部', code: 'E005', status: '离职' },
  { id: 6, name: '周八', dept: '技术部', code: 'E006', status: '在职' },
  { id: 7, name: '吴九', dept: '产品部', code: 'E007', status: '试用期' },
  { id: 8, name: '郑十', dept: '设计部', code: 'E008', status: '在职' },
  { id: 9, name: '钱十一', dept: '市场部', code: 'E009', status: '离职' },
  { id: 10, name: '陈十二', dept: '运营部', code: 'E010', status: '在职' },
]

// ========== 列值类型（Excel 输入归一化） ==========
const typedLog = ref('')
const typedCols = [
  { key: 'product', title: '商品名称' },
  { key: 'shipDate', title: '发货日期（type=date）', type: 'date' as const, align: 'center' as const },
  { key: 'amount', title: '结算金额（type=number）', type: 'number' as const, align: 'right' as const },
  { key: 'code', title: '商品编码（type=text）', type: 'text' as const },
  { key: 'slot', title: '预约时段（type=time）', type: 'time' as const, align: 'center' as const },
]
const typedData = [
  { id: 1, product: '无线蓝牙耳机', shipDate: '2026-09-12', amount: '1234.5', code: '007', slot: '14:30' },
  { id: 2, product: '机械键盘', shipDate: '2026-08-03', amount: '899', code: '012', slot: '09:00' },
  { id: 3, product: '显示器支架', shipDate: '2026-07-21', amount: '258.8', code: '103', slot: '16:45' },
]

// ========== 图片列 ==========
const imageCols = [
  { key: 'avatar', title: '员工头像照片', imageSize: 44, align: 'center' as const },
  { key: 'name', title: '员工姓名', sortable: true },
  { key: 'role', title: '担任职务及岗位角色' },
  { key: 'mail', title: '电子邮箱地址' },
  { key: 'status', title: '当前在职状态', align: 'center' as const },
]
const imageData = [
  {
    id: 1,
    avatar: 'https://picsum.photos/seed/alice/88/88',
    name: 'Alice',
    role: '前端开发',
    mail: 'alice@company.com',
    status: '在线',
  },
  { id: 2, avatar: '', name: 'Bob', role: '产品经理', mail: 'bob@company.com', status: '在线' },
  {
    id: 3,
    avatar: 'https://picsum.photos/seed/charlie/88/88',
    name: 'Charlie',
    role: 'UI 设计师',
    mail: 'charlie@company.com',
    status: '离线',
  },
  {
    id: 4,
    avatar: 'https://picsum.photos/seed/diana/88/88',
    name: 'Diana',
    role: '后端开发',
    mail: 'diana@company.com',
    status: '在线',
  },
  { id: 5, avatar: '', name: 'Eve', role: '测试工程师', mail: 'eve@company.com', status: '离线' },
]
const imageSelectedKeys = ref<string[]>([])
const imageBatchLog = ref('')
function onImageBatchChange(colKey: string, newValue: string, rowKeys: string[]) {
  imageBatchLog.value = `批量修改 ${rowKeys.length} 行：列「${colKey}」= ${newValue}（演示事件，未改真实数据）`
}

// ========== 列下拉选项 ==========
const dropdownCols = [
  { key: 'name', title: '员工姓名', sortable: true },
  {
    key: 'dept',
    title: '所属部门及科室',
    options: ['技术部', '产品部', '设计部', '市场部', '运营部'],
    align: 'center' as const,
  },
  {
    key: 'role',
    title: '岗位角色及技术方向',
    options: ['前端开发', '后端开发', '产品经理', 'UI设计师', '测试工程师', '运营专员'],
  },
  { key: 'level', title: '职级及薪资等级', options: ['P5', 'P6', 'P7', 'P8', 'M1', 'M2'], align: 'center' as const },
  { key: 'status', title: '员工在职状态', options: ['在职', '离职', '试用期', '实习'], align: 'center' as const },
]
const dropdownData = [
  { id: 1, name: '张三', dept: '技术部', role: '前端开发', level: 'P6', status: '在职' },
  { id: 2, name: '李四', dept: '产品部', role: '产品经理', level: 'P7', status: '在职' },
  { id: 3, name: '王五', dept: '设计部', role: 'UI设计师', level: 'P5', status: '试用期' },
  { id: 4, name: '赵六', dept: '技术部', role: '后端开发', level: 'P7', status: '在职' },
  { id: 5, name: '孙七', dept: '市场部', role: '运营专员', level: 'P6', status: '实习' },
]

// ========== 操作按钮 + 右键菜单 ==========
const actionLog = ref('')
const actionRows = ref([
  { id: 1, name: '张三', dept: '技术部', position: '前端开发', status: '在职' },
  { id: 2, name: '李四', dept: '产品部', position: '产品经理', status: '在职' },
  { id: 3, name: '王五', dept: '设计部', position: 'UI设计师', status: '试用期' },
  { id: 4, name: '赵六', dept: '技术部', position: '后端开发', status: '在职' },
  { id: 5, name: '孙七', dept: '市场部', position: '运营专员', status: '实习' },
])
const actionCols = [
  { key: 'name', title: '员工姓名', sortable: true },
  { key: 'dept', title: '所属部门及科室' },
  { key: 'position', title: '现任岗位职称职务及级别' },
  { key: 'status', title: '在职状态及备注说明' },
]
const rowActions: RowAction[] = [
  { key: 'edit', label: '编辑', icon: 'pencil' },
  { key: 'delete', label: '删除', icon: 'trash2', variant: 'danger' },
]
/** 右键菜单项 — 用 onClick 内联绑定，比事件监听更直观 */
const rowContextActions: RowContextAction[] = [
  {
    key: 'view',
    label: '查看详情',
    icon: 'eye',
    onClick: (row) => {
      actionLog.value = `查看：${row.name}`
    },
  },
  {
    key: 'copy',
    label: '复制姓名',
    icon: 'copy',
    onClick: (row) => {
      navigator.clipboard?.writeText(row.name)
      actionLog.value = `已复制：${row.name}`
    },
  },
  {
    key: 'delete',
    label: '删除此行',
    icon: 'trash2',
    danger: true,
    onClick: (row) => {
      actionRows.value = actionRows.value.filter((r) => r.id !== row.id)
      actionLog.value = `已删除：${row.name}`
    },
  },
]
function onRowAction(actionKey: string, row: Record<string, any>) {
  if (actionKey === 'delete') {
    actionRows.value = actionRows.value.filter((r) => r.id !== row.id)
    actionLog.value = `已删除：${row.name}`
  } else if (actionKey === 'edit') {
    actionLog.value = `编辑：${row.name}`
  }
}
function addRow() {
  const id = Math.max(...actionRows.value.map((r) => r.id), 0) + 1
  actionRows.value.push({ id, name: `新员工${id}`, dept: '', position: '', status: '在职' })
  actionLog.value = `已添加：新员工${id}`
}

// ========== 弹窗示例 ==========
const modal1Visible = ref(false)
const modal2Visible = ref(false)
const modal3Visible = ref(false)
const modal4Visible = ref(false)

// 多数据（不分页）
const modalLargeData = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  product: `商品-${String(i + 1).padStart(2, '0')}`,
  category: ['电子产品', '办公用品', '日用百货', '食品饮料', '服装鞋帽'][i % 5],
  stock: Math.floor(Math.random() * 500) + 10,
  sales: Math.floor(Math.random() * 300),
  price: Math.round(Math.random() * 900 + 10),
}))
const modalLargeCols = [
  { key: 'product', title: '商品名称', sortable: true, filterable: true },
  { key: 'category', title: '所属分类', align: 'center' as const, filterable: true },
  { key: 'stock', title: '库存数量', align: 'center' as const, sortable: true },
  { key: 'sales', title: '累计销量', align: 'center' as const, sortable: true },
  { key: 'price', title: '单价(元)', align: 'right' as const, sortable: true },
]

const modal2Data = [
  { id: 1, product: '无线蓝牙耳机', category: '电子产品', stock: 256, sales: 183, price: 299 },
  { id: 2, product: '机械键盘', category: '电子产品', stock: 128, sales: 97, price: 459 },
  { id: 3, product: '办公椅人体工学', category: '办公用品', stock: 45, sales: 32, price: 1299 },
  { id: 4, product: 'A4打印纸', category: '办公用品', stock: 800, sales: 620, price: 25 },
  { id: 5, product: '保温杯不锈钢', category: '日用百货', stock: 300, sales: 215, price: 89 },
  { id: 6, product: '充电宝20000mAh', category: '电子产品', stock: 150, sales: 98, price: 159 },
]
const modal2Cols = [
  { key: 'product', title: '商品名称', sortable: true },
  { key: 'category', title: '分类', align: 'center' as const },
  { key: 'stock', title: '库存', align: 'center' as const, sortable: true },
  { key: 'sales', title: '销量', align: 'center' as const },
  { key: 'price', title: '单价(元)', align: 'right' as const, sortable: true },
]
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">DataTable 数据表格</h2>
    <p class="demo-desc">通用数据表格，支持排序、筛选、分页、导出、固定列、编辑、右键菜单、卡片视图。</p>

    <!-- ===== 弹窗中的智能表格（放最上面方便测试） ===== -->
    <Card title="弹窗中的智能表格 — 全屏 + 滚动 + 筛选测试">
      <div class="demo-modal-row">
        <button class="demo-add-btn" @click="modal1Visible = true">简单弹窗 — 多数据无分页</button>
        <button class="demo-add-btn" @click="modal2Visible = true">复杂弹窗 — 统计 + 分页表格</button>
        <button class="demo-add-btn" @click="modal3Visible = true">简单弹窗 — 大数据量滚动</button>
        <button class="demo-add-btn" @click="modal4Visible = true">复杂弹窗 — 统计 + 多数据</button>
      </div>
    </Card>

    <!-- ===== 1. 基础 ===== -->
    <Card title="基础用法 — 排序 + 筛选 + 行/单元格自定义样式">
      <p class="demo-hint">行样式：在线绿色背景；单元格：金额>15000 红色加粗</p>
      <p class="demo-hint">
        「备注」列演示空白占位：null / undefined / 空串 / 纯空白串统一显示为 <code>-</code>；0、false
        等合法值不占位，有值列首尾空白不裁剪。占位仅作用于展示层，导出/筛选/列宽测量仍按原值；可用
        <code>blank-text</code> 换占位文案（传空串即关闭）。
      </p>
      <!-- ⚠️ rowStyle / cellStyle 必须用 CSS 变量而非硬编码色值：
           硬编码在暗色主题下会变成「浅底 + 浅字」导致内容不可见。 -->
      <DataTable
        namespace="demo-base"
        :columns="baseCols"
        :data="baseData"
        row-key="id"
        :truncate-threshold="20"
        :row-style="(row) => (row.status === '在线' ? { background: 'var(--color-success-bg)' } : ({} as Record<string, string>))"
        :cell-style="(key, row) => (key === 'amount' && row.amount > 15000 ? { color: 'var(--color-danger)', fontWeight: 'bold' } : ({} as Record<string, string>))"
      />
    </Card>

    <!-- ===== 2. 全功能 ===== -->
    <Card title="全功能 — 行选择 + 分页 + 导出 + 固定列">
      <DataTable
        v-model:selected-keys="fullSelectedKeys"
        v-model:current-page="fullCurrentPage"
        namespace="demo-full"
        :columns="fullCols"
        :data="fullData"
        row-key="id"
        selectable
        exportable
        export-scope="page"
        export-file-name="商品数据"
        :page-size="8"
      />
      <p class="demo-hint">已选 {{ fullSelectedKeys.length }} 行 / 第 {{ fullCurrentPage }} 页</p>
    </Card>

    <!-- ===== 3. 编辑模式 + 原始值气泡 ===== -->
    <Card title="编辑模式 — 双击编辑 + 原始值气泡 + 已修改角标">
      <p class="demo-hint">
        双击单元格编辑（Enter / F2 确认 / Escape 取消 / Tab 切列）。长按单元格拖动可框选区域， Ctrl+C 复制选区 / Ctrl+V
        粘贴（支持 Excel 表格数据，筛选后只改可见行）。修改后 hover 单元格查看原始值。
        工具栏<strong>撤销 / 重做</strong>按钮 = Ctrl+Z / Ctrl+Y（无可操作记录时置灰）。
      </p>
      <DataTable
        namespace="demo-edit"
        row-key="id"
        :columns="editCols"
        :data="editData"
        editable
        original-tooltip
        modified-mark
        exportable
        excel-exportable
        export-file-name="编辑导出"
        @cell-change="(_rk, ck, nv) => (editLog = `列「${ck}」→ ${nv}`)"
      >
        <template #toolbar-actions>
          <button
            class="toolbar-export-btn"
            title="toolbar-actions 插槽：使用方可在工具栏追加自己的按钮（刷新/导入等）"
            @click="editLog = '插槽示例按钮已点击（使用方通过 toolbar-actions 插槽注入）'"
          >
            插槽示例
          </button>
        </template>
      </DataTable>
      <p v-if="editLog" class="demo-hint" style="color: var(--color-primary)">
        {{ editLog }}
      </p>
    </Card>

    <!-- ===== 3.5 列级编辑开关（对齐 SaaS 副本） ===== -->
    <Card title="列级编辑开关 — 可编辑 / 只读分色对比">
      <p class="demo-hint">
        列配置 <code>editable: false</code> 可禁用单列编辑：<strong>工号</strong>列双击不会进入编辑，
        <strong>在职状态</strong>列连下拉也不出现（不可编辑就不给「可下拉」暗示）。
      </p>
      <p class="demo-hint">
        <strong>选中颜色即「能否编辑」</strong>：点<strong>员工姓名 / 所属部门</strong>（可编辑）→
        <span style="color: var(--dt-select)">紫色</span>边框 + 紫色填充柄；
        点<strong>工号 / 在职状态</strong>（只读）→ 蓝色边框，且无填充柄。
        <br />
        填充柄（右下角小点）= 拖拽批量填充，<strong>只在可编辑单元格出现</strong>。
      </p>
      <DataTable
        namespace="demo-col-edit"
        row-key="id"
        :columns="colEditCols"
        :data="colEditData"
        editable
        max-height="280px"
      />
    </Card>

    <!-- ===== 3.6 列值类型（Excel 输入习惯对齐） ===== -->
    <Card title="列值类型 — Excel 式输入归一化">
      <p class="demo-hint">
        列声明 <code>type</code> 后，<strong>双击编辑提交</strong>会按类型归一化（未声明 type 的列行为完全不变）：
        日期列输入 <code>9/12</code> → 当年 <code>9月12日</code>；金额列输入 <code>￥1,234.50</code> → <code>1234.5</code>；
        编码列声明 <code>text</code> 保住前导零 <code>007</code>（number 列的 <code>007</code> 也保原样，不静默改成 7）。
        金额列默认<strong>右对齐 + 等宽数字</strong>；移动端编辑 number/日期列弹数字键盘。
        非法值（如日期列输 <code>2026-02-31</code>、金额列输 <code>abc</code>）不落库 →
        Enter 提交时<strong>该格红圈 + 气泡提示</strong>并保持编辑态待修正（继续输入提示即消失）；失焦提交则丢弃并全局提示。
      </p>
      <DataTable
        namespace="demo-cell-type"
        row-key="id"
        :columns="typedCols"
        :data="typedData"
        editable
        max-height="280px"
        @cell-change="(_rk, ck, nv) => (typedLog = `列「${ck}」→ ${nv}`)"
      />
      <p v-if="typedLog" class="demo-hint" style="color: var(--color-primary)">
        {{ typedLog }}
      </p>
    </Card>

    <!-- ===== 4. 图片列 + 批量修改 ===== -->
    <Card title="图片列 + 批量修改">
      <p class="demo-hint">空头像双击可粘贴/拖入图片。勾选多行 → 工具栏"批量修改"统一改值。</p>
      <DataTable
        v-model:selected-keys="imageSelectedKeys"
        namespace="demo-image"
        :columns="imageCols"
        :data="imageData"
        row-key="id"
        selectable
        editable
        @batch-change="onImageBatchChange"
      />
      <p v-if="imageBatchLog" class="demo-hint" style="color: var(--color-primary)">
        {{ imageBatchLog }}
      </p>
    </Card>

    <!-- ===== 5. 列下拉选项 ===== -->
    <Card title="列下拉选项 — 预设选项列表">
      <p class="demo-hint">双击部门、角色、职级、状态列 → 弹出选项面板；双击姓名列 → 自由输入。</p>
      <DataTable namespace="demo-dropdown" :columns="dropdownCols" :data="dropdownData" row-key="id" editable />
    </Card>

    <!-- ===== 6. 操作按钮 + 右键菜单（展示新功能 onClick） ===== -->
    <Card title="操作按钮 + 行右键菜单 — onClick 内联绑定">
      <p class="demo-hint">
        每行末尾有编辑/删除按钮；<strong>右键数据行</strong>弹出菜单，菜单项通过 <code>onClick</code> 直接绑定回调。
      </p>
      <DataTable
        namespace="demo-actions"
        :columns="actionCols"
        :data="actionRows"
        row-key="id"
        :row-actions="rowActions"
        :row-context-actions="rowContextActions"
        editable
        @row-action="onRowAction"
      />
      <div v-if="actionLog" class="demo-hint" style="color: var(--color-primary); margin-top: 8px">
        {{ actionLog }}
      </div>
      <button class="demo-add-btn" @click="addRow">+ 添加行</button>
    </Card>

    <!-- ===== 7. 卡片视图 ===== -->
    <Card title="卡片视图 — 移动端自适应">
      <p class="demo-hint">cardBreakpoint=9999 强制卡片模式；实际使用时设为 768 即可在窄屏自动切换。</p>
      <DataTable namespace="demo-card" :columns="baseCols" :data="baseData" row-key="id" :card-breakpoint="9999" />
    </Card>

    <!-- 弹窗1：简单 + 多数据无分页 -->
    <ModalBox v-model:visible="modal1Visible" title="商品库存（无分页）" size="xl">
      <DataTable namespace="demo-modal1" :columns="modalLargeCols" :data="modalLargeData" row-key="id" />
    </ModalBox>

    <!-- 弹窗2：统计 + 栅格 + 分页 -->
    <ModalBox v-model:visible="modal2Visible" title="销售数据概览" size="xl">
      <div class="modal-grid">
        <Card type="stat" value="1,286" label="总销量" icon="shopping-cart" color="var(--color-primary)" />
        <Card type="stat" value="¥58.9万" label="销售额" icon="dollar-sign" color="var(--color-success)" />
        <Card type="stat" value="156" label="商品种类" icon="package" color="#F59E0B" />
        <Card type="stat" value="↓ 5.2%" label="退货率" icon="trending-down" color="var(--color-danger)" />
      </div>
      <p style="margin: 16px 0 8px; color: var(--color-text-secondary); font-size: 14px">
        以下为各商品库存及销售明细：
      </p>
      <DataTable namespace="demo-modal2" :columns="modal2Cols" :data="modal2Data" row-key="id" :page-size="4" />
    </ModalBox>

    <!-- 弹窗3：简单 + 多数据无分页 -->
    <ModalBox v-model:visible="modal3Visible" title="商品库存（大数据量）" size="xl">
      <DataTable namespace="demo-modal3" :columns="modalLargeCols" :data="modalLargeData" row-key="id" />
    </ModalBox>

    <!-- 弹窗4：统计 + 多数据无分页 -->
    <ModalBox v-model:visible="modal4Visible" title="销售数据明细（无分页）" size="xl">
      <div class="modal-grid">
        <Card type="stat" value="30" label="商品总数" icon="package" color="var(--color-primary)" />
        <Card type="stat" value="¥12.8万" label="总货值" icon="dollar-sign" color="var(--color-success)" />
        <Card type="stat" value="5" label="品类" icon="grid" color="#F59E0B" />
        <Card type="stat" value="↑ 12%" label="环比增长" icon="trending-up" color="var(--color-success)" />
      </div>
      <p style="margin: 16px 0 8px; color: var(--color-text-secondary); font-size: 14px">滚动查看更多数据：</p>
      <DataTable namespace="demo-modal4" :columns="modalLargeCols" :data="modalLargeData" row-key="id" />
    </ModalBox>
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
}
.demo-hint {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--color-text-muted);
}
.demo-add-btn {
  margin-top: 8px;
  padding: 6px 16px;
  border: 1px dashed var(--color-primary);
  border-radius: var(--radius-sm);
  background: var(--color-primary-light);
  color: var(--color-primary);
  cursor: pointer;
  font-size: 13px;
}
.demo-modal-row {
  display: flex;
  gap: 12px;
}
.modal-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 8px;
}
@media (max-width: 600px) {
  .modal-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
