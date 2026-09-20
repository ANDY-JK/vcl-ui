<script setup lang="ts">
import { computed, inject, nextTick, reactive, ref } from 'vue'
import DataTable from '@/components/data/DataTable.vue'
import Card from '@/components/data/Card.vue'
import ModalBox from '@/components/layout/ModalBox.vue'
import { createLocalStorage } from '@/components/data/composables/types'
import type { Column, RowAction, RowContextAction, TableStorage } from '@/components/data/composables/types'

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

/* ══════════════════════════════════════════════════════════════════
   以下按「调用方真能改的 API」逐项补齐。
   只演示有真实入参的能力；组件固定的行为（列宽测量口径、虚拟化启用判据、
   全屏忽略分页、空白占位只作用于展示层…）在提示文案里按「固定」讲，
   不做拨了没反应的开关。
   ══════════════════════════════════════════════════════════════════ */

// ========== 7. 外观三开关（读实时，可当场切） ==========
const look = reactive({ striped: true, bordered: true, hoverable: true })

// ========== 7.5 紧凑密度：dense 只在挂载时取初值，之后归工具栏按钮，
//            所以这里用两张表对照，不给它做实时开关。 ==========
const denseCols: Column[] = [
  { key: 'name', title: '员工姓名', sortable: true },
  { key: 'dept', title: '所属部门' },
  { key: 'mail', title: '邮箱' },
  { key: 'status', title: '状态', align: 'center' },
]
const denseData = baseData.slice(0, 5).map((r) => ({
  id: r.id,
  name: r.name,
  dept: r.dept,
  mail: `${r.name}@company.com`,
  status: r.status,
}))

// ========== 8. 文本处理：截断模式 / 截断阈值 / 空白占位 / 拼音搜索 ==========
const textCfg = reactive({
  truncateMode: 'ellipsis' as 'ellipsis' | 'wrap' | 'none',
  truncateThreshold: 0,
  blankText: '-',
  pinyinSearch: true,
})
const textCols: Column[] = [
  { key: 'name', title: '姓名', sortable: true },
  { key: 'addr', title: '通讯地址' },
  { key: 'note', title: '备注（含空白值）' },
  { key: 'qty', title: '数量', align: 'right' },
]
const textData = [
  {
    id: 1,
    name: '张三',
    addr: '广东省深圳市南山区粤海街道科技园高新南一道飞亚达大厦 A 座 2801 室',
    note: null,
    qty: 0,
  },
  { id: 2, name: '李四', addr: '北京市海淀区中关村大街 1 号海龙大厦', note: '', qty: 12 },
  { id: 3, name: '王五', addr: '上海市浦东新区世纪大道 100 号环球金融中心', note: '   ', qty: false },
  { id: 4, name: '赵六', addr: '浙江省杭州市西湖区文三路 478 号', note: undefined, qty: 7 },
]

// ========== 9. 加载态 / 空态（emptyText + #empty 插槽） ==========
const stateCfg = reactive({ isLoading: false, empty: 'none' as 'none' | 'noData' | 'filtered' })
const stateCols: Column[] = [
  { key: 'name', title: '员工姓名', sortable: true, filterable: true },
  { key: 'dept', title: '所属部门', filterable: true },
  { key: 'amount', title: '月薪(元)', align: 'right', sortable: true },
]
const stateData = computed(() => (stateCfg.empty === 'none' ? baseData.slice(0, 4) : []))

// ========== 10. 汇总行：函数式（客户端，收全量 props.data） ==========
const sumCols: Column[] = [
  { key: 'product', title: '商品名称', sortable: true },
  { key: 'category', title: '分类', align: 'center' },
  { key: 'qty', title: '数量', align: 'right', sortable: true },
  { key: 'amount', title: '金额(元)', align: 'right', sortable: true },
]
const sumData = [
  { id: 1, product: '无线蓝牙耳机', category: '电子产品', qty: 183, amount: 54717 },
  { id: 2, product: '机械键盘', category: '电子产品', qty: 97, amount: 44523 },
  { id: 3, product: '办公椅人体工学', category: '办公用品', qty: 32, amount: 41568 },
  { id: 4, product: 'A4打印纸', category: '办公用品', qty: 620, amount: 15500 },
  { id: 5, product: '保温杯不锈钢', category: '日用百货', qty: 215, amount: 19135 },
  { id: 6, product: '充电宝20000mAh', category: '电子产品', qty: 98, amount: 15582 },
]
/** 函数式汇总：入参是 props.data 全量，不是当前页 —— 这是固定的口径 */
function summaryFn(rows: Record<string, any>[]) {
  const qty = rows.reduce((s, r) => s + Number(r.qty), 0)
  const amount = rows.reduce((s, r) => s + Number(r.amount), 0)
  return { product: `共 ${rows.length} 条`, qty, amount }
}
/** 对象式汇总：服务端分页时后端算好整表汇总，前端照抄 */
const summaryObj = { product: '全表合计（后端下发）', qty: 1245, amount: 191025 }
const sumMode = ref<'fn' | 'obj'>('fn')

// ========== 11. 备注模式：noteMode + notes + cell-note ==========
const noteCols: Column[] = [
  { key: 'name', title: '员工姓名' },
  { key: 'dept', title: '所属部门' },
  { key: 'amount', title: '月薪(元)', align: 'right' },
]
const noteData = baseData.slice(0, 4).map((r) => ({ id: r.id, name: r.name, dept: r.dept, amount: r.amount }))
const noteMap = ref<Record<string, Record<string, string>>>({
  1: { amount: '绩效上调 8%，2026 年 1 月生效' },
  2: { name: '待谈薪' },
})
const noteLog = ref('')

// ========== 12. 日期输入顺序：MDY / DMY 两表对照 ==========
const orderCols: Column[] = [
  { key: 'product', title: '商品名称' },
  { key: 'ship', title: '发货日期', type: 'date', align: 'center' },
  { key: 'due', title: '到货日期', type: 'datetime', align: 'center' },
]
const orderDataMdy = [
  { id: 1, product: '无线蓝牙耳机', ship: '2026-09-12', due: '2026-09-15 09:00' },
  { id: 2, product: '机械键盘', ship: '2026-08-03', due: '2026-08-06 14:30' },
]
const orderDataDmy = [
  { id: 1, product: '无线蓝牙耳机', ship: '2026-12-09', due: '2026-09-15 09:00' },
  { id: 2, product: '机械键盘', ship: '2026-03-08', due: '2026-08-06 14:30' },
]

// ========== 13. 虚拟滚动：真实行数下才看得出差别 ==========
const VIRTUAL_ROWS = 5000
const vCols: Column[] = [
  { key: 'id', title: '序号', align: 'right' },
  { key: 'name', title: '姓名', sortable: true },
  { key: 'dept', title: '部门', align: 'center' },
  { key: 'score', title: '绩效分', align: 'right', sortable: true },
]
const vDepts = ['技术部', '产品部', '设计部', '市场部', '运营部']
const vData = Array.from({ length: VIRTUAL_ROWS }, (_, i) => ({
  id: i + 1,
  name: `员工${i + 1}`,
  dept: vDepts[i % 5],
  score: ((i * 37) % 100) + 1,
}))
const vCfg = reactive({ virtualScroll: true, pageVirtualMin: 0, maxHeight: '420px' as string })

// ========== 14. 类名定制：rowClass / cellClass ==========
const classCols: Column[] = [
  { key: 'name', title: '员工姓名', sortable: true },
  { key: 'dept', title: '所属部门' },
  { key: 'amount', title: '月薪(元)', align: 'right', sortable: true },
  { key: 'status', title: '状态', align: 'center' },
]
const classData = baseData
/** 行类名：月薪过万加高亮行 */
function rowClassOf(row: Record<string, any>) {
  return Number(row.amount) >= 15000 ? 'row-high-salary' : ''
}
/** 单元格类名：离线行整行置灰、金额列等宽 */
function cellClassOf(colKey: string, row: Record<string, any>) {
  if (colKey === 'amount') return 'cell-mono'
  return row.status === '离线' ? 'cell-offline' : ''
}

// ========== 15. 服务端模式（本地用假数据模拟后端，真实项目换成自己的接口） ==========
const SRV_ROWS = 47
const srvAll = Array.from({ length: SRV_ROWS }, (_, i) => ({
  id: i + 1,
  order: `SO-2026${String(i + 1).padStart(4, '0')}`,
  customer: ['张三', '李四', '王五', '赵六', '孙七'][i % 5],
  region: ['华东', '华北', '华南', '西南'][i % 4],
  amount: 1000 + ((i * 907) % 9000),
}))
const srvCols: Column[] = [
  { key: 'order', title: '订单号', sortable: true },
  { key: 'customer', title: '客户姓名', sortable: true, filterable: true },
  { key: 'region', title: '所属区域', align: 'center', filterable: true },
  { key: 'amount', title: '金额(元)', align: 'right', sortable: true },
]
const srvPage = ref(1)
const srvSize = 10
const srvSortKey = ref('')
const srvSortOrder = ref<'asc' | 'desc'>('asc')
const srvFilters = ref<Record<string, string[]>>({})
const srvKeyword = ref('')
const srvLog = ref<string[]>([])
/** 勾上就让假后端无视关键词：表格行数纹丝不动，才证明 server 档下组件一行都没自己筛 */
const srvIgnoreKeyword = ref(false)
/** 「后端」：按关键词 + 筛选 + 排序裁全量，再切当前页 —— 真实项目这段是 fetch */
const srvSorted = computed(() => {
  const kw = srvIgnoreKeyword.value ? '' : srvKeyword.value
  let rows = srvAll.filter(
    (r) =>
      (!kw || `${r.order}${r.customer}`.includes(kw)) &&
      (!srvFilters.value.region || !srvFilters.value.region.length || srvFilters.value.region.includes(r.region)) &&
      (!srvFilters.value.customer || !srvFilters.value.customer.length || srvFilters.value.customer.includes(r.customer)),
  )
  if (srvSortKey.value) {
    const k = srvSortKey.value
    const dir = srvSortOrder.value === 'asc' ? 1 : -1
    rows = [...rows].sort((a, b) => {
      const va = a[k as keyof (typeof rows)[number]]
      const vb = b[k as keyof (typeof rows)[number]]
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * dir
    })
  }
  return rows
})
const srvTotal = computed(() => srvSorted.value.length)
const srvRows = computed(() => srvSorted.value.slice((srvPage.value - 1) * srvSize, srvPage.value * srvSize))
function srvSay(msg: string) {
  srvLog.value = [`${new Date().toLocaleTimeString()} ${msg}`, ...srvLog.value].slice(0, 6)
}
/** 服务端导出：组件不再生成 CSV，改为回调通知使用方去调自己的导出接口 */
function srvExport() {
  srvSay('onExport 触发 → 真实项目在这里请求后端导出接口')
}

// ========== 16. 截图与导出 ==========
const shotCfg = reactive({ shotMode: 'preview' as 'preview' | 'download' | 'copy', screenshotMaxRows: 400 })

// ========== 17. 存储适配器与持久化（三个 prop 挂载时读一次，用 :key 重建才生效） ==========
const memStore = new Map<string, string>()
const memoryStorage: TableStorage = {
  get: (k) => memStore.get(k) ?? null,
  set: (k, v) => void memStore.set(k, v),
  remove: (k) => void memStore.delete(k),
}
const storageKind = ref<'local' | 'memory' | 'none'>('local')
const storageLog = ref('')
function dumpStorage() {
  if (storageKind.value === 'local') {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('saas_demo-store'))
    storageLog.value = `localStorage 命中 ${keys.length} 个键：${keys.join(' , ') || '（拖一次列宽再点我）'}`
  } else if (storageKind.value === 'memory') {
    storageLog.value = `内存适配器命中 ${memStore.size} 个键：${[...memStore.keys()].join(' , ') || '（拖一次列宽再点我）'}`
  } else {
    storageLog.value = 'persistence=none：不写任何存储'
  }
}

// ========== 18. 全屏与宿主 ==========
/** 本 demo 站的宿主就是 AppLayout，它 provide('toggleCollapse') 并渲染 .sidebar。
 *  组件在不传 onToggleSidebar 时正是降级去找这个 inject，所以两条路径都能当场看到效果。 */
const hostToggleCollapse = inject<() => void>('toggleCollapse', () => {})
const fsLog = ref('')
async function collapseHostSidebar() {
  hostToggleCollapse()
  await nextTick()
  const collapsed = document.querySelector('.sidebar')?.classList.contains('collapsed')
  fsLog.value = `onToggleSidebar 被调用 → 已接管 inject 降级路径，宿主侧栏${collapsed ? '收起' : '还原'}`
}

// ========== 19. 图片域名白名单 ==========
const imgCols: Column[] = [
  { key: 'avatar', title: '这一格', imageSize: 40, align: 'center' },
  { key: 'name', title: '被怎么判' },
]
/** 只用一个真能访问的图床（本站图片列本来就在用）：演示「传了 imageDomains 就整表替换默认清单」，
 *  靠的是默认清单失效，不需要再造一个不存在的域名去发真请求 —— 那样只会在审计里留下连接超时。
 *  ⚠️ 单元格文本别写域名或 data: 前缀字样：isImageUrl 的域名匹配不锚定，提一句就会被当成图片渲染成碎图。 */
const imgRows = [
  { id: 1, avatar: 'https://picsum.photos/seed/dt-a/80/80', name: '内置域名清单命中' },
  { id: 2, avatar: 'https://picsum.photos/seed/dt-b/80/80', name: '同上，地址结尾没有扩展名' },
  {
    id: 3,
    avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80"/><text x="40" y="46" font-size="14" text-anchor="middle" fill="white">内联</text></svg>',
    name: '内联数据，前缀优先恒判为图',
  },
]
/** 换成一个本站不会去请求的域名：作用只是让默认清单失效 */
const IMG_REPLACEMENT = ['example.internal-cdn.invalid']
const imgWhitelistOn = ref(false)
const imgDomains = computed(() => (imgWhitelistOn.value ? IMG_REPLACEMENT : []))

// ========== 20. 插槽：header-cell / cell / empty ==========
const slotCols: Column[] = [
  { key: 'name', title: '员工姓名', sortable: true },
  { key: 'dept', title: '所属部门' },
  { key: 'amount', title: '月薪(元)', align: 'right', sortable: true },
]
const slotData = baseData.slice(0, 5)

// ========== 21. 事件回显 ==========
const evLog = ref<string[]>([])
function evSay(msg: string) {
  evLog.value = [`${new Date().toLocaleTimeString()} ${msg}`, ...evLog.value].slice(0, 8)
}
const evCols: Column[] = [
  { key: 'name', title: '员工姓名', sortable: true, filterable: true },
  { key: 'dept', title: '所属部门', filterable: true },
  { key: 'amount', title: '月薪(元)', align: 'right', sortable: true },
  { key: 'status', title: '状态', align: 'center' },
]
const evData = baseData
const evSelected = ref<string[]>([])
const evPage = ref(1)

// ========== 22. 交互四开关（都读实时） ==========
const inter = reactive({ colSettings: true, cellSelection: true, keyboardNav: true, cellContextMenu: true })
const interCols: Column[] = [
  { key: 'name', title: '员工姓名', sortable: true },
  { key: 'dept', title: '所属部门' },
  { key: 'position', title: '岗位' },
  { key: 'amount', title: '月薪(元)', align: 'right', sortable: true },
]
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">DataTable 数据表格</h1>
    <p class="demo-desc">通用数据表格，支持排序、筛选、分页、导出、固定列、编辑、右键菜单、卡片视图。</p>

    <!-- ===== 弹窗中的智能表格（放最上面方便测试） ===== -->
    <Card title="弹窗中的智能表格 — 全屏 + 滚动 + 筛选测试" title-as="h2">
      <div class="demo-modal-row">
        <button class="demo-add-btn" @click="modal1Visible = true">简单弹窗 — 多数据无分页</button>
        <button class="demo-add-btn" @click="modal2Visible = true">复杂弹窗 — 统计 + 分页表格</button>
        <button class="demo-add-btn" @click="modal3Visible = true">简单弹窗 — 大数据量滚动</button>
        <button class="demo-add-btn" @click="modal4Visible = true">复杂弹窗 — 统计 + 多数据</button>
      </div>
    </Card>

    <!-- ===== 1. 基础 ===== -->
    <Card title="基础用法 — 排序 + 筛选 + 行/单元格自定义样式" title-as="h2">
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
        :cell-style="(key, row) => (key === 'amount' && row.amount > 15000 ? { color: 'var(--color-danger-hover)', fontWeight: 'bold' } : ({} as Record<string, string>))"
      />
    </Card>

    <!-- ===== 2. 全功能 ===== -->
    <Card title="全功能 — 行选择 + 分页 + 导出 + 固定列" title-as="h2">
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
    <Card title="编辑模式 — 双击编辑 + 原始值气泡 + 已修改角标" title-as="h2">
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
    <Card title="列级编辑开关 — 可编辑 / 只读分色对比" title-as="h2">
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
    <Card title="列值类型 — Excel 式输入归一化" title-as="h2">
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
    <Card title="图片列 + 批量修改" title-as="h2">
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
    <Card title="列下拉选项 — 预设选项列表" title-as="h2">
      <p class="demo-hint">双击部门、角色、职级、状态列 → 弹出选项面板；双击姓名列 → 自由输入。</p>
      <DataTable namespace="demo-dropdown" :columns="dropdownCols" :data="dropdownData" row-key="id" editable />
    </Card>

    <!-- ===== 6. 操作按钮 + 右键菜单（展示新功能 onClick） ===== -->
    <Card title="操作按钮 + 行右键菜单 — onClick 内联绑定" title-as="h2">
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
    <Card title="卡片视图 — 移动端自适应" title-as="h2">
      <p class="demo-hint">cardBreakpoint=9999 强制卡片模式；实际使用时设为 768 即可在窄屏自动切换。</p>
      <DataTable namespace="demo-card" :columns="baseCols" :data="baseData" row-key="id" :card-breakpoint="9999" />
    </Card>

    <!-- ===== 外观开关 ===== -->
    <Card title="外观开关 — striped / bordered / hoverable" title-as="h2">
      <p class="demo-hint">三个都是实时生效的表格样式类，默认全开，关掉即可看到差异。</p>
      <div class="demo-ck-row">
        <label class="demo-ck"><input v-model="look.striped" type="checkbox" /> 斑马纹 striped</label>
        <label class="demo-ck"><input v-model="look.bordered" type="checkbox" /> 外框与网格线 bordered</label>
        <label class="demo-ck"><input v-model="look.hoverable" type="checkbox" /> 悬停行高亮 hoverable</label>
      </div>
      <DataTable
        namespace="demo-look"
        :columns="evCols"
        :data="evData"
        row-key="id"
        :striped="look.striped"
        :bordered="look.bordered"
        :hoverable="look.hoverable"
      />
    </Card>

    <!-- ===== 紧凑密度 ===== -->
    <Card title="紧凑密度 — dense 是初值，不是受控开关" title-as="h2">
      <p class="demo-hint">
        <code>dense</code> 只在挂载时读一次作为初值，渲染后密度归工具栏的紧凑按钮管，再改 prop 不会回灌
        —— 这是组件的固定行为，所以这里给两张表对照，而不是做一个拨了没反应的开关。
      </p>
      <div class="demo-two-col">
        <div>
          <p class="demo-sub">dense 默认（false）：行高 40px</p>
          <DataTable namespace="demo-dense-off" :columns="denseCols" :data="denseData" row-key="id" />
        </div>
        <div>
          <p class="demo-sub">dense=true：行高 32px</p>
          <DataTable namespace="demo-dense-on" :columns="denseCols" :data="denseData" row-key="id" dense />
        </div>
      </div>
    </Card>

    <!-- ===== 文本处理 ===== -->
    <Card title="文本处理 — truncateMode / truncateThreshold / blankText / pinyinSearch" title-as="h2">
      <div class="demo-ck-row">
        <label class="demo-ck">
          截断模式
          <select v-model="textCfg.truncateMode">
            <option value="ellipsis">ellipsis 单行省略</option>
            <option value="wrap">wrap 自动换行</option>
            <option value="none">none 不换行不省略</option>
          </select>
        </label>
        <label class="demo-ck">
          truncateThreshold
          <input v-model.number="textCfg.truncateThreshold" type="number" min="0" step="5" class="demo-num" />
          （0=不按字数判定，按列宽实测）
        </label>
        <label class="demo-ck">
          blankText
          <input v-model="textCfg.blankText" type="text" class="demo-num" maxlength="6" />
          （空串=关闭占位）
        </label>
        <label class="demo-ck"><input v-model="textCfg.pinyinSearch" type="checkbox" /> pinyinSearch 拼音搜索</label>
      </div>
      <p class="demo-hint">
        打开工具栏搜索框输 <code>zs</code> 或 <code>zhangsan</code>：pinyinSearch 开着才能命中「张三」，关掉就只能整字匹配。
        备注列演示空白口径 —— <code>null / undefined / 空串 / 纯空白串</code> 都吃
        <code>blankText</code>；<code>0</code> 与 <code>false</code> 是合法值不占位。
        占位<strong>只作用于展示层</strong>是固定的：导出、筛选候选、列宽测量一律按原值，没有开关能改这条。
      </p>
      <DataTable
        namespace="demo-text"
        :columns="textCols"
        :data="textData"
        row-key="id"
        :truncate-mode="textCfg.truncateMode"
        :truncate-threshold="textCfg.truncateThreshold"
        :blank-text="textCfg.blankText"
        :pinyin-search="textCfg.pinyinSearch"
        max-height="260px"
      />
    </Card>

    <!-- ===== 加载态与空态 ===== -->
    <Card title="加载态与空态 — isLoading / emptyText / #empty 插槽" title-as="h2">
      <div class="demo-ck-row">
        <label class="demo-ck"><input v-model="stateCfg.isLoading" type="checkbox" /> isLoading 加载骨架</label>
        <label class="demo-ck">
          数据
          <select v-model="stateCfg.empty">
            <option value="none">有数据</option>
            <option value="noData">空数组</option>
          </select>
        </label>
      </div>
      <p class="demo-hint">
        空态文案不传时走组件内置 i18n（跟随中英切换）；传 <code>empty-text</code> 覆盖。
        想看「筛选后无结果」的另一种空态：保留数据，在工具栏搜一个不存在的词。
      </p>
      <DataTable
        namespace="demo-state"
        :columns="stateCols"
        :data="stateData"
        row-key="id"
        :is-loading="stateCfg.isLoading"
        empty-text="这里没有一行数据"
      />
      <p class="demo-sub" style="margin-top: 16px">用 #empty 插槽整块接管空态：</p>
      <DataTable namespace="demo-empty-slot" :columns="stateCols" :data="[]" row-key="id">
        <template #empty="{ filtered }">
          <div class="demo-empty-slot">
            <strong>{{ filtered ? '没有符合筛选条件的记录' : '暂无数据' }}</strong>
            <span>（插槽作用域给了 filtered，能区分「本来就是空」和「筛没了」）</span>
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- ===== 汇总行 ===== -->
    <Card title="汇总行 — summary 函数式与对象式" title-as="h2">
      <div class="demo-ck-row">
        <label class="demo-ck">
          形式
          <select v-model="sumMode">
            <option value="fn">函数（客户端：组件把 props.data 交给你算）</option>
            <option value="obj">对象（服务端：后端算好合计，前端照抄）</option>
          </select>
        </label>
      </div>
      <p class="demo-hint">
        函数入参是 <code>props.data</code> <strong>全量</strong>，不是当前页 —— 这条口径是固定的。
        返回值按列 key 对齐，没给 key 的列留空；汇总行永远贴在表尾，不随行滚动重叠。
      </p>
      <DataTable
        namespace="demo-summary"
        :columns="sumCols"
        :data="sumData"
        row-key="id"
        :page-size="4"
        :summary="sumMode === 'fn' ? summaryFn : summaryObj"
      />
    </Card>

    <!-- ===== 备注模式 ===== -->
    <Card title="备注模式 — noteMode / notes / cell-note 事件" title-as="h2">
      <p class="demo-hint">
        开着 <code>noteMode</code> 时，有备注的单元格右上角有标记，hover 看内容、点击填备注。
        填完组件只 <code>emit('cell-note')</code>，<strong>不写回 notes</strong> —— 落不落库、落到哪，是使用方的事
        （这条是固定的）。下面把回调写回 ref，所以刷新前一直留着。
      </p>
      <DataTable
        namespace="demo-note"
        :columns="noteCols"
        :data="noteData"
        row-key="id"
        note-mode
        :notes="noteMap"
        @cell-note="
          (rk, ck, val) => {
            noteMap[rk] = { ...(noteMap[rk] || {}), [ck]: val }
            noteLog = `备注：行 ${rk} / 列 ${ck} → ${val || '（清空）'}`
          }
        "
      />
      <p v-if="noteLog" class="demo-hint" style="color: var(--color-primary)">{{ noteLog }}</p>
    </Card>

    <!-- ===== 日期输入顺序 ===== -->
    <Card title="日期输入顺序 — dateInputOrder（MDY / DMY 必须自己声明）" title-as="h2">
      <p class="demo-hint">
        两张表数据完全一样，只换 <code>date-input-order</code>。双击日期格输
        <code>9/12</code> 再按 Enter：左表 → <code>2026-09-12</code>，右表 →
        <code>2026-12-09</code>。月、日都 ≤12 时组件<strong>不可能</strong>自己猜出你要哪个，
        所以这个 prop 是使用方的义务，不声明就按默认 MDY 走（固定行为）。
      </p>
      <div class="demo-two-col">
        <div>
          <p class="demo-sub">dateInputOrder='MDY'（默认）</p>
          <DataTable
            namespace="demo-order-mdy"
            :columns="orderCols"
            :data="orderDataMdy"
            row-key="id"
            editable
            date-input-order="MDY"
          />
        </div>
        <div>
          <p class="demo-sub">dateInputOrder='DMY'</p>
          <DataTable
            namespace="demo-order-dmy"
            :columns="orderCols"
            :data="orderDataDmy"
            row-key="id"
            editable
            date-input-order="DMY"
          />
        </div>
      </div>
    </Card>

    <!-- ===== 虚拟滚动 ===== -->
    <Card title="虚拟滚动 — virtualScroll / pageVirtualMin" title-as="h2">
      <p class="demo-hint">
        下面这张表喂 {{ VIRTUAL_ROWS }} 行。开与关都渲染得动，但关掉之后 DOM 里就是
        {{ VIRTUAL_ROWS }} 个 <code>&lt;tr&gt;</code>，滚动会明显发涩 —— 按 F12 数一下
        <code>document.querySelectorAll('.table-scroll tbody tr').length</code> 对比最直观。
      </p>
      <p class="demo-hint">
        启用判据是<strong>实测出来的、固定不可配</strong>：总行数 &gt; 可视行数 + 上下各
        overscan 10 行才开虚拟化，所以面板高矮、dense、浏览器缩放都能自适应；
        <code>pageVirtualMin</code> 只能在此基础上<strong>额外抬高</strong>启用门槛，不能反过来强制开启。
        页面滚动态的虚拟化另有前置条件（固定）：没设 <code>maxHeight</code> 且没分页。
      </p>
      <div class="demo-ck-row">
        <label class="demo-ck"><input v-model="vCfg.virtualScroll" type="checkbox" /> virtualScroll（默认开）</label>
        <label class="demo-ck">
          maxHeight
          <select v-model="vCfg.maxHeight">
            <option value="420px">420px（表格内滚动）</option>
            <option value="">不设（跟随页面滚动）</option>
          </select>
        </label>
        <label class="demo-ck">
          pageVirtualMin
          <input v-model.number="vCfg.pageVirtualMin" type="number" min="0" step="1000" class="demo-num" />
          （只在「不设 maxHeight」那条路上起作用）
        </label>
      </div>
      <DataTable
        namespace="demo-virtual"
        :columns="vCols"
        :data="vData"
        row-key="id"
        :virtual-scroll="vCfg.virtualScroll"
        :page-virtual-min="vCfg.pageVirtualMin"
        :max-height="vCfg.maxHeight || undefined"
      />
    </Card>

    <!-- ===== 类名定制 ===== -->
    <Card title="类名定制 — rowClass / cellClass（与 rowStyle / cellStyle 并列）" title-as="h2">
      <p class="demo-hint">
        回调签名固定的两对：行级 <code>(row, index)</code>、单元格级
        <code>(colKey, row, index)</code>，各有一个 class 版和一个 style 版。
        本项目样式走 CSS 变量，硬编码色值在暗色主题下会看不见。
      </p>
      <DataTable
        namespace="demo-class"
        :columns="classCols"
        :data="classData"
        row-key="id"
        :row-class="rowClassOf"
        :cell-class="cellClassOf"
      />
    </Card>

    <!-- ===== 服务端模式 ===== -->
    <Card title="服务端模式 — searchMode / filterMode / filters / sortKey + sortOrder / total / onExport" title-as="h2">
      <p class="demo-hint" style="color: var(--color-warning)">
        这块是<strong>用本地假数据模拟后端</strong>（共 {{ SRV_ROWS }} 条藏在 <code>srvAll</code> 里）。
        真实项目把「后端」那段换成自己的接口请求即可，组件侧的用法一字不改。
      </p>
      <p class="demo-hint">
        设了 <code>searchMode='server'</code> 后，组件<strong>不再本地过滤</strong>，只把关键词
        <code>emit('search')</code> 抛出来；<code>filterMode='server'</code> 同理只抛
        <code>filter</code>；受控 <code>sortKey</code> 非空时组件也跳过本地排序
        （这三条互斥是固定的，不能既要本地筛又要服务端筛）。总条数得靠 <code>total</code>
        告诉组件 —— 它手里只有当前页，猜不出全量。
      </p>
      <div class="demo-ck-row">
        <label class="demo-ck">
          <input v-model="srvIgnoreKeyword" type="checkbox" />
          让假后端无视关键词（组件此刻应当一行都不少 —— 它不参与过滤）
        </label>
      </div>
      <DataTable
        v-model:current-page="srvPage"
        v-model:filters="srvFilters"
        namespace="demo-server"
        :columns="srvCols"
        :data="srvRows"
        row-key="id"
        search-mode="server"
        filter-mode="server"
        exportable
        :page-size="srvSize"
        :total="srvTotal"
        :sort-key="srvSortKey || undefined"
        :sort-order="srvSortOrder"
        :on-export="srvExport"
        @search="
          (v) => {
            srvKeyword = v
            srvPage = 1
            srvSay(`search → “${v || '（清空）'}” 已交给假后端`)
          }
        "
        @sort="
          (k, o) => {
            srvSortKey = k
            srvSortOrder = o
            srvSay(`sort → ${k} ${o}，请后端按这个排`)
          }
        "
        @filter="
          (f) => {
            srvPage = 1
            srvSay(`filter → ${JSON.stringify(f)}`)
          }
        "
        @page-change="
          (p, s) => srvSay(`pageChange → 第 ${p} 页 / 每页 ${s} 条`)
        "
      />
      <div class="demo-log">
        <p v-for="(l, i) in srvLog" :key="i">{{ l }}</p>
        <p v-if="!srvLog.length" class="demo-hint">（还没抛过事件：试着搜索、点表头排序、勾筛选、翻一页）</p>
      </div>
    </Card>

    <!-- ===== 截图与导出 ===== -->
    <Card title="截图与导出 — shotMode / screenshotMaxRows / excelExportable / exportScope" title-as="h2">
      <div class="demo-ck-row">
        <label class="demo-ck">
          shotMode
          <select v-model="shotCfg.shotMode">
            <option value="preview">preview 弹窗预览</option>
            <option value="download">download 直接下 PNG</option>
            <option value="copy">copy 直接进剪贴板</option>
          </select>
        </label>
        <label class="demo-ck">
          screenshotMaxRows
          <input v-model.number="shotCfg.screenshotMaxRows" type="number" min="1" step="1" class="demo-num" />
          （行数超过它就只提示不出图）
        </label>
      </div>
      <p class="demo-hint">
        把它调成 3 再点截图，就能看到超限拦截。截图口径里还有一条固定的硬阈值：表格
        scrollHeight 超 8000px 一律不出图（浏览器 canvas 尺寸上限决定的，不开放配置）。
      </p>
      <DataTable
        namespace="demo-shot"
        :columns="evCols"
        :data="evData"
        row-key="id"
        exportable
        excel-exportable
        export-scope="page"
        export-file-name="截图与导出演示"
        :page-size="5"
        :shot-mode="shotCfg.shotMode"
        :screenshot-max-rows="shotCfg.screenshotMaxRows"
      />
    </Card>

    <!-- ===== 存储适配器与持久化 ===== -->
    <Card title="存储适配器 — storage / namespace / persistence" title-as="h2">
      <p class="demo-hint">
        持久化存的是<strong>布局</strong>：列宽、列顺序、隐藏列、固定列、密度。
        <code>storage</code> / <code>namespace</code> / <code>persistence</code> 三个都在挂载时读一次，
        换档位靠 <code>:key</code> 重建表格（下面已经替你接上了）。
        <code>persistence='auto'</code> 下有一条固定豁免：受控 <code>sortKey</code> 时排序不持久化、
        <code>filterMode='server'</code> 时筛选不持久化 —— 数据归使用方管，组件不越权记。
      </p>
      <div class="demo-ck-row">
        <label class="demo-ck">
          storage
          <select v-model="storageKind">
            <option value="local">createLocalStorage('demo-store')（默认同款，前缀隔离）</option>
            <option value="memory">自定义内存适配器（刷新即忘）</option>
            <option value="none">内存适配器 + persistence='none'（完全不落存储）</option>
          </select>
        </label>
        <button class="demo-add-btn" @click="dumpStorage">查看当前适配器里存了什么</button>
      </div>
      <p v-if="storageLog" class="demo-hint" style="color: var(--color-primary)">{{ storageLog }}</p>
      <p class="demo-hint">做法：拖一下下面表格的列宽 → 点上面按钮 → 刷新页面看列宽还在不在。</p>
      <DataTable
        :key="storageKind"
        namespace="demo-store"
        :columns="evCols"
        :data="evData"
        row-key="id"
        :storage="storageKind === 'local' ? createLocalStorage('demo-store') : memoryStorage"
        :persistence="storageKind === 'none' ? 'none' : 'auto'"
      />
    </Card>

    <!-- ===== 全屏与宿主 ===== -->
    <Card title="全屏与宿主 — onToggleSidebar / fullscreenChange" title-as="h2">
      <p class="demo-hint">
        点这张表工具栏的全屏按钮：组件把整张表搬到 body 下并锁页面滚动，进出各调一次
        <code>onToggleSidebar</code> 通知宿主收起/还原侧边栏 —— 本站左侧那条真导航栏会跟着动。
      </p>
      <p class="demo-hint">
        两条固定前提，缺一条就一次都不会调：其一，组件先看
        <code>document.querySelector('.sidebar')</code> 存不存在且未折叠；其二，不传
        <code>onToggleSidebar</code> 时它降级去找 <code>inject('toggleCollapse')</code>
        —— 本站宿主就是 AppLayout，它两样都给了，所以两条路径都通。
      </p>
      <p class="demo-hint">
        再记一条固定行为：全屏时若有分页，组件会<strong>忽略分页</strong>把过滤后的数据全铺出来
        —— 全屏的语义就是「看全部」，这个不开放配置。
      </p>
      <p v-if="fsLog" class="demo-hint" style="color: var(--color-primary)">{{ fsLog }}</p>
      <DataTable
        namespace="demo-fullscreen"
        :columns="evCols"
        :data="evData"
        row-key="id"
        :page-size="5"
        :on-toggle-sidebar="collapseHostSidebar"
        @fullscreen-change="(v: boolean) => evSay(`fullscreenChange → ${v ? '进入全屏' : '退出全屏'}`)"
      />
    </Card>

    <!-- ===== 图片域名白名单 ===== -->
    <Card title="图片域名白名单 — imageDomains" title-as="h2">
      <p class="demo-hint">
        组件靠 <code>isImageUrl</code> 判断一个字符串是文本还是图，顺序固定：内联数据前缀 →
        图片扩展名 → 域名白名单 → 路径启发式兜底。<code>imageDomains</code> 传了就是
        <strong>整表替换</strong>默认清单而不是追加 —— 所以下面勾上之后，两张走内置清单才认出的图会退回成文本，
        而内联数据那格照旧是图（它排在域名之前）。
      </p>
      <p class="demo-hint" style="color: var(--color-warning)">
        踩过的坑，写表格数据时注意：域名匹配<strong>不锚定</strong>，单元格里只是
        <em>提到</em>某个内置域名（比如讲解文字里写了那个图床的域名）也会被当成图片渲染成碎图。
        列上想钉死内容类型，用 <code>Column.accept: 'image'</code> 比白名单可靠。
      </p>
      <div class="demo-ck-row">
        <label class="demo-ck">
          <input v-model="imgWhitelistOn" type="checkbox" />
          把 imageDomains 换成 <code>example.internal-cdn.invalid</code>（默认清单随即失效）
        </label>
      </div>
      <DataTable namespace="demo-imgdomain" :columns="imgCols" :data="imgRows" row-key="id" :image-domains="imgDomains" />
    </Card>

    <!-- ===== 插槽 ===== -->
    <Card title="插槽 — #header-cell / #cell（#toolbar-actions 与 #empty 见上面两块）" title-as="h2">
      <p class="demo-hint">
        <code>#header-cell</code> 作用域给 <code>column</code>，<code>#cell</code> 给
        <code>column / row / value</code>（value 是按空白口径处理后的展示文本）。
        插槽接管的是<strong>内容渲染</strong>；排序、筛选、固定列、列宽这些表格机制照旧由组件管，不会被插槽绕开。
      </p>
      <DataTable namespace="demo-slots" :columns="slotCols" :data="slotData" row-key="id">
        <template #header-cell="{ column }">
          <span class="demo-slot-th">{{ column.title }}<i class="demo-slot-badge">{{ column.key }}</i></span>
        </template>
        <template #cell="{ column, value }">
          <span v-if="column.key === 'amount'" class="demo-slot-money">￥{{ Number(value).toLocaleString() }}</span>
          <span v-else>{{ value }}</span>
        </template>
      </DataTable>
    </Card>

    <!-- ===== 交互开关 ===== -->
    <Card title="交互开关 — colSettings / cellSelection / keyboardNav / cellContextMenu" title-as="h2">
      <p class="demo-hint">
        四项默认全开。四个都是真开关，当场生效：
        <strong>colSettings</strong> 管工具栏的列设置按钮；
        <strong>cellSelection</strong> 管长按拖选矩形区（注意它的前置条件是 <code>editable</code>，
        不开 editable 时它无处可施 —— 这条依赖是固定的）；
        <strong>keyboardNav</strong> 管方向键/Enter/Delete/Ctrl+Home；
        <strong>cellContextMenu</strong> 管单元格右键的复制/粘贴/清空。
      </p>
      <div class="demo-ck-row">
        <label class="demo-ck"><input v-model="inter.colSettings" type="checkbox" /> colSettings</label>
        <label class="demo-ck"><input v-model="inter.cellSelection" type="checkbox" /> cellSelection</label>
        <label class="demo-ck"><input v-model="inter.keyboardNav" type="checkbox" /> keyboardNav</label>
        <label class="demo-ck"><input v-model="inter.cellContextMenu" type="checkbox" /> cellContextMenu</label>
      </div>
      <DataTable
        namespace="demo-inter"
        :columns="interCols"
        :data="editData"
        row-key="id"
        editable
        :col-settings="inter.colSettings"
        :cell-selection="inter.cellSelection"
        :keyboard-nav="inter.keyboardNav"
        :cell-context-menu="inter.cellContextMenu"
      />
    </Card>

    <!-- ===== 事件 ===== -->
    <Card title="事件一览 — 15 个 emit 的回显" title-as="h2">
      <p class="demo-hint">
        操作下面这张表，右半边会打出组件真正抛出的事件与载荷。
        带 <code>update:</code> 前缀的三个（<code>update:selectedKeys</code> /
        <code>update:currentPage</code> / <code>update:filters</code>）就是
        <code>v-model</code> 的另一半，下面已经双向绑上了。
      </p>
      <p class="demo-hint">
        这张表顺手把 <code>autoHeight</code> 关了（默认开启，会把父容器剩余空间填满）——
        开着的话这里只有 4 行数据也会被撑出一大片空白，正是这个 prop 的作用面。
      </p>
      <div class="demo-two-col demo-two-col--wide-left">
        <div>
          <DataTable
            v-model:selected-keys="evSelected"
            v-model:current-page="evPage"
            namespace="demo-events"
            :columns="evCols"
            :data="evData"
            row-key="id"
            selectable
            editable
            note-mode
            :auto-height="false"
            :page-size="4"
            @sort="(k: string, o: string) => evSay(`sort: ${k} ${o}`)"
            @filter="(f: Record<string, string[]>) => evSay(`filter: ${JSON.stringify(f)}`)"
            @row-click="(r: Record<string, any>, i: number) => evSay(`rowClick: ${r.name} #${i}`)"
            @selection-change="(ks: string[]) => evSay(`selectionChange: ${ks.length} 行`)"
            @page-change="(p: number, s: number) => evSay(`pageChange: ${p}/${s}`)"
            @cell-change="(rk: string, ck: string, v: string) => evSay(`cellChange: ${rk}.${ck}=${v}`)"
            @cell-note="(rk: string, ck: string, v: string) => evSay(`cellNote: ${rk}.${ck}=${v}`)"
            @batch-change="(ck: string, v: string, ks: string[]) => evSay(`batchChange: ${ck}=${v} ×${ks.length} 行`)"
            @search="(v: string) => evSay(`search: ${v}`)"
          >
            <template #toolbar-actions>
              <span class="demo-hint" style="margin: 0">已选 {{ evSelected.length }} 行</span>
            </template>
          </DataTable>
        </div>
        <div class="demo-log">
          <p v-for="(l, i) in evLog" :key="i">{{ l }}</p>
          <p v-if="!evLog.length" class="demo-hint">（尚无事件）</p>
          <button class="demo-add-btn" @click="evLog = []">清空</button>
        </div>
      </div>
    </Card>

    <!-- ===== API ===== -->
    <Card title="API — props 全表（与 defineProps 逐条对账，闸口 check:demo-props 会拦谎报）" title-as="h2">
      <table class="api-table">
        <thead>
          <tr>
            <th>属性</th>
            <th>类型</th>
            <th>默认值</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr class="api-group"><td colspan="4">数据与列</td></tr>
          <tr>
            <td><code>columns</code></td>
            <td><code>Column[]</code></td>
            <td>—</td>
            <td>必填。列定义，见上面「列配置」表</td>
          </tr>
          <tr>
            <td><code>data</code></td>
            <td><code>T[]</code></td>
            <td>—</td>
            <td>必填。行数据，T 受 <code>Record&lt;string, any&gt;</code> 约束</td>
          </tr>
          <tr>
            <td><code>rowKey</code></td>
            <td><code>string</code></td>
            <td><code>'seq'</code></td>
            <td>行唯一键字段名；选行、编辑回执、备注都按它寻址</td>
          </tr>
          <tr class="api-group"><td colspan="4">外观与布局</td></tr>
          <tr>
            <td><code>striped</code></td>
            <td><code>boolean</code></td>
            <td><code>true</code></td>
            <td>斑马纹</td>
          </tr>
          <tr>
            <td><code>bordered</code></td>
            <td><code>boolean</code></td>
            <td><code>true</code></td>
            <td>边框与网格线</td>
          </tr>
          <tr>
            <td><code>hoverable</code></td>
            <td><code>boolean</code></td>
            <td><code>true</code></td>
            <td>悬停行高亮</td>
          </tr>
          <tr>
            <td><code>isLoading</code></td>
            <td><code>boolean</code></td>
            <td><code>false</code></td>
            <td>加载态：表体换成骨架，汇总行与空态一并让位</td>
          </tr>
          <tr>
            <td><code>emptyText</code></td>
            <td><code>string</code></td>
            <td><code>''</code></td>
            <td>空态文案，留空走内置 i18n（跟随语言切换）</td>
          </tr>
          <tr>
            <td><code>blankText</code></td>
            <td><code>string</code></td>
            <td><code>'-'</code></td>
            <td>空白占位文本，传空串关闭；仅展示层，导出与筛选按原值</td>
          </tr>
          <tr class="api-group"><td colspan="4">排序 · 筛选 · 搜索</td></tr>
          <tr>
            <td><code>sortKey</code></td>
            <td><code>string</code></td>
            <td>—</td>
            <td>受控排序列。非空时组件跳过本地排序，等使用方回灌排好的数据</td>
          </tr>
          <tr>
            <td><code>sortOrder</code></td>
            <td><code>'asc' | 'desc'</code></td>
            <td>—</td>
            <td>受控排序方向，与 sortKey 配套</td>
          </tr>
          <tr>
            <td><code>pinyinSearch</code></td>
            <td><code>boolean</code></td>
            <td><code>true</code></td>
            <td>中文按全拼/首字母命中（zs、zhangsan 都能搜到张三）</td>
          </tr>
          <tr>
            <td><code>truncateThreshold</code></td>
            <td><code>number</code></td>
            <td><code>0</code></td>
            <td>超长判定字数；0 表示交给列宽实测决定，不按字数</td>
          </tr>
          <tr class="api-group"><td colspan="4">行选择与导出</td></tr>
          <tr>
            <td><code>selectable</code></td>
            <td><code>boolean</code></td>
            <td><code>false</code></td>
            <td>复选框列；有左固定列时选择框并入左固定区</td>
          </tr>
          <tr>
            <td><code>selectedKeys</code></td>
            <td><code>string[]</code></td>
            <td><code>[]</code></td>
            <td>已选行 key，支持 <code>v-model:selected-keys</code></td>
          </tr>
          <tr>
            <td><code>exportable</code></td>
            <td><code>boolean</code></td>
            <td><code>false</code></td>
            <td>工具栏 CSV 导出按钮</td>
          </tr>
          <tr>
            <td><code>exportFileName</code></td>
            <td><code>string</code></td>
            <td><code>'export'</code></td>
            <td>导出文件名主体（不含后缀）</td>
          </tr>
          <tr>
            <td><code>excelExportable</code></td>
            <td><code>boolean</code></td>
            <td><code>false</code></td>
            <td>额外的 Excel 导出入口</td>
          </tr>
          <tr>
            <td><code>exportScope</code></td>
            <td><code>'all' | 'page'</code></td>
            <td><code>'all'</code></td>
            <td>导出范围：筛选后全量 / 仅当前页</td>
          </tr>
          <tr class="api-group"><td colspan="4">分页与虚拟化</td></tr>
          <tr>
            <td><code>pageSize</code></td>
            <td><code>number</code></td>
            <td><code>0</code></td>
            <td>每页条数，0 为不分页</td>
          </tr>
          <tr>
            <td><code>currentPage</code></td>
            <td><code>number</code></td>
            <td><code>1</code></td>
            <td>当前页，支持 <code>v-model:current-page</code></td>
          </tr>
          <tr>
            <td><code>total</code></td>
            <td><code>number</code></td>
            <td>—</td>
            <td>服务端分页时由外部告知总条数；不传则按当前 data 长度算</td>
          </tr>
          <tr>
            <td><code>cardBreakpoint</code></td>
            <td><code>number</code></td>
            <td><code>768</code></td>
            <td>窄于此宽度整表转卡片视图（来自全局断点令牌 BP_MD）</td>
          </tr>
          <tr>
            <td><code>maxHeight</code></td>
            <td><code>string</code></td>
            <td><code>''</code></td>
            <td>表格内滚动高度；设了它就不再走页面滚动虚拟化</td>
          </tr>
          <tr>
            <td><code>autoHeight</code></td>
            <td><code>boolean</code></td>
            <td><code>true</code></td>
            <td>填满父容器剩余空间；需父容器有明确高度，且与 maxHeight 互斥</td>
          </tr>
          <tr>
            <td><code>virtualScroll</code></td>
            <td><code>boolean</code></td>
            <td><code>true</code></td>
            <td>虚拟滚动总开关；实际是否启用还要过「行数 &gt; 可视 + overscan」的实测判据</td>
          </tr>
          <tr>
            <td><code>pageVirtualMin</code></td>
            <td><code>number</code></td>
            <td><code>0</code></td>
            <td>页面滚动态虚拟化的额外行数下限，只能抬高门槛不能强开</td>
          </tr>
          <tr>
            <td><code>autoFit</code></td>
            <td><code>boolean</code></td>
            <td><code>true</code></td>
            <td>按内容实测分配列宽；关闭后退回按表头最小宽排布</td>
          </tr>
          <tr>
            <td><code>truncateMode</code></td>
            <td><code>'ellipsis' | 'wrap' | 'none'</code></td>
            <td><code>'ellipsis'</code></td>
            <td>超长单元格的表现：省略号 / 换行 / 原样不折</td>
          </tr>
          <tr>
            <td><code>dense</code></td>
            <td><code>boolean</code></td>
            <td><code>false</code></td>
            <td>紧凑密度<strong>初值</strong>；挂载后归工具栏紧凑按钮管，改 prop 不回灌</td>
          </tr>
          <tr class="api-group"><td colspan="4">交互开关</td></tr>
          <tr>
            <td><code>colSettings</code></td>
            <td><code>boolean</code></td>
            <td><code>true</code></td>
            <td>工具栏列设置面板入口（显隐/顺序/固定）</td>
          </tr>
          <tr>
            <td><code>cellSelection</code></td>
            <td><code>boolean</code></td>
            <td><code>true</code></td>
            <td>长按拖选矩形区 + 拖选自动滚动；前置条件是 editable 已开</td>
          </tr>
          <tr>
            <td><code>keyboardNav</code></td>
            <td><code>boolean</code></td>
            <td><code>true</code></td>
            <td>方向键移动 / Shift 扩展 / Enter 编辑 / Delete 清空 / Ctrl+Home、End</td>
          </tr>
          <tr>
            <td><code>cellContextMenu</code></td>
            <td><code>boolean</code></td>
            <td><code>true</code></td>
            <td>单元格右键菜单（复制/粘贴/清空）</td>
          </tr>
          <tr class="api-group"><td colspan="4">汇总与持久化</td></tr>
          <tr>
            <td><code>summary</code></td>
            <td><code>(rows: T[]) =&gt; Record</code> / <code>Record</code></td>
            <td>—</td>
            <td>汇总行：函数式收 props.data 全量（仅客户端），对象式给服务端算好的合计</td>
          </tr>
          <tr>
            <td><code>storage</code></td>
            <td><code>TableStorage</code></td>
            <td>localStorage</td>
            <td>存储适配器，get/set/remove 允许返回 Promise；挂载时读一次</td>
          </tr>
          <tr>
            <td><code>namespace</code></td>
            <td><code>string</code></td>
            <td>—</td>
            <td>持久化命名空间，同页面多实例隔离用</td>
          </tr>
          <tr>
            <td><code>persistence</code></td>
            <td><code>'auto' | 'none'</code></td>
            <td><code>'auto'</code></td>
            <td>none 强制不落存储；auto 下受控排序与服务端筛选自动豁免</td>
          </tr>
          <tr class="api-group"><td colspan="4">编辑与备注</td></tr>
          <tr>
            <td><code>editable</code></td>
            <td><code>boolean</code></td>
            <td><code>false</code></td>
            <td>双击编辑；拖选、填充柄、列级 editable 的前置条件</td>
          </tr>
          <tr>
            <td><code>dateInputOrder</code></td>
            <td><code>'MDY' | 'DMY'</code></td>
            <td><code>'MDY'</code></td>
            <td>日期列两段数字的月日顺序；月日都 ≤12 时组件无法自行消歧，须使用方声明</td>
          </tr>
          <tr>
            <td><code>noteMode</code></td>
            <td><code>boolean</code></td>
            <td><code>false</code></td>
            <td>备注：hover 看内容、点击填写，填完只抛 cell-note</td>
          </tr>
          <tr>
            <td><code>notes</code></td>
            <td><code>Record&lt;rowKey, Record&lt;colKey, string&gt;&gt;</code></td>
            <td><code>{}</code></td>
            <td>外部备注数据源；组件不自行写回</td>
          </tr>
          <tr class="api-group"><td colspan="4">行 / 单元格自定义</td></tr>
          <tr>
            <td><code>rowActions</code></td>
            <td><code>RowAction[]</code></td>
            <td>—</td>
            <td>行尾操作按钮列；设了就多一列，宽度按按钮数与字长实测算</td>
          </tr>
          <tr>
            <td><code>rowContextActions</code></td>
            <td><code>RowContextAction[]</code></td>
            <td>—</td>
            <td>行右键菜单项；带 onClick 就直接执行，否则抛 rowContextAction</td>
          </tr>
          <tr>
            <td><code>originalTooltip</code></td>
            <td><code>boolean</code></td>
            <td><code>false</code></td>
            <td>hover 已改单元格弹原始值；前置条件 editable 已开</td>
          </tr>
          <tr>
            <td><code>modifiedMark</code></td>
            <td><code>boolean</code></td>
            <td><code>false</code></td>
            <td>已改单元格右上角三角角标</td>
          </tr>
          <tr>
            <td><code>imageDomains</code></td>
            <td><code>string[]</code></td>
            <td><code>[]</code></td>
            <td>图片域名白名单；传了即整表替换默认清单，不是追加</td>
          </tr>
          <tr class="api-group">
            <td colspan="4">排序 · 筛选 · 搜索（续：服务端模式三件）</td>
          </tr>
          <tr>
            <td><code>searchMode</code></td>
            <td><code>'client' | 'server'</code></td>
            <td><code>'client'</code></td>
            <td>server 时不做本地过滤，只抛 search</td>
          </tr>
          <tr>
            <td><code>filterMode</code></td>
            <td><code>'client' | 'server'</code></td>
            <td><code>'client'</code></td>
            <td>server 时只抛 filter，由外部回灌筛好的数据</td>
          </tr>
          <tr>
            <td><code>filters</code></td>
            <td><code>Record&lt;string, string[]&gt;</code></td>
            <td>—</td>
            <td>外部筛选状态，支持 <code>v-model:filters</code>，变化时同步进内部</td>
          </tr>
          <tr>
            <td><code>onExport</code></td>
            <td><code>() =&gt; void</code></td>
            <td>—</td>
            <td>存在时点导出只调它，内置 CSV 生成整个跳过</td>
          </tr>
          <tr>
            <td><code>rowClass</code></td>
            <td><code>(row, index) =&gt; string</code></td>
            <td>—</td>
            <td>行级类名</td>
          </tr>
          <tr>
            <td><code>rowStyle</code></td>
            <td><code>(row, index) =&gt; Record</code></td>
            <td>—</td>
            <td>行级内联样式；建议回 CSS 变量，硬编码色值在暗色主题会糊</td>
          </tr>
          <tr>
            <td><code>cellClass</code></td>
            <td><code>(colKey, row, index) =&gt; string</code></td>
            <td>—</td>
            <td>单元格级类名</td>
          </tr>
          <tr>
            <td><code>cellStyle</code></td>
            <td><code>(colKey, row, index) =&gt; Record</code></td>
            <td>—</td>
            <td>单元格级内联样式</td>
          </tr>
          <tr class="api-group"><td colspan="4">截图</td></tr>
          <tr>
            <td><code>shotMode</code></td>
            <td><code>'preview' | 'download' | 'copy'</code></td>
            <td><code>'preview'</code></td>
            <td>截图落地方式</td>
          </tr>
          <tr>
            <td><code>screenshotMaxRows</code></td>
            <td><code>number</code></td>
            <td><code>400</code></td>
            <td>超过此行数只提醒不出图；另有 8000px 高度硬上限不开放</td>
          </tr>
          <tr class="api-group"><td colspan="4">宿主联动</td></tr>
          <tr>
            <td><code>onToggleSidebar</code></td>
            <td><code>() =&gt; void</code></td>
            <td>—</td>
            <td>全屏进出时通知宿主收起/还原侧边栏；不传则降级找 inject('toggleCollapse')</td>
          </tr>
        </tbody>
      </table>

      <p class="demo-sub" style="margin-top: 20px">列配置（columns 数组的元素，即 Column 接口）</p>
      <table class="api-table">
        <thead>
          <tr>
            <th>列字段</th>
            <th>类型</th>
            <th>默认值</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>key</code></td>
            <td><code>string</code></td>
            <td>—</td>
            <td>列标识，同时是取值字段名</td>
          </tr>
          <tr>
            <td><code>title</code></td>
            <td><code>string</code></td>
            <td>—</td>
            <td>表头文案，参与列宽实测</td>
          </tr>
          <tr>
            <td><code>label</code></td>
            <td><code>string</code></td>
            <td>—</td>
            <td>title 的别名，二选一，title 优先</td>
          </tr>
          <tr>
            <td><code>sortable</code></td>
            <td><code>boolean</code></td>
            <td><code>true</code></td>
            <td>该列可否排序；表头排序图标按它出</td>
          </tr>
          <tr>
            <td><code>filterable</code></td>
            <td><code>boolean</code></td>
            <td><code>true</code></td>
            <td>该列可否筛选</td>
          </tr>
          <tr>
            <td><code>align</code></td>
            <td><code>'left' | 'center' | 'right'</code></td>
            <td>按类型定</td>
            <td>整列对齐，表头与单元格共同基准</td>
          </tr>
          <tr>
            <td><code>headerAlign</code></td>
            <td><code>'left' | 'center' | 'right'</code></td>
            <td>跟随 align</td>
            <td>只改表头对齐</td>
          </tr>
          <tr>
            <td><code>cellAlign</code></td>
            <td><code>'left' | 'center' | 'right'</code></td>
            <td>跟随 align</td>
            <td>只改单元格对齐</td>
          </tr>
          <tr>
            <td><code>fixed</code></td>
            <td><code>'left' | 'right'</code></td>
            <td>—</td>
            <td>吸附方向；偏移量由左侧各列实测宽累加得出</td>
          </tr>
          <tr>
            <td><code>accept</code></td>
            <td><code>'text' | 'image' | 'all'</code></td>
            <td><code>all</code></td>
            <td>列内容约束，比图片域名白名单更可靠</td>
          </tr>
          <tr>
            <td><code>type</code></td>
            <td><code>'text' | 'number' | 'date' | 'datetime' | 'time'</code></td>
            <td>—</td>
            <td>声明后编辑提交按类型归一化；不声明则原样存字符串</td>
          </tr>
          <tr>
            <td><code>editable</code></td>
            <td><code>boolean</code></td>
            <td><code>true</code></td>
            <td>列级编辑开关，false 时该列连下拉面板都不出现；仅 editable 表格下生效</td>
          </tr>
          <tr>
            <td><code>imageSize</code></td>
            <td><code>number</code></td>
            <td><code>40</code></td>
            <td>图片缩略图边长（px）</td>
          </tr>
          <tr>
            <td><code>render</code></td>
            <td><code>(value, row, index) =&gt; string</code></td>
            <td>—</td>
            <td>自定义纯文本渲染，同时用作筛选候选值的展示标签</td>
          </tr>
          <tr>
            <td><code>cell</code></td>
            <td><code>(value, row) =&gt; string</code></td>
            <td>—</td>
            <td>返回 HTML 串经内置消毒后 v-html；不可信内容别传</td>
          </tr>
          <tr>
            <td><code>options</code></td>
            <td><code>(string | ColumnOption)[]</code></td>
            <td>—</td>
            <td>预设选项，编辑时换成下拉面板；对象形支持 label 与 color</td>
          </tr>
          <tr>
            <td><code>filterValues</code></td>
            <td><code>string[]</code></td>
            <td>—</td>
            <td>服务端分页时手工给全量候选值，优先于从 data 提取</td>
          </tr>
        </tbody>
      </table>

      <p class="demo-sub" style="margin-top: 20px">事件（defineEmits）</p>
      <table class="api-table">
        <thead>
          <tr>
            <th>事件</th>
            <th>载荷</th>
            <th>配套入参</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>sort</code></td>
            <td><code>(key, order)</code></td>
            <td><code>sortKey</code> / <code>sortOrder</code></td>
            <td>点表头排序；回灌受控排序列才会跳过本地排序</td>
          </tr>
          <tr>
            <td><code>filter</code></td>
            <td><code>(filters)</code></td>
            <td><code>filterMode</code></td>
            <td>筛选变化；server 档下靠它去请求</td>
          </tr>
          <tr>
            <td><code>update:filters</code></td>
            <td><code>(filters)</code></td>
            <td><code>filters</code></td>
            <td><code>v-model:filters</code> 的写入侧</td>
          </tr>
          <tr>
            <td><code>rowClick</code></td>
            <td><code>(row, index)</code></td>
            <td>—</td>
            <td>点击数据行；index 是渲染序，非过滤前原序</td>
          </tr>
          <tr>
            <td><code>update:selectedKeys</code></td>
            <td><code>(keys)</code></td>
            <td><code>selectedKeys</code></td>
            <td><code>v-model:selected-keys</code> 的写入侧</td>
          </tr>
          <tr>
            <td><code>update:currentPage</code></td>
            <td><code>(page)</code></td>
            <td><code>currentPage</code></td>
            <td><code>v-model:current-page</code> 的写入侧</td>
          </tr>
          <tr>
            <td><code>pageChange</code></td>
            <td><code>(page, pageSize)</code></td>
            <td><code>pageSize</code> / <code>total</code></td>
            <td>翻页，带上每页条数便于换算 offset</td>
          </tr>
          <tr>
            <td><code>selectionChange</code></td>
            <td><code>(keys, rows)</code></td>
            <td><code>selectable</code></td>
            <td>选行变化，同时给行对象省一次回查</td>
          </tr>
          <tr>
            <td><code>cellChange</code></td>
            <td><code>(rowKey, colKey, newValue)</code></td>
            <td><code>editable</code></td>
            <td>单元格编辑落定；组件不改 data，写回是使用方的事</td>
          </tr>
          <tr>
            <td><code>cellNote</code></td>
            <td><code>(rowKey, colKey, note)</code></td>
            <td><code>noteMode</code> / <code>notes</code></td>
            <td>备注填完；组件不写回 notes</td>
          </tr>
          <tr>
            <td><code>batchChange</code></td>
            <td><code>(colKey, newValue, rowKeys)</code></td>
            <td><code>selectable</code> + <code>editable</code></td>
            <td>工具栏批量修改确认，一次给齐改了哪些行</td>
          </tr>
          <tr>
            <td><code>rowAction</code></td>
            <td><code>(actionKey, row, index)</code></td>
            <td><code>rowActions</code></td>
            <td>行操作按钮点击</td>
          </tr>
          <tr>
            <td><code>rowContextAction</code></td>
            <td><code>(actionKey, row, index)</code></td>
            <td><code>rowContextActions</code></td>
            <td>行右键菜单项点击；该项自带 onClick 时不抛</td>
          </tr>
          <tr>
            <td><code>search</code></td>
            <td><code>(term)</code></td>
            <td><code>searchMode</code></td>
            <td>搜索词防抖 200ms 后抛出</td>
          </tr>
          <tr>
            <td><code>fullscreenChange</code></td>
            <td><code>(isFullscreen)</code></td>
            <td><code>onToggleSidebar</code></td>
            <td>进出全屏</td>
          </tr>
        </tbody>
      </table>

      <p class="demo-hint" style="margin-top: 12px">
        插槽四个：<code>toolbar-actions</code>（工具栏追加按钮，无作用域）、
        <code>header-cell</code>（作用域 <code>column</code>）、
        <code>cell</code>（作用域 <code>column / row / value</code>）、
        <code>empty</code>（作用域 <code>filtered</code>）。
      </p>
      <p class="demo-hint">
        <code>defineExpose</code> 另有 imperative 面（撤销/重做/清空筛选/退出全屏等），
        属组件内部状态的编程入口，与上面的 prop 面互不重复。
      </p>
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
.demo-ck-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  align-items: center;
  margin: 0 0 10px;
}
.demo-ck {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.demo-ck input[type='checkbox'] {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--color-primary);
}
.demo-ck select {
  height: 26px;
  padding: 0 6px;
  font: inherit;
  font-size: 13px;
  color: inherit;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}
.demo-num {
  width: 72px;
  height: 26px;
  padding: 0 6px;
  font: inherit;
  font-size: 13px;
  color: var(--color-text);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}
.demo-sub {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}
.demo-two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
  align-items: start;
}
.demo-two-col > * {
  min-width: 0;
}
/* 表格列数多的对照块给表格那侧多留宽，否则五列表在 50% 宽下要横向滚 */
.demo-two-col--wide-left {
  grid-template-columns: minmax(0, 2fr) minmax(200px, 1fr);
}
@media (max-width: 900px) {
  .demo-two-col--wide-left {
    grid-template-columns: minmax(0, 1fr);
  }
}
.demo-log {
  min-height: 96px;
  padding: 8px 10px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  background: var(--color-bg-soft);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
}
.demo-log p {
  margin: 0;
  word-break: break-all;
}
.demo-empty-slot {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  padding: 22px 0;
  color: var(--color-text-muted);
}
.demo-empty-slot strong {
  color: var(--color-text-secondary);
}
.demo-slot-th {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.demo-slot-badge {
  padding: 0 5px;
  font-family: ui-monospace, monospace;
  font-size: 10px;
  font-style: normal;
  color: var(--color-primary);
  background: var(--color-primary-light);
  border-radius: var(--radius-sm);
}
.demo-slot-money {
  font-variant-numeric: tabular-nums;
  color: var(--color-success);
}
.api-table {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}
.api-table th,
.api-table td {
  padding: 4px 8px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--color-border-light);
}
.api-table th {
  border-bottom: 2px solid var(--color-border);
}
/* props 分组行（与 defineProps 内的分组注释同口径；文本行不参与 check:demo-props 对账） */
.api-group td {
  padding-top: 10px;
  font-weight: 600;
  color: var(--color-primary);
  border-bottom: 1px solid var(--color-border);
}
.api-table code {
  white-space: nowrap;
}
/* rowClass / cellClass 打上的类落在 DataTable 内部节点上，scoped 选择器够不着，只能 :deep() 穿透 */
:deep(.row-high-salary) {
  background: var(--color-primary-light);
}
:deep(.cell-mono) {
  font-variant-numeric: tabular-nums;
}
:deep(.cell-offline) {
  color: var(--color-text-muted);
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
