/** 布局组件按需导入入口 */
export { default as AppLayout } from './AppLayout.vue'
export { default as MiniLayout } from './MiniLayout.vue'
export { default as AccordionNav } from './AccordionNav.vue'
export { default as ModalBox } from './ModalBox.vue'
/** @deprecated 已合并到 Flex */
export { default as Space } from './Space.vue'
export { default as Flex } from './Flex.vue'
export { navTree, flattenNodes, getPrevNext, getCategory, getCurrentLabel } from './utils/navData'
export type { NavNode } from './utils/navData'
