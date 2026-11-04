/**
 * 可写判据（TD-90 收口 —— 判据收敛到 _internal）
 *
 * ## 为什么有这一个文件
 *
 * TD-90 追了三次同一类缺陷：
 *   ① `#286` 清空按钮只判 `clearable && hasValue`，不看 `readonly` / `disabled`
 *   ② `#287` tag × / Upload 删除 / 密码显隐 同类漏判
 *   ③ `#427` 时间面板的「确定」只靠 `v-if` 隐藏，面板打开后 `disabled` 翻真仍能写
 *
 * 三次的共同形态：**每个自绘写入口各自手写一遍判据**，写法还不一样 ——
 * `clearable && !readonly && !disabled`（Input）、`!disabled`（Select）、
 * 模板内联 `!disabled`（Upload）。判据散落 = 新入口必然再漏一次。
 *
 * 因此按台账里写好的触发条件收敛到这里：**语义唯一、命名唯一**，
 * 组件只需 `canWrite(props)`，新增入口引用同一函数即可。
 *
 * ## 与 `textWritable` / `isTextWritable`（data 域）的区别
 *
 * data 域那套判的是"这个**列**能不能接受文本值"（列声明 `accept: 'image'` /
 * `editable: false`）；这里是"这个**控件当前能不能被写入"（`disabled` / `readonly`
 * 两个通用字段）。两者相关但判据不同，刻意不合并 —— 合并会逼出一堆可选字段。
 */

/** 参与可写判据的最小 props 面（组件结构上可直接传入） */
export interface WritableProps {
  /** 禁用：与浏览器原生语义一致，任何写入都必须拦（含键盘/程序化入口） */
  disabled?: boolean
  /** 只读：能选中/复制，但不能写。与 disabled 的差别只在视觉与焦点可达性 */
  readonly?: boolean
}

/**
 * 当前是否可写。
 *
 * `disabled` 与 `readonly` 任一为真即不可写 —— 这是本库对"写"的统一口径：
 * 判据看**当下状态**，允许"控件先渲染、状态后变"（面板打开后 disabled 翻真，
 * 写入口必须自己再判一次，不能依赖渲染分支）。
 */
export function canWrite(props: WritableProps): boolean {
  return !props.disabled && !props.readonly
}
