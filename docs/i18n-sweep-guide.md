# i18n 硬编码中文清扫规范

> 适用范围：`src/components/**` 的 UI 可见中文文案 → vue-i18n `t()` 化。
> 语言包：`src/components/_internal/locales/chunks/{zh-CN,en-US}/*.ts` 按模块分块；聚合器 `zh-CN.ts`/`en-US.ts` 自动组合；en 聚合器有 `satisfies typeof zhCN` 键集强约束，**en 缺 key 会在 typecheck 报错**。

## 一、判定：哪些转、哪些保留

**转换（UI 可见）：** 模板文本、aria-label/title/placeholder、prop 默认值（用户可见的 label/options/confirm 文案）、Error 对象与 error ref 消息、notify/toast 文案、option 下拉项、注册表 label/group、ECharts option 内文案（系列名兜底、toolbox 标题）、预设模板的标签文案。

**保留（不转）：** `console.warn/error/log` 与 `warnOnce` 开发日志、注释、领域数据（如大写金额数字、地址启发词「人民政府」、Excel 列头映射「4级乡镇」）、正则/枚举值、测试 fixture。

## 二、组件接线三种模式

1. **script setup 无默认值需求**：`import { useT } from '@/components/_internal/i18n'` + `const t = useT()`，模板直接 `t('domain.key')`。
2. **prop 默认值工厂需要 t（withDefaults 内）**：defineProps 会被提升到 setup 之外执行，**引用 setup 局部变量会 TDZ/编译报错**。必须在普通 `<script lang="ts">` 块声明模块级 t：
   ```vue
   <script lang="ts">
   import { useT } from '@/components/_internal/i18n'
   /** 模块级 t：prop 默认值工厂在 setup 之前执行（defineProps 被提升），不能引用 setup 局部变量 */
   const t = useT()
   </script>
   <script setup lang="ts">...</script>
   ```
   默认值写函数形式：`placeholder: () => t('form.pleaseSelect')`。setup 块内不再重复 `const t`（同一作用域）。
3. **纯 .ts 文件（composable/服务/注册表）**：模块级 `const t = useT()`（import 后声明），各函数直接用。

## 三、已知陷阱（必须遵守）

- **TS1184**：`<script setup>` 内 value 声明（const/let）之后不能出现 `export type/interface`——把 type 导出移到普通 `<script>` 块，或把 value 声明放普通块。
- **禁止模板内联多语句 handler**：`@click="a = 1; b = 2"` 会被 prettier（`semi:false`）重排成无分号多行 → Vue 表达式解析失败。一律改 script 命名函数（本库已修复 9 处，勿新增）。
- **键名重复**：分块对象内 key 不得重名（TS1117）；新增前先 grep 该分块确认。
- **复用优先**：添加新 key 前先查既有 key（`grep '候选词' chunks/zh-CN/*.ts`），如 `common.close/common.confirm/common.empty`、`form.pleaseSelect/form.selectDate`、`chart.seriesFallback` 等直接复用，跨域引用合法。
- **枚举/映射常量**：被 UI 消费的模块级 const 映射（如注册表）不得存翻译后文案——存 i18n key，在调用处/computed 内翻译（参照 `fieldRegistry.ts` 的 label/group + `designer/types.ts` 的 `getFieldTypes()`）。

## 四、key 组织

- 每模块一个分块：`formBuilder.ts`/`data.ts`/`layout.ts`/`internal.ts`；zh 与 en 同步添加（同键名）。
- 命名：域内 camelCase，短小语义化；带插值用 vue-i18n 命名参数 `'已选 {n} 项'` → `t('domain.picked', { n })`。
- zh 值 = 原文案原样（保证 zh 界面与既有测试零变化）；en 值 = 准确英文翻译。

## 五、验证（每完成一个模块跑一次，全部完成后再全量）

```bash
npm run typecheck          # 键集约束 + 类型
npx vitest run             # 479 例全量
npm run build              # 模板编译兜底
node scripts/scan-template-expr.mjs   # 模板表达式体检，必须报"全部模板编译通过"
```

清扫度自检（以 data 模块为例，命中应为 0）：

```bash
grep -rnP "['\"\`][^'\"\`]*[\x{4e00}-\x{9fff}]" src/components/<模块> --include="*.vue" --include="*.ts" \
  | grep -v "console\.\|warnOnce\|spec" | grep -vP ":\s*(\*|//|<!--)"
```
剩余命中逐条核对：属第一节「保留」类则注明理由，否则继续清扫。

## 六、已完成参照

- 提交 `66d3288`（八小模块）、`a241022`（分块基建）、fieldRegistry key 化改造——遇到模式疑问先看这些提交的写法。
