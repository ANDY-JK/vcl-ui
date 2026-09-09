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
  ],
})

export default router
