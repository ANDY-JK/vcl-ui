<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import ErrorBoundary from '@/components/feedback/ErrorBoundary.vue'
import Result from '@/components/feedback/Result.vue'

const ErrorFallback = {
  props: ['error'],
  template: `<div style="padding: calc(40px * var(--vcl-scale));text-align:center;">
    <h2 style="color:var(--vcl-color-danger);margin-bottom: calc(8px * var(--vcl-scale));">组件加载失败</h2>
    <p style="color:var(--vcl-color-text-muted);font-size: calc(13px * var(--vcl-scale));">{{ error?.message || '未知错误' }}</p>
  </div>`,
}

const demoMap: Record<string, any> = {
  // 基础组件
  button: defineAsyncComponent({ loader: () => import('./basic/ButtonDemo.vue'), errorComponent: ErrorFallback }),
  icon: defineAsyncComponent({ loader: () => import('./basic/IconDemo.vue'), errorComponent: ErrorFallback }),
  tag: defineAsyncComponent({ loader: () => import('./basic/TagDemo.vue'), errorComponent: ErrorFallback }),
  kbd: defineAsyncComponent({ loader: () => import('./basic/KbdDemo.vue'), errorComponent: ErrorFallback }),

  // 表单组件 — 四大类
  input: defineAsyncComponent({ loader: () => import('./form/InputDemo.vue'), errorComponent: ErrorFallback }),
  select: defineAsyncComponent({ loader: () => import('./form/SelectDemo.vue'), errorComponent: ErrorFallback }),
  group: defineAsyncComponent({ loader: () => import('./form/GroupDemo.vue'), errorComponent: ErrorFallback }),
  'segmented-control': defineAsyncComponent({
    loader: () => import('./form/SegmentedControlDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  'input-otp': defineAsyncComponent({
    loader: () => import('./form/InputOTPDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  // 其他表单
  upload: defineAsyncComponent({ loader: () => import('./form/UploadDemo.vue'), errorComponent: ErrorFallback }),
  // 采集合并演示（拍照 + 扫码三段同页；旧 /barcode-scanner /camera-capture /capture-fallback 路由已重定向）
  capture: defineAsyncComponent({ loader: () => import('./form/CaptureDemo.vue'), errorComponent: ErrorFallback }),

  // 数据展示
  card: defineAsyncComponent({ loader: () => import('./data/CardDemo.vue'), errorComponent: ErrorFallback }),
  'toggle-list': defineAsyncComponent({
    loader: () => import('./data/ToggleListDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  'data-table': defineAsyncComponent({
    loader: () => import('./data/DataTableDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  progress: defineAsyncComponent({ loader: () => import('./data/ProgressDemo.vue'), errorComponent: ErrorFallback }),
  divider: defineAsyncComponent({ loader: () => import('./data/DividerDemo.vue'), errorComponent: ErrorFallback }),
  collapse: defineAsyncComponent({ loader: () => import('./data/CollapseDemo.vue'), errorComponent: ErrorFallback }),
  image: defineAsyncComponent({ loader: () => import('./data/ImageDemo.vue'), errorComponent: ErrorFallback }),
  tree: defineAsyncComponent({ loader: () => import('./data/TreeDemo.vue'), errorComponent: ErrorFallback }),
  skeleton: defineAsyncComponent({ loader: () => import('./data/SkeletonDemo.vue'), errorComponent: ErrorFallback }),
  avatar: defineAsyncComponent({ loader: () => import('./data/AvatarDemo.vue'), errorComponent: ErrorFallback }),

  // 反馈组件
  toast: defineAsyncComponent({ loader: () => import('./feedback/ToastDemo.vue'), errorComponent: ErrorFallback }),
  result: defineAsyncComponent({ loader: () => import('./feedback/ResultDemo.vue'), errorComponent: ErrorFallback }),
  popover: defineAsyncComponent({ loader: () => import('./feedback/PopoverDemo.vue'), errorComponent: ErrorFallback }),
  'notification-center': defineAsyncComponent({
    loader: () => import('./feedback/NotificationCenterDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  loading: defineAsyncComponent({ loader: () => import('./feedback/LoadingDemo.vue'), errorComponent: ErrorFallback }),
  drawer: defineAsyncComponent({ loader: () => import('./feedback/DrawerDemo.vue'), errorComponent: ErrorFallback }),
  'error-boundary': defineAsyncComponent({
    loader: () => import('./feedback/ErrorBoundaryDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  'beep-voice': defineAsyncComponent({
    loader: () => import('./feedback/BeepVoiceDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  'confirm-modal': defineAsyncComponent({
    loader: () => import('./feedback/ConfirmModalDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  state: defineAsyncComponent({ loader: () => import('./feedback/StateDemo.vue'), errorComponent: ErrorFallback }),

  // 图表
  chart: defineAsyncComponent({ loader: () => import('./chart/ChartDemo.vue'), errorComponent: ErrorFallback }),
  'chart-table': defineAsyncComponent({
    loader: () => import('./chart/ChartTableDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  // 导航
  tabs: defineAsyncComponent({ loader: () => import('./nav/TabsDemo.vue'), errorComponent: ErrorFallback }),
  steps: defineAsyncComponent({ loader: () => import('./nav/StepsDemo.vue'), errorComponent: ErrorFallback }),
  pagination: defineAsyncComponent({ loader: () => import('./nav/PaginationDemo.vue'), errorComponent: ErrorFallback }),
  breadcrumb: defineAsyncComponent({ loader: () => import('./nav/BreadcrumbDemo.vue'), errorComponent: ErrorFallback }),
  menu: defineAsyncComponent({ loader: () => import('./nav/MenuDemo.vue'), errorComponent: ErrorFallback }),

  // 布局
  modal: defineAsyncComponent({ loader: () => import('./layout/ModalDemo.vue'), errorComponent: ErrorFallback }),
  flex: defineAsyncComponent({ loader: () => import('./layout/FlexDemo.vue'), errorComponent: ErrorFallback }),

  // 登录系列
  login: defineAsyncComponent({ loader: () => import('./login/LoginDemo.vue'), errorComponent: ErrorFallback }),

  // 地图和位置
  amap: defineAsyncComponent({ loader: () => import('./map/AmapDemo.vue'), errorComponent: ErrorFallback }),
  'amap-widget': defineAsyncComponent({
    loader: () => import('./map/AmapWidgetDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  'route-planner': defineAsyncComponent({
    loader: () => import('./map/RoutePlannerDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  'contract-collection': defineAsyncComponent({
    loader: () => import('./map/ContractCollectionDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  'contract-target-collect': defineAsyncComponent({
    loader: () => import('./map/ContractTargetCollectDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  'form-builder': defineAsyncComponent({
    loader: () => import('./form/FormBuilderDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  // 低代码设计器：此前 711 行组件 + ~2000 行子模块**没有任何演示入口**，
  // 用户在 45 个路由里翻不到它。补上可发现性（2026-10-21）。
  'form-designer': defineAsyncComponent({
    loader: () => import('./form/FormDesignerDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  'form-renderer': defineAsyncComponent({
    loader: () => import('./form/FormRendererDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  storage: defineAsyncComponent({ loader: () => import('./map/StorageDemo.vue'), errorComponent: ErrorFallback }),
}

const route = useRoute()
/**
 * E2E 崩溃夹具：`#/tag?crash=1` 让路由组件自身抛错（在模板里那层边界之外），
 * 由 AppLayout 的页面级边界捕获 —— 供 tests/e2e/error-boundary.spec.ts 验证切页自愈。
 */
if (route.query.crash === '1') throw new Error('E2E 崩溃夹具')

const currentCategory = computed(() => {
  return (route.params.category as string) || 'select'
})

// 未匹配到 demo 的 category：显式 404 态（2026-10-31，R5-A9）。此前 `|| demoMap['select']`
// 兜底换"路由永不空"，代价是丢掉 404 语义 —— 用户输错地址看到的是 Select 演示页，
// 分不清是"这页面存在"还是"地址打错了"。
const currentDemo = computed(() => demoMap[currentCategory.value] || null)
</script>

<template>
  <div class="demo-wrap">
    <ErrorBoundary :watch-key="currentCategory" :title="`「${currentCategory}」组件异常`">
      <Result
        v-if="!currentDemo"
        status="404"
        title="未找到该示例页"
        :description="`「${currentCategory}」不是有效的组件地址，请从左侧导航选择。`"
        action-text="返回组件列表"
        @action="$router.push('/select')"
      />
      <component :is="currentDemo" v-else />
    </ErrorBoundary>
  </div>
</template>

<style scoped>
/* demo 容器查询的正源：各 demo 页里的 `@container demo` 必须能向上找到这一层。
   此前只声明在 site.css 的 .grid-2-col 上，而查询主语多是 .grid-2-col 之外的元素
   （.main-row 等），规则整段不匹配——窄屏布局切换从未生效过。 */
.demo-wrap {
  padding: var(--vcl-space-2) var(--vcl-space-2) calc(40px * var(--vcl-scale));
  container-type: inline-size;
  container-name: demo;
}
</style>
