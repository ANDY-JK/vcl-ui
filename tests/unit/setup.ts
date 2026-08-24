// 全局测试 setup：静默测试环境噪音，保留真实问题的 warn/error
import { vi } from 'vitest'

// 静默的测试环境噪音（非代码 bug）：
// 1. composable 在组件外直接调用时旧版 Vue 的"无活动组件实例"warn——
//    composable 设计为组件内用，测试用法导致的正常现象（相关 composable
//    已加 getCurrentInstance 守卫，此处兜底兼容旧用例）。
// 2. "Missing required prop"——测试 mount 少传 prop 的提示（已逐文件修复）。
// 3. Vue Test Utils 访问 wrapper.vm 时对 setup 返回对象枚举 keys 的提示。
const originalWarn = console.warn
vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
  const msg = String(args[0] ?? '')
  if (
    msg.includes('no active component instance') ||
    msg.includes('Missing required prop') ||
    msg.includes('relying on enumerating keys')
  ) {
    return // 静默测试噪音
  }
  originalWarn(...args)
})
