// z-top 层级提升工具 — 弹层组件挂载期间让内嵌 Toast 显示在弹层之上
// 用法：const release = boostZTop()；卸载时 release()
// 模块级引用计数：多组件/多实例共享，最后一个释放才移除属性

let _boost = 0

export function boostZTop() {
  if (++_boost === 1) document.documentElement.style.setProperty('--z-top', '10001')
  return () => {
    if (--_boost === 0) document.documentElement.style.removeProperty('--z-top')
  }
}
