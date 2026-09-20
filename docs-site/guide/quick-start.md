# 快速上手

## 全量引入

```ts
import 'vcl-ui/css' // 样式：必须引入（一次即可）
import { createApp } from 'vue'
import VclUi from 'vcl-ui'
import App from './App.vue'

createApp(App).use(VclUi).mount('#app')
```

## 按域引入（推荐）

每个域子路径是**独立构建产物**，引哪个域只加载哪个域的代码：

```ts
import 'vcl-ui/css'
import { Button, DataTable } from 'vcl-ui/data'   // 只加载 data 域 + 共享 core chunk
```

```ts
import { Button } from 'vcl-ui/basic'
import { Input, Select } from 'vcl-ui/form'
```

## 第一个组件

```vue
<template>
  <Button variant="primary" @click="handleClick">点击我</Button>
  <Input v-model="text" label="用户名" placeholder="请输入" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Button, Input } from 'vcl-ui/basic'

const text = ref('')
const handleClick = () => console.log('clicked')
</script>
```

## 国际化（可选）

```ts
import { i18n, setLocale } from 'vcl-ui/i18n'
// main.ts
app.use(i18n)
// 切换语言
setLocale('en-US')
```

不安装 `vcl-ui/i18n` 时组件默认中文可用（`useT` 免全局安装）；接入宿主自己的 i18n 见[国际化](/guide/i18n)。

## 下一步

- [主题与设计令牌](/guide/theming) — 暗色、品牌色定制
- [组件 API](/components/basic) — 每个域的 props / events 速查（自动生成）
