/**
 * api-any — 公开 API 的「类型不可知」单点豁免
 *
 * 为什么这个文件存在
 * ==================
 * `@typescript-eslint/no-explicit-any` 全仓默认告警，但本库有几类公开 API
 * **必须**接受任意结构的数据（行数据 / 树节点 / 图表配置透传）——这是库的
 * 职责边界：数据长什么样由消费方决定，库不能替宿主定 schema。
 * 把 any 收进这里做**一次带理由的豁免**，其余代码全部引用这些别名，
 * lint 预算从「109 条散装告警」变成「0 条散装 + 1 个有据文件」：
 * 新增裸 any 会立刻在 lint 里现形，而不会淹没在预算余量里。
 *
 * 为什么不是 unknown
 * ==================
 * 改 unknown 会逼每个使用方在回调里写守卫——那是把库的成本转嫁给使用者。
 * 对应的类型面决策记录见：
 * - `data/composables/types.ts`（render/cell 的 value/row）
 * - `form/utils/types.ts`（format / cascaderOptions.children）
 *
 * v2 泛型化方向：DataTable<T> 泛型化后这些别名收成 T[keyof T]，
 * 届时本文件随之退役（破坏性变更攒批，见 data/composables/types.ts 注释）。
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- 本文件是全仓唯一允许字面 any 的位置：见文件头理由 */

/** 表格行数据：消费方任意结构，按列 key 取值（DataTable / ChartTable / 导出等共用） */
export type TableRow = Record<string, any>

/** 单元格原始值：来自 TableRow 的某一列，类型不可知 */
export type CellValue = any

/** ECharts option 透传形态：字段集合由 ECharts 版本决定，库不重复声明（Chart 域公共底座 / series 样式） */
export type ChartOption = Record<string, any>

/** 级联树节点 children：递归任意层、字段由调用方决定（Select 级联模式） */
export type TreeChildren = any[]
