---
layout: home

hero:
  name: vcl-ui
  text: Vue 3 通用组件库
  tagline: 14 个组件域 · 60+ 组件 · 按域多入口构建 · 设计令牌驱动 · 暗色与 i18n 内置
  actions:
    - theme: brand
      text: 快速上手
      link: /guide/quick-start
    - theme: alt
      text: 组件 API
      link: /components/basic

features:
  - icon: 🧩
    title: 按域引入，真隔离
    details: 主入口 + 14 个域独立构建产物，引 vcl-ui/basic 只加载 basic 与共享 core chunk，不带其他域代码。
  - icon: 🎨
    title: 设计令牌驱动
    details: 颜色/间距/断点/层级全部走 CSS 自定义属性，亮暗双主题；机械闸口看守令牌断档。
  - icon: 🌍
    title: i18n 内置
    details: zh-CN / en-US 语言包按域分块，支持宿主 i18n 共存与外部文案覆盖，不污染内置语言包。
  - icon: ♿
    title: 无障碍底线
    details: 全站 axe-core 扫描值守，焦点陷阱/模态互斥/ESC 栈/键盘导航有专项回归。
  - icon: 📦
    title: 发布即用
    details: 双格式产物 + 逐文件类型声明 + 六项发包自检（声明完整性/exports 可达/密钥/3.4 兼容/体积预算）。
  - icon: 🧱
    title: 跨框架出口
    details: Web Components 版本可在 React/原生页面直接使用，与 Vue 版本同一套令牌与行为。
---
