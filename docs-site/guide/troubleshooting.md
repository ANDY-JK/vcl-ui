---
title: 故障排查
---

# 故障排查

按「现象 → 最可能原因 → 怎么确认 → 怎么修」组织。每条都对应本库真实出现过的问题，不是凭空列举。

---

## 样式类

### 组件完全没有样式（裸 HTML 观感）

**最可能**：没引 CSS。库不发「自动注入样式」，按域产物需要显式引入。

```ts
import 'vcl-ui/styles/tokens.css'  // 设计令牌，必须
import 'vcl-ui/basic/style.css'    // 该域样式（文件名以实际产物为准）
```

**确认**：DevTools 里看元素上有没有 `--vcl-*` 变量。没有 → 令牌没加载。

### 我的主题覆盖不生效

**最可能**：从 1.x 带过来的旧令牌名。2.0 起**所有公开设计令牌都加 `--vcl-` 前缀**。

```css
/* ✗ 不会生效 */
:root { --color-primary: #0052ff; }
/* ✓ */
:root { --vcl-color-primary: #0052ff; }
```

**确认**：

```bash
grep -rn -- '--color-\|--space-\|--fs-\|--z-' your-src/ | grep -v -- '--vcl-'
```

### 暗色模式没跟着切

库用**属性驱动**，不是 `prefers-color-scheme` 自动切。需要宿主在根元素上挂主题属性
（具体属性名以 `tokens.css` 里的选择器为准）。系统偏好**跟随**需要宿主自己监听后写属性。

### 布局在某分辨率下走形

**最可能**：用了视口断点而不是容器查询。本库布局切换优先跟**容器**走（`@container`），
容器查询在窄容器里比视口断点更准。如果你在宿主侧又加了一层 `@media`，两者会打架。

---

## 事件与契约类

### 监听 `@export` 但我的导出函数没被调用

**最可能**：写成了 v1 的回调 prop 形式 `:on-export="fn"`。**2.0 已删除该 prop**。

```vue
<!-- ✗ v1 写法，2.0 下静默无效 -->
<DataTable :on-export="myExport" />
<!-- ✓ -->
<DataTable @export="myExport" />
```

**为什么危险**：多传一个不存在的 prop 不会报错，它会落到 `$attrs` 上 —— 也就是**静默失效**。

### 测试里 `wrapper.emitted('rowClick')` 拿到 undefined

**最可能**：2.0 事件名统一 kebab，断言要写 `'row-click'`。
模板监听不用改（Vue 会归一），但测试断言是字符串匹配，不会归一。

### 调 `formBuilderRef.value.validateForm()` 报不是函数

**最可能**：2.0 收敛了近义入口。只留 `validate()`；要数据用 `getFormData()`，要错误明细用 `errors`。

---

## 地图（amap）类

### 地图一片空白，控制台有 key 相关报错

按顺序排查：

1. **有没有 key**：库**不发**高德 key，必须宿主在运行时注入（`setAmapKeys({ jsKey, restKey })`）。
   `.env.local` 里的 key 只用于本仓 demo，**不随库分发**。
2. **securityJsCode 配了吗**：高德要求安全密钥。为空时库**故意不写**全局配置
   （写空串会让高德以「未配置安全密钥」失败，报错更难定位）。
3. **域名白名单**：高德控制台里要登记你的域名，否则 JS API 会拒。

### 地图能出来，但标记点击不触发

**最可能**：标记没渲染。检查 `markers` 数组元素是否有 `longitude` / `latitude`（数字）。

### 反向地理编码一直返回 null

这是**设计如此** —— `reverseGeocode()` 失败一律返回 `null` 不抛错（反查只是锦上添花，
不该让你已选好的坐标作废）。要定位原因，看控制台 warn：无 key / 坐标非法 / HTTP 非 2xx /
高德业务失败（`status !== '1'`）都会打一条带原因的日志。

::: tip 配额
反向地理编码是**额外 REST 请求**，吃高德配额。地图选点的 `autoAddress` **默认关闭**，
需要文字地址才打开 —— 默认开等于替宿主默默花钱。
:::

---

## 图表（chart）类

### 图表不渲染 / 控制台报 `markArea is used but not imported`

**最可能**：按需注册表漏了组件。本库把 ECharts 组件按需注册（`utils/echarts-setup.ts`），
曾因漏 `MarkAreaComponent` 导致 `markArea` 静默不绘制。有专项测试锁注册清单。

### 图表容器有尺寸但空白

检查 `option` 是否为 `null`。`BaseChart` 在 `option` 为空时**仍会创建实例但不 `setOption`**，
同时渲染空态蒙层 —— 看起来就是「一片空白 + 暂无数据」。

### 测试环境里图表永远不初始化

`BaseChart` 在容器任一维度为 0 时**故意跳过 init**（等 `ResizeObserver`）。
jsdom 无布局 → 永远 0 → 永远不 init。测试里给元素打尺寸 getter，或直接断言「零尺寸不 init」。

---

## 存储与数据类

### 提示「IndexedDB 不可用」，草稿没保存

**最常见场景**：隐私模式 / 无痕窗口、或浏览器策略禁用了 IndexedDB。
库检测到不可用会**降级并打 warn**，不会静默丢数据也不阻塞表单使用。

### 分享链接打开后表单内容不对

分享码里带签名，**校验不通过会拒绝渲染**（不是显示空白）。若签名通过但内容不符，
检查分享码是否被截断/复制不全 —— 码里是 base64，少一个字符就解不出来。

### 低代码保存表单报错

检查 `FormStore` 实现或 `createRestFormStore` 的 `baseUrl`。REST 契约见
`designer/rest-form-store.ts` 顶部注释（`GET/POST /forms`、`GET/PATCH/DELETE /forms/{id}`、
`GET/POST /records/{key}`、`PATCH/DELETE /records/{key}/{id}`）。

---

## 构建与类型类

### `vue-tsc` 报 peer 依赖冲突 / 装不上

本仓对 Vue 是 **dev-pinned `^3.5.44`**、对宿主是 **peer `^3.5`**。宿主锁死更低版本时会冲突。
另外有一条已知的 invalid 依赖边（`@vue/language-core`，来自 `unplugin-dts`），
已在 `check:deps` 里**登记为已知噪音**并写明理由 —— 它不阻断构建，但升级 `vue-tsc` 需要 TS 5.7+。

### 按域产物 import 后类型全成 any

**最可能**：没有逐文件 `.d.ts` 或 `exports` 未可达。本库有 `verify:pkg` 闸口守这件事（含体积预算），
但宿主侧 `moduleResolution` 设成 `node`（而非 `bundler`/`node16`）时，subpath 类型可能解析不到。

### 构建后体积超出预期

主入口会带上全部域。改用按域入口（`vcl-ui/basic` 等）能显著减小。
本库自身的 `verify:pkg` 有体积预算，但那是**库产物**的预算，不含宿主的打包结果。

---

## 还是没解决？

1. 先看控制台有没有 `[BaseChart]`、`[FormBuilder]`、`[amap]`、`[map-picker]` 这类**带前缀的 warn** ——
   本库的网络/降级路径都会打一条带原因的日志，几乎都直接指向根因。
2. 再对照 [常见问题](/guide/faq) 里的「行为与边界」——有些「坏」是刻意设计（如反查返回 null）。
3. 最后看 [术语表](/guide/glossary) 确认我们说的是同一个东西（比如 `displaySource` vs `dataSource`）。
