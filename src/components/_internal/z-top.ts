// z-top 层级提升工具 — 弹层组件挂载期间让内嵌 Toast 显示在弹层之上
// 用法：const release = boostZTop()；卸载时 release()
// 模块级引用计数：多组件/多实例共享，最后一个释放才移除属性

let _boost = 0

export function boostZTop() {
  if (typeof document === 'undefined') return () => {}
  if (++_boost === 1) document.documentElement.style.setProperty('--z-top', '10001')
  // 幂等释放：重复调用 release 不再递减计数，防止异常路径下 --z-top 永久残留
  let released = false
  return () => {
    if (typeof document === 'undefined' || released) return
    released = true
    if (--_boost === 0) document.documentElement.style.removeProperty('--z-top')
  }
}
