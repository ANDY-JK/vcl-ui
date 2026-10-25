import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/select',
    },
    // 表单发布填写端：`#/form/<FD1.分享码>`（FormDesigner 分享弹窗「复制发布链接」生成）
    {
      path: '/form/:code',
      name: 'form-share',
      component: () => import('@/components/form-builder/FormShareView.vue'),
      props: true,
    },
    // 主题可视化配置层（宿主侧）：`#/theme-editor`。静态段优先于 /:category 通配，放它前面显式声明
    {
      path: '/theme-editor',
      name: 'theme-editor',
      component: () => import('@/demos/theme/ThemeEditorDemo.vue'),
    },
    // 组件 demo 路由（/:category 对应 demoMap 中的 key）
    // 低代码导航外壳的宿主接入示例：静态段必须排在 /:category 之前，否则会被当成 category
    {
      path: '/lowcode-nav',
      name: 'lowcode-nav',
      component: () => import('@/demos/lowcode/LowCodeNavDemo.vue'),
    },
    {
      path: '/:category',
      name: 'demo',
      component: () => import('@/demos/ComponentDemo.vue'),
    },
    // 采集三页合并为 /capture（拍照+扫码同页三段），旧地址重定向保持外链/书签可用
    { path: '/barcode-scanner', redirect: '/capture' },
    { path: '/camera-capture', redirect: '/capture' },
    { path: '/capture-fallback', redirect: '/capture' },
  ],
})

export default router
