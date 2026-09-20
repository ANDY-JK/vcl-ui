# Web Components

`wc` 域把常用组件编译为原生 Custom Elements，可在 **React / 原生页面 / 微前端**中直接使用，无需 Vue 运行时参与。

## 注册

```ts
import { registerWebComponents } from 'vcl-ui/wc'
import 'vcl-ui/css'

registerWebComponents() // 注册全部自定义元素
```

## 使用

```html
<!-- Vue 模板内外通用 -->
<vc-button variant="primary">点击我</vc-button>
<vc-input label="用户名"></vc-input>
```

React 中直接写标签即可（属性用连字符形式）：

```tsx
export default function Page() {
  return <vc-button variant="primary">点击我</vc-button>
}
```

## 注意事项

- 样式仍来自 `vcl-ui/css`（Design Token 驱动），WC 版本与 Vue 版本共用同一套令牌与暗色机制
- Shadow DOM 内部样式隔离：外部 CSS 选择器进不去，定制走令牌覆盖
- 事件名为 kebab-case（`marker-click` 形式），与 Vue 版本的 `update:*` camelCase 双轨一致
