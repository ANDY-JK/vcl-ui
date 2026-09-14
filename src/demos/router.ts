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
    // 组件 demo 路由（/:category 对应 demoMap 中的 key）
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
