import { defineConfig } from 'vitepress'

// vcl-ui 文档站（Q9-半）。组件 API 页由 scripts/gen-docs.mjs 从源码生成
// （docs-site/components/*.md 提交入库，check:docs 闸口卡漂移），指南页手写。
export default defineConfig({
  title: 'vcl-ui',
  description: 'Vue 3 通用组件库 — 14 域 60+ 组件，开箱即用',
  lang: 'zh-CN',
  appearance: true, // 亮/暗切换，默认跟随系统
  themeConfig: {
    logo: undefined,
    nav: [
      { text: '指南', link: '/guide/introduction' },
      { text: '组件 API', link: '/components/basic' },
      {
        text: '在线示例',
        link: '/guide/introduction#在线-demo',
      },
    ],
    sidebar: [
      {
        text: '入门',
        collapsed: false,
        items: [
          { text: '介绍', link: '/guide/introduction' },
          { text: '安装', link: '/guide/install' },
          { text: '快速上手', link: '/guide/quick-start' },
          { text: '主题与设计令牌', link: '/guide/theming' },
          { text: '国际化', link: '/guide/i18n' },
          { text: 'Web Components', link: '/guide/web-components' },
        ],
      },
      {
        // 「升级 / 排障 / 选型」是一等公民，不是附录 —— 破坏性大版本若没有站内迁移文档，
        // 等于让 1.x 宿主自己翻 README（审查 R5-D5/D19/D22/D23）。
        text: '升级与排障',
        collapsed: false,
        items: [
          { text: '从 1.x 升级到 2.0', link: '/guide/migration-2.0' },
          { text: '常见问题', link: '/guide/faq' },
          { text: '故障排查', link: '/guide/troubleshooting' },
          { text: '与主流库对照', link: '/guide/comparison' },
          { text: '术语表', link: '/guide/glossary' },
        ],
      },
      {
        text: '组件 API（自动生成）',
        collapsed: false,
        items: [
          { text: '基础组件', link: '/components/basic' },
          { text: '数据展示', link: '/components/data' },
          { text: '表单输入', link: '/components/form' },
          { text: '反馈提示', link: '/components/feedback' },
          { text: '导航', link: '/components/nav' },
          { text: '布局', link: '/components/layout' },
          { text: '图表', link: '/components/chart' },
          { text: '登录', link: '/components/login' },
          { text: '存储', link: '/components/storage' },
          { text: 'Web Components', link: '/components/wc' },
          { text: '低代码表单', link: '/components/form-builder' },
          { text: '地图', link: '/components/amap' },
          { text: '路线规划', link: '/components/route-planner' },
        ],
      },
    ],
    outline: {
      level: [2, 3],
      label: '目录',
    },
    docFooter: {
      prev: '上一页',
      next: '下一页',
    },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '没有找到结果',
            resetButtonTitle: '清除',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },
  },
})
