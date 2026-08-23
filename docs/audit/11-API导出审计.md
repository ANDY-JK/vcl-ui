# 11 · API 与导出审计

> 评分：**80 / 100**

## 一、导出结构总览

主入口 `src/components/index.ts` 是唯一公开出口，按域分组导出，结构清晰。

| 域 | 导出内容 | 数量（约） |
|----|---------|------|
| basic | Button / IconSvg / Tag | 3 |
| data | DataTable 等 12 组件 + 类型 + createLocalStorage | 15+ |
| form | Input/Select/Group/IconPicker/Upload/CameraCapture + 工具 + 类型 | 9+ |
| amap | AmapWidget + key 管理 + service 函数 + 类型 | 大量 |
| feedback | Toast/Loading/Popover/Result/Drawer/… + 音频/语音/通知工具 | 14+ |
| nav | Tabs/Steps/Pagination/Breadcrumb/Menu | 5 |
| layout | AppLayout/MiniLayout/AccordionNav/ModalBox/Space/Flex + navData | 8+ |
| chart | Chart/BaseChart/ChartTable/ChartLegend + 类型 | 5+ |
| login | LoginPage/RegisterPage/ForgotPasswordPage/PortalLogin + 类型 | 6 |
| storage | storage*（localStorage）+ db*（IndexedDB）+ contract-storage | 大量 |
| route-planner | RouteMap/RouteResult/StorePanel/StoreFormModal/ImportProgress | 5 |
| form-builder | FormDesigner/FormBuilder/FormCollect/FormRenderer/FieldError + 大量工具/类型 | 19+ |
| _internal 对外 | useTheme / i18n / setLocale / useT / useI18n | 6 |
| shared | 类型（Option/MenuItem/…） | 多个 |

## 二、优点

1. **出口单一清晰**：所有公开 API 集中在 `index.ts`，带保护性注释「⛔ 禁止删除/重命名导出，下游依赖此文件」。
2. **组件与类型分离导出**：`export { default as X }` 与 `export type { ... }` 分门别类，TS 消费方体验好。
3. **工具函数单独导出**：beep/voice/notify、amap service、barcode scanner 等独立工具显式导出，方便按需引入。
4. **废弃标记规范**：`Space` 用 `@deprecated` 注明合并到 Flex。
5. **i18n/主题对外暴露**：`useTheme`、`i18n`、`setLocale` 让消费方能定制主题与语言。
6. **多子路径导出**：`package.json` `exports` 提供 `./basic`、`./data`、`./form` 等 10+ 子路径，支持按域引入。

## 三、问题

### 3.1 wc 域未从主入口导出（中）

`src/components/wc/index.ts` 存在且导出 3 个（Web Components 封装），但主 `index.ts` **未导出 wc 域**。而 `package.json` 的 `exports` 里**有** `./wc` 子路径：

```json
"./wc": { "types": "./src/components/wc/index.ts", "import": "./src/components/wc/index.ts" }
```

→ 矛盾：子路径可访问，但主入口不导出。消费者只能通过 `import ... from 'vue-component-lib/wc'` 而非主入口，需决策「wc 是正式能力还是试验功能」。

### 3.2 NavItem 未导出但被内部使用（低）

`layout/NavItem.vue` 是唯一未导出的组件，被 AccordionNav/MiniLayout 内部使用。合理，但建议加「内部组件」注释，避免被误判为遗漏。

### 3.3 `exports` 子路径指向源码而非构建产物（中）

```json
"./basic": { "types": "./src/components/basic/index.ts", "import": "./src/components/basic/index.ts" }
```

子路径（`./basic`、`./data` 等）直接指向 **src 源码**，而非 `./dist`。这意味着：
- 消费者按子路径引入时，会直接消费 TS 源码，需自行处理 `.vue` 编译；
- 与主入口（指向 `./dist/*.js`）行为不一致，可能造成「子路径能用但需要额外构建配置」的坑。

### 3.4 类型导出路径跨组件文件（低）

部分类型直接从组件文件导出（如 `export type { ImageItem, ImageSrc } from './data/ImagePreview.vue'`、`RegisterPayload from './login/register.vue'`）。功能上可行，但类型定义耦合在组件文件内，大组件（ImagePreview 1468 行）的类型更难独立维护，建议类型下沉到 `types.ts`。

## 四、`package.json` exports 完整性

| 子路径 | types | import/require | 备注 |
|--------|-------|---------------|------|
| `.` | dist/index.d.ts | dist/*.js | ✅ 主入口 |
| `./basic` ~ `./wc`（10 个域） | 指向 src | 指向 src | ⚠️ 指向源码 |
| `./dist/*` | — | dist/* | ✅ 通配 |
| `./src/*` | — | src/* | ✅ 通配 |
| `./package.json` | — | — | ✅ |

## 五、改进建议

| 优先级 | 动作 |
|--------|------|
| P1 | 统一 `exports` 子路径指向 `dist`（或明确文档说明子路径需编译） |
| P1 | 决策并处理 wc 域（导出 + 文档 或 移除） |
| P2 | 类型定义从巨型组件下沉到独立 `types.ts` |
| P2 | 为 NavItem 加「内部组件」注释 |

## 六、评分说明

80 分：导出结构、类型分离、工具导出、废弃标记、i18n/主题暴露都做得规范，是本次审计中得分最高的维度之一；扣分点是 `exports` 子路径指向源码、wc 域未导出的矛盾、类型耦合在组件文件内。

---

*数据来源：`src/components/index.ts`、各域 `index.ts`、`package.json` exports 字段核查。*
