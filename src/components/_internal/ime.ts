/**
 * 输入法（IME）合成期判定 —— 单一判据（2026-11-01 #276）
 *
 * ## 为什么必须统一
 *
 * 中文用户输拼音 → 候选框 → 按 Enter（或 Space）上屏。浏览器在此之前先派发 `keydown`：
 * - Chrome/Edge/Firefox：`event.isComposing === true`
 * - 部分 Safari / 旧 WebView / 某些输入法：`isComposing` 不置位，只给 `keyCode === 229`
 *
 * 如果组件在这个 keydown 里 `preventDefault()` 或执行"确认/提交"动作，后果是双重的：
 *   ① **上屏被取消**（用户按了回车，字却没上）；
 *   ② **拼音被当成真实值**写进表单/单元格/选项（出现 "zhangsan" 而不是「张三」）。
 *
 * 全库原本**零处**处理（只有 `RendererRichtext.vue` 自己判），于是同一个坑在
 * 表格内联编辑、下拉搜索、登录/找回{{PASSWORD}}表单各踩一遍。收敛到这里。
 *
 * ## 用法
 *
 * ```ts
 * function onKeydown(e: KeyboardEvent) {
 *   if (isImeComposing(e)) return   // 放行：让输入法自己处理上屏
 *   if (e.key === 'Enter') submit()
 * }
 * ```
 *
 * ⚠️ 守卫必须放在**函数最前面**，在所有 `preventDefault` 之前 —— 放中间等于没放。
 */
export function isImeComposing(e: Pick<KeyboardEvent, 'isComposing'> & { keyCode?: number }): boolean {
  // keyCode 229 是"这个按键事件被输入法消费了"的历史约定，Safari/WebView 仍在用
  return e.isComposing === true || e.keyCode === 229
}
