---
title: 从 1.x 升级到 2.0
---

# 从 1.x 升级到 2.0（破坏性变更清单）

2.0 是一次「契约卫生」大版本：**回调 prop 归位事件、多词事件名统一 kebab、expose 近义入口收敛**。

先给你一个好消息：**模板里的 `@事件` 监听一律不用改** —— Vue 编译期会把 `@row-click` 和 `@rowClick`
归一成同一个处理器键，两种写法都收得到。

需要动的只有三类：

1. 传过被删 prop 的
2. 用 JS/TS 直接调过被删方法的
3. 在测试里按 camelCase 断言过事件名的

---

## 1. DataTable 宿主联动回调 prop 删了，改事件（Q5）

| v1                        | v2                                                                       |
| ------------------------- | ------------------------------------------------------------------------ |
| `:on-export="fn"`         | `@export="fn"`（语义不变：挂了监听 = 服务端导出，内置 CSV/Excel 整个跳过） |
| `:on-toggle-sidebar="fn"` | `@toggle-sidebar="fn"`（没挂监听仍降级 `inject('toggleCollapse')`）      |

```vue
<!-- v2 -->
<DataTable :data="rows" :columns="cols" @export="onExport" @toggle-sidebar="onToggle" />
```

## 2. 多词事件名统一 kebab-case（N8）

模板监听无需改，**仅文档 / 测试断言口径变化**：

- `DataTable`：`rowClick`→`row-click`、`rowAction`→`row-action`、`rowContextAction`→`row-context-action`、
  `cellChange`→`cell-change`、`cellNote`→`cell-note`、`batchChange`→`batch-change`、
  `pageChange`→`page-change`、`selectionChange`→`selection-change`、`fullscreenChange`→`fullscreen-change`
- `Select`：`visibleChange`→`visible-change`；`ToggleList`：`itemClick`→`item-click`、`buttonClick`→`button-click`；
  `Drawer`：`afterOpen`/`afterClose`→`after-open`/`after-close`
- `StorePanel`（route-planner）：`toggleSkip`→`toggle-skip`、`skipCity`→`skip-city`、`removeCity`→`remove-city`
- form-builder 内部子组件（`DesignerCanvas` / `RichtextToolbar`，仅经 `FormDesigner`/`RendererRichtext` 消费）：
  `insertAt`→`insert-at`、`insertIntoContainer`→`insert-into-container`、`sortNode`→`sort-node`、
  `assignSlot`→`assign-slot`、`updateContainer`→`update-container`、`inlineCode`→`inline-code`、
  `togglePreview`→`toggle-preview`、`toggleFullscreen`→`toggle-fullscreen`

::: tip 怎么查自己有没有踩到
测试里按 camelCase 断言事件名会静默失效（拿不到 emit 就断言 undefined）。升级后用一条命令扫一遍：

```bash
grep -rnE "emitted\(['\"][a-z]+[A-Z]" tests/ || echo "干净"
```
:::

## 3. expose 近义入口收敛（Q18）

| 组件         | v1                                        | v2                                                                    |
| ------------ | ----------------------------------------- | --------------------------------------------------------------------- |
| `FormBuilder` | `validate()` / `validateForm()` / `validateAndGet()` 三个近义入口 | 只留 `validate()`；要数据用 `getFormData()`、错误明细用 `errors` |
| `login`      | `notifyFailed()` / `recordFailedAttempt()` / `notifySuccess()` | 删掉，改传 `:auth-result="{ ok, message? }"` prop（watch 驱动同一套锁定计数） |

```vue
<!-- v1 -->
<LoginPage ref="loginRef" @submit="onSubmit" />
<!-- loginRef.value.notifyFailed('密码错误') -->

<!-- v2 -->
<LoginPage ref="loginRef" :auth-result="{ ok: false, message: '密码错误' }" @submit="onSubmit" />
```

## 4. 设计令牌全量加 `--vcl-` 命名空间

1.x 升级者若**在自己的 CSS 里覆盖过库令牌**，改名规则只有一条：**旧令牌名前加 `vcl-`**。

| v1                 | v2                     |
| ------------------ | ---------------------- |
| `--color-primary`  | `--vcl-color-primary`  |
| `--space-4`        | `--vcl-space-4`        |
| `--z-modal`        | `--vcl-z-modal`        |

`tokens.css` 声明的**全部**设计令牌无一例外；`gen-theme` / 主题编辑器的配置键同步换名。

::: warning 组件内部旋钮不属公开契约
`--fb-*`、`--nav-*` 等声明在组件文件里的内部变量**没有改名**，也不建议宿主依赖它们。
:::

升级口诀 —— 宿主 CSS 里扫一遍，命中的按前缀规则改名：

```bash
grep -rn -- '--color-\|--space-\|--fs-\|--z-\|--radius-\|--shadow-' src/ | grep -v -- '--vcl-'
```

## 升级检查清单

- [ ] 全仓搜 `:on-export` / `:on-toggle-sidebar` → 改成 `@export` / `@toggle-sidebar`
- [ ] 搜 `validateForm(` / `validateAndGet(` → 改 `validate()` + `getFormData()` + `errors`
- [ ] 搜 `notifyFailed(` / `notifySuccess(` → 改 `:auth-result` prop
- [ ] 按上面的 `grep` 扫测试里 camelCase 事件断言
- [ ] 宿主 CSS 里的旧令牌名加 `vcl-` 前缀
- [ ] 跑一遍宿主自己的测试（库不会替你测这件事）

## 这一版还顺手改了什么

完整清单见仓库根目录 `CHANGELOG.md`（**生成的，不可手改**）。
`BREAKING CHANGES` 段由带 `!` 的 conventional commit 自动汇总而来，所以它一定和真实变更同步。

::: info 本库尚未发布到 npm
当前 `package.json` 版本 2.0.0 但 registry 上查不到 `vcl-ui` —— 若你是通过本地 `link` / 直接引源码使用，
升级时以上清单同样适用（它们描述的是**组件契约**，与分发方式无关）。
::: 
