// ==================== 活动表格实例标记（多实例作用域） ====================
// 多实例共存时，Ctrl+C/V 与 Ctrl+Z/Y 只应作用于「用户最后操作过的那张表」。
// 该标记是**模块级**共享状态（跨实例），故单独成模块，避免各子模块各存一份导致判断分叉。
//
// ⚠️ 调用点必须覆盖所有「进入该表操作」的入口，不能只依赖点击：
//    - selectCell / toggleSelectColumn / startRange（点击与拖选）
//    - startEdit（进入编辑：拖选结束后 200ms 内的 click 会被 _rangeSuppressClick 吞掉，程序化进入编辑也无 click）
//    - 卡片视图字段点击 / options 面板打开（卡片视图没有 <td>，不会走 selectCell）
//    漏标的表现是 Ctrl+Z/C/V **静默失效**或作用到别的表格上。

let _activeEditInstance: object | null = null

/** 每实例唯一标识（同一实例内引用恒定） */
export function createEditKey(): object {
  return {}
}

/** 标记「本表格是用户当前操作的表格」 */
export function markActive(key: object): void {
  _activeEditInstance = key
}

/** 当前活动的表格实例是否为本实例 */
export function isActiveInstance(key: object): boolean {
  return _activeEditInstance === key
}
