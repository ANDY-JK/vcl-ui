<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import ErrorBoundary from '@/components/feedback/ErrorBoundary.vue'

const ErrorFallback = {
  props: ['error'],
  template: `<div style="padding:40px;text-align:center;">
    <h3 style="color:var(--color-danger);margin-bottom:8px;">组件加载失败</h3>
    <p style="color:var(--color-text-muted);font-size:13px;">{{ error?.message || '未知错误' }}</p>
  </div>`,
}

const demoMap: Record<string, any> = {
  // 基础组件
  button: defineAsyncComponent({ loader: () => import('./basic/ButtonDemo.vue'), errorComponent: ErrorFallback }),
  icon: defineAsyncComponent({ loader: () => import('./basic/IconDemo.vue'), errorComponent: ErrorFallback }),
  tag: defineAsyncComponent({ loader: () => import('./basic/TagDemo.vue'), errorComponent: ErrorFallback }),

  // 表单组件 — 四大类
  input: defineAsyncComponent({ loader: () => import('./form/InputDemo.vue'), errorComponent: ErrorFallback }),
  select: defineAsyncComponent({ loader: () => import('./form/SelectDemo.vue'), errorComponent: ErrorFallback }),
  group: defineAsyncComponent({ loader: () => import('./form/GroupDemo.vue'), errorComponent: ErrorFallback }),
  // 其他表单
  upload: defineAsyncComponent({ loader: () => import('./form/UploadDemo.vue'), errorComponent: ErrorFallback }),
  'barcode-scanner': defineAsyncComponent({
    loader: () => import('./form/BarcodeScannerDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  'camera-capture': defineAsyncComponent({
    loader: () => import('./form/CameraCaptureDemo.vue'),
    errorComponent: ErrorFallback,
  }),

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
  'route-planner': defineAsyncComponent({
    loader: () => import('./map/RoutePlannerDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  'contract-collection': defineAsyncComponent({
    loader: () => import('./map/ContractCollectionDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  'rebate-target-collect': defineAsyncComponent({
    loader: () => import('./map/RebateTargetCollectDemo.vue'),
    errorComponent: ErrorFallback,
  }),
  'shelf-target-collect': defineAsyncComponent({
    loader: () => import('./map/ShelfTargetCollectDemo.vue'),
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

const currentDemo = computed(() => {
  return demoMap[currentCategory.value] || demoMap['select']
})
</script>

<template>
  <div class="demo-wrap">
    <ErrorBoundary :watch-key="currentCategory" :title="`「${currentCategory}」组件异常`">
      <component :is="currentDemo" />
    </ErrorBoundary>
  </div>
</template>

<style scoped>
.demo-wrap {
  padding: var(--space-2) var(--space-2) clamp(24px, 4vw, 40px);
}
</style>
