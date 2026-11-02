// @vitest-environment node
/**
 * SSR 冒烟 — 真实服务端渲染代表性组件，实证「无裸 DOM 访问」而非口头承诺
 *
 * 背景：README 声称 SSR 守卫（ssr-guard / useTheme / i18n 的 typeof 判定）就位，
 * 但此前从未验证过。SSR 兼容是组件库硬门槛——消费者在 Nuxt/Vite SSR 里
 * 一挂就是整站 500，所以这里用 @vue/server-renderer 真渲染一遍。
 *
 * 关键：必须 @vitest-environment node。全局 setup 是 happy-dom，会提供
 * window/document，SSR 检测（typeof window !== 'undefined'）在它下面恒真，
 * 裸 DOM 访问全被掩盖 —— 那是 jsdom 假绿灯，测不出真问题。
 *
 * 覆盖取舍（各域代表 + 交互最重的组件）：
 *   每个域至少一个；DataTable/Select/ModalBox/Toast 这些挂满生命周期 +
 *   observer + 本地存储的优先。全量 60+ 组件逐个渲染成本高、收益低，
 *   真正的回归保护由「setup 顶层不碰 DOM」这条不变量承担——冒烟抓的是
 *   有人新加了顶层裸访问的场景。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { setLocale } from '@/components/_internal/i18n'

// 组件库入口在 node 环境下 import：进来的是 setup 顶层代码，
// 任何裸 window/document/localStorage 访问都会在 import 阶段就炸
import Button from '@/components/basic/Button.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import Tag from '@/components/basic/Tag.vue'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import DataTable from '@/components/data/DataTable.vue'
import Tree from '@/components/data/Tree.vue'
import Collapse from '@/components/data/Collapse.vue'
import ProgressBar from '@/components/data/ProgressBar.vue'
import ToggleList from '@/components/data/ToggleList.vue'
import ModalBox from '@/components/layout/ModalBox.vue'
import ConfirmContent from '@/components/layout/ConfirmContent.vue'
import Toast from '@/components/feedback/Toast.vue'
import Popover from '@/components/feedback/Popover.vue'
import Tabs from '@/components/nav/Tabs.vue'
import Steps from '@/components/nav/Steps.vue'
import Pagination from '@/components/nav/Pagination.vue'
import Breadcrumb from '@/components/nav/Breadcrumb.vue'
import Chart from '@/components/chart/Chart.vue'
import BaseChart from '@/components/chart/BaseChart.vue'
import FormBuilder from '@/components/form-builder/FormBuilder.vue'
import FormRenderer from '@/components/form-builder/FormRenderer.vue'
import FormDesigner from '@/components/form-builder/FormDesigner.vue'
import FormShareView from '@/components/form-builder/FormShareView.vue'
import FormTargetCollect from '@/components/form-builder/FormTargetCollect.vue'
import Upload from '@/components/form/Upload.vue'
import FormCollect from '@/components/form-builder/FormCollect.vue'
import RendererSignature from '@/components/form-builder/renderer/RendererSignature.vue'
import AmapWidget from '@/components/amap/AmapWidget.vue'
import { useTheme } from '@/components/_internal/useTheme'
import LoginPage from '@/components/login/login.vue'
import RegisterPage from '@/components/login/register.vue'
import PortalLogin from '@/components/login/portal_login.vue'
import ForgotPasswordPage from '@/components/login/forgot-password.vue'
import RouteMap from '@/components/route-planner/RouteMap.vue'
import StorageConfigPanel from '@/components/storage/StorageConfigPanel.vue'
import ModalShell from '@/components/_internal/ModalShell.vue'
import { scanComponentTree, findSmokeGaps, findUncoveredDomains, extractListedNames } from '../../scripts/ssr-smoke-coverage.mjs'

const cases: Array<[string, unknown, Record<string, unknown>]> = [
  ['Button', Button, { text: '按钮' }],
  ['IconSvg', IconSvg, { type: 'heart' }],
  ['Tag', Tag, { text: '标签' }],
  ['Input', Input, { modelValue: 'x', label: '名称' }],
  ['Input.stepper', Input, { modelValue: 1, stepper: true, label: '数量' }],
  ['Select', Select, { modelValue: 'a', options: [{ value: 'a', label: 'A' }] }],
  ['DataTable', DataTable, { data: [{ n: '甲' }], columns: [{ key: 'n', title: '名' }] }],
  ['Tree', Tree, { data: [{ key: 1, label: '根', children: [{ key: 2, label: '子' }] }] }],
  ['Collapse', Collapse, { items: [{ key: 'a', title: 'A', content: '内容' }] }],
  ['ProgressBar', ProgressBar, { percent: 30 }],
  ['ProgressBar.interactive', ProgressBar, { interactive: true, modelValue: 30 }],
  ['ToggleList', ToggleList, { items: [{ id: 1, name: 'A' }], idKey: 'id', titleField: 'name' }],
  ['ModalBox.default', ModalBox, { visible: false, title: '弹窗' }],
  ['ModalBox.confirm', ModalBox, { visible: false, modalType: 'confirm', confirmMessage: '确定？' }],
  ['ConfirmContent', ConfirmContent, { message: '确定删除？', variant: 'danger' }],
  ['Toast', Toast, { visible: false, message: '提示' }],
  ['Popover', Popover, { title: '说明', content: '内容' }],
  [
    'Tabs',
    Tabs,
    {
      modelValue: 'a',
      tabs: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
    },
  ],
  ['Steps', Steps, { current: 1, steps: [{ title: '一' }, { title: '二' }] }],
  ['Pagination', Pagination, { current: 1, total: 10 }],
  ['Breadcrumb', Breadcrumb, { items: [{ label: '首页' }, { label: '列表' }] }],
  ['Chart', Chart, { type: 'bar', data: { x: ['A'], series: [{ name: 's', data: [1] }] } }],
  ['BaseChart', BaseChart, { option: { xAxis: { type: 'category' }, yAxis: {}, series: [] } }],
  ['FormBuilder', FormBuilder, { schema: { schemaVersion: 1, meta: { title: 't' }, fields: [] } }],
  [
    'FormRenderer',
    FormRenderer,
    {
      schema: { schemaVersion: 1, meta: { title: 't' }, fields: [] },
      field: { id: 'f1', type: 'text', label: '字段' },
    },
  ],
  ['AmapWidget', AmapWidget, { lng: 116, lat: 39 }],
  // 低代码平台的两个交付面（部署到服务器 / 接入宿主项目时最先被访问的两个页面）：
  // 设计器虽是 SPA 组件，但 SSR 下**也不能抛错**——宿主在 Nuxt 里 import 本域 barrel 时，
  // 模块顶层或 setup 顶层碰 DOM 就会把整站打成 500。
  ['FormDesigner', FormDesigner, {}],
  ['FormShareView', FormShareView, { code: 'FD1.e30' }],
  // FormTargetCollect：setup 期读 localStorage（存储配置 + 搜索关键词）——
  // #376 之前它的守卫只在组件调用方、且只包读路径；列入冒烟后，任何人在
  // 该组件 setup 顶层新加裸 localStorage/matchMedia 访问都会在 import 阶段炸出来。
  // （真正的写路径守卫由 storage-persist-ssr.spec 单独测——renderToString 不触发用户交互。）
  ['Upload', Upload, {}],
  ['FormCollect', FormCollect, { fields: [] }],
  ['RendererSignature', RendererSignature, { schema: { schemaVersion: 1, meta: { title: 't' }, fields: [] }, field: { id: 'f1', type: 'signature', label: '签名' } }],
  ['LoginPage', LoginPage, {}],
  ['RegisterPage', RegisterPage, {}],
  ['PortalLogin', PortalLogin, {}],
  ['ForgotPasswordPage', ForgotPasswordPage, {}],
  ['RouteMap', RouteMap, { stores: [], plan: null }],
  ['StorageConfigPanel', StorageConfigPanel, {}],
  ['ModalShell', ModalShell, {}],
  [
    'FormTargetCollect',
    FormTargetCollect,
    {
      schema: { schemaVersion: 1, meta: { title: 't' }, fields: [] },
      targets: [{ id: 1, name: '门店甲' }],
    },
  ],
]

describe('SSR 冒烟：组件在无 DOM 环境下可渲染', () => {
  beforeAll(() => {
    setLocale('zh-CN')
  })

  it('node 环境下确实没有浏览器全局（防止测试自身失真）', () => {
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
    expect(typeof localStorage).toBe('undefined')
  })

  it.each(cases)('%s：renderToString 不抛错且产出 HTML', async (_name, comp, props) => {
    const app = createSSRApp(comp as never, props as never)
    const html = await renderToString(app)
    expect(typeof html).toBe('string')
    expect(html.length).toBeGreaterThan(0)
  })

  it('useTheme() 在 node 环境可调用且不抛错', () => {
    const theme = useTheme()
    expect(theme.theme).toBeDefined()
    expect(typeof theme.setTheme).toBe('function')
    // 'auto' 在无 matchMedia 环境下必须回落（守卫生效）
    theme.setTheme('auto')
    expect(theme.effectiveTheme.value).toBeDefined()
  })
})


describe('SSR 冒烟清单覆盖判据（#377）', () => {
  const listed = extractListedNames(readFileSync('tests/unit/ssr-smoke.spec.ts', 'utf8'))
  const scanned = scanComponentTree('src/components')

  it('**域覆盖：每个含 .vue 的域都必须有冒烟代表**（缺失即红，逼你补）', () => {
    const uncovered = findUncoveredDomains(scanned, listed)
    expect(uncovered, `这些域没有 SSR 冒烟用例：${uncovered.join(', ')} —— 新组件顶层的裸 DOM 访问将无人发现`).toEqual([])
  })

  it('**危险信号组件必须逐个在清单**（setup 期裸 localStorage/matchMedia 的组件漏一个，SSR 500 就是整站级）', () => {
    const dangerous = findSmokeGaps(scanned, listed).filter((g) => g.dangerous)
    expect(
      dangerous,
      `这些含 localStorage/matchMedia 的组件不在冒烟清单：${dangerous.map((g) => g.path).join(', ')}`,
    ).toEqual([])
  })
})
