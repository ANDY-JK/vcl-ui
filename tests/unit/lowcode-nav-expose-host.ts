/**
 * LowCodeNav 的「宿主壳」测试宿主：用模板 ref 取外壳 `defineExpose` 出来的那份 API。
 *
 * ## 为什么要单独一个文件
 *
 * 两条原因，都踩过：
 *   ① `vue/one-component-per-file`：spec 里再写一个 `defineComponent` 会让该文件**两个**
 *      组件定义各报一条 —— lint 预算现已收紧到 `--max-warnings 0`（2026-11-09 清零轮），
 *      多一条就断链；与 `lowcode-nav-host.ts` / `anno-host.ts` 同款做法（本文件只含一个组件），
 *      其余需要多组件的夹具文件在文件头用带理由的 `eslint-disable` 显式登记。
 *   ② 语义必须按**宿主的方式**取：`@vue/test-utils` 的 `wrapper.vm` 会退到组件的**内部代理**，
 *      于是 `defineExpose({})` 这种变异在 `vm` 上照样能看到 `refresh`（假绿）。宿主用的是模板 ref，
 *      拿到的只是 `defineExpose` 的对象 —— 所以这里显式走 `$refs`。
 */
import { defineComponent, h } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import LowCodeNav from '@/components/form-builder/lowcode/LowCodeNav.vue'

/** 外壳经 `defineExpose` 对外提供的能力（宿主可见面） */
export interface ExposedNav {
  refresh?: () => Promise<void>
}

export interface ExposeHost {
  wrapper: VueWrapper
  /** 宿主看到的那份 API（模板 ref → defineExpose 结果），拿不到就是没暴露 */
  exposed: () => ExposedNav | undefined
}

export function mountExposeHost(
  props: Record<string, unknown>,
  cfg: { stubs?: Record<string, unknown> } = {},
): ExposeHost {
  const Host = defineComponent({
    setup() {
      return () => h(LowCodeNav, { ...props, ref: 'nav' })
    },
  })
  const wrapper = mount(Host, {
    global: { stubs: cfg.stubs ?? {} },
    attachTo: document.body,
  }) as VueWrapper
  return {
    wrapper,
    exposed: () => (wrapper.vm.$refs as Record<string, ExposedNav>).nav,
  }
}