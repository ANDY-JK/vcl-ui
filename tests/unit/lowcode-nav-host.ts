/**
 * useLowCodeNav 测试宿主。
 *
 * 为什么单独一个文件：`useLowCodeNav` 里有 `onMounted`（autoLoad）/`onUnmounted`（丢弃迟到结果）
 * 与 `watch`，必须在**组件实例**里跑；而直接在 spec 里写 `defineComponent` 会触发
 * `vue/one-component-per-file` warning —— 全仓 lint 的 warning 数压在阈值上，多一条就断链。
 * 该文件只含一个组件，同一条规则不会告警（与 `anno-host.ts` 同款做法）。
 */
import { defineComponent, h, ref, type Ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { useLowCodeNav, type UseLowCodeNavOptions } from '@/components/form-builder/lowcode/useLowCodeNav'
import type { NavNode } from '@/components/form-builder/lowcode/nav-schema'

export interface LowCodeHost {
  /** composable 的完整返回面（全部方法都在这里可直测） */
  api: ReturnType<typeof useLowCodeNav>
  wrapper: VueWrapper
  /** 宿主自持的选中 ref（`withModel` 为真时交给 composable 当 modelValue） */
  selected: Ref<string | null>
  /** onSelect 的调用留痕（断言"只通知、不偷偷改"用） */
  selectCalls: NavNode[]
}

export function mountLowCodeHost(
  opts: UseLowCodeNavOptions = {},
  cfg: { withModel?: boolean } = {},
): LowCodeHost {
  const selected = ref<string | null>(null)
  const selectCalls: NavNode[] = []
  let api!: ReturnType<typeof useLowCodeNav>

  const Host = defineComponent({
    setup() {
      api = useLowCodeNav({
        ...opts,
        ...(cfg.withModel ? { modelValue: selected } : {}),
        onSelect: (n) => {
          selectCalls.push(n)
          opts.onSelect?.(n)
        },
      })
      return () => h('div', { class: 'lc-host' })
    },
  })
  const wrapper = mount(Host, { attachTo: document.body })
  return { api, wrapper, selected, selectCalls }
}