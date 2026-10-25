# 介绍

vcl-ui 是一套 Vue 3 通用组件库：**13 个组件域、66 组件**，从按钮到低代码表单设计器开箱即用。

> 这些数字来自 [`facts.md`](/guide/facts)（自动生成），不要手写。

## 组件域

| 域 | 主要组件 |
| --- | --- |
| `basic` | Button / IconSvg / Tag |
| `data` | DataTable / Card / Tree / Image(预览) / ProgressBar / Skeleton / Avatar / Collapse / ToggleList / Divider / Empty |
| `form` | Input / Select(select/combobox/cascader/tree/date/time) / Group(radio/checkbox/switch/rate/slider) / IconPicker / Upload / CameraCapture / CodeCapture / 采集兜底链 |
| `feedback` | Toast / Result / Popover / Loading / Drawer / ConfirmModal / ErrorBoundary / BeepVoice / State |
| `nav` | Tabs / Steps / Pagination / Breadcrumb / Menu |
| `layout` | ModalBox / Flex |
| `chart` | Chart / ChartTable / ChartLegend（ECharts 封装，按需注册） |
| `login` | 登录页家族（login / register / forgot-password / portal_login） |
| `storage` | IndexedDB / localStorage 门面 / 云端适配（Supabase）/ 统一存储路由 |
| `wc` | Web Components 跨框架出口 |
| `form-builder` | FormDesigner 设计器 / FormBuilder 渲染引擎 / FormCollect 收集端 |
| `amap` | 高德地图封装（AmapWidget） |
| `route-planner` | 门店巡访路线规划器 |

## 在线 demo

仓库自带 49 页交互示例（每个组件一页，含 Props 表）：

```bash
git clone <repo> && cd vue通用组件库
npm install
npm run dev   # http://localhost:3721
```

demo 站是本库的「活文档」：交互行为、边界态、键盘操作都在那里当场可验。本api站提供静态参考。

## 质量底线

- 单测 + 覆盖率地板（50/42/46/52）+ 全站 axe 无障碍扫描值守
- 构建产物六项自检：声明完整性、exports 可达、密钥不内联、Vue 3.4 类型兼容、体积预算、无孤儿 chunk
- 质量门禁一条命令：`npm run quality-check`
