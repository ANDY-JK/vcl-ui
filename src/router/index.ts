import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/select',
    },
    // 移动端 demo（MiniLayout 完整应用演示）
    {
      path: '/mini',
      redirect: '/mini/home',
      children: [
        // ---- Tab 页（TabBar 可见） ----
        { path: 'home', component: () => import('@/demos/mini/home/index.vue') },
        { path: 'category', component: () => import('@/demos/mini/category/index.vue') },
        { path: 'favorites', component: () => import('@/demos/mini/favorites/index.vue') },
        { path: 'profile', component: () => import('@/demos/mini/profile/index.vue') },

        // ---- 子页面（返回头 + 隐藏 TabBar） ----
        {
          path: 'login',
          component: () => import('@/demos/mini/login/index.vue'),
          meta: { subPage: true, title: '登录' },
        },
        {
          path: 'orders',
          component: () => import('@/demos/mini/orders/list.vue'),
          meta: { subPage: true, title: '订单列表' },
        },
        {
          path: 'orders/:id',
          component: () => import('@/demos/mini/orders/detail.vue'),
          meta: { subPage: true, title: '订单详情' },
        },
        {
          path: 'products',
          component: () => import('@/demos/mini/products/list.vue'),
          meta: { subPage: true, title: '商品列表' },
        },
        {
          path: 'products/detail/:id',
          component: () => import('@/demos/mini/products/detail.vue'),
          meta: { subPage: true, title: '商品详情' },
        },
        {
          path: 'scan',
          redirect: '/mini/scan/query',
        },
        {
          path: 'scan/:type',
          component: () => import('@/demos/mini/scan/index.vue'),
          meta: { subPage: true, title: '扫码' },
        },
        {
          path: 'settings',
          component: () => import('@/demos/mini/settings/index.vue'),
          meta: { subPage: true, title: '设置' },
        },
        {
          path: 'notifications',
          component: () => import('@/demos/mini/notifications/index.vue'),
          meta: { subPage: true, title: '消息通知' },
        },
      ],
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
