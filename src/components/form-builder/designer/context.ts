/**
 * 设计器共享上下文 — provide/inject 按引用共享
 *
 * 表单管理实例（useFormManager 返回的 reactive 对象）由 FormDesigner 创建后 provide，
 * 子组件（DesignerSettings / SavedFormsDrawer）inject 使用。
 * 不用 prop 传递的原因：它是「共享可变响应式状态」而非单向数据流，
 * 直接改 prop 对象属性会触发 vue/no-mutating-props，且语义上误导调用方。
 */
import type { InjectionKey } from 'vue'
import type { FormManager } from './useFormManager'

export const FORM_MANAGER_KEY: InjectionKey<FormManager> = Symbol('form-manager')
