/**
 * useImageAnnotation 测试宿主。
 *
 * 为什么单独放一个文件：composable 里有 `onMounted`（建 ResizeObserver）/`onUnmounted`
 * （取消 rAF、断开 RO、解绑 window mouseup）/`watch`，必须在**组件实例**里跑。
 * 直接在 spec 里写 `defineComponent` 会触发 `vue/one-component-per-file` warning，
 * 而全仓 lint 的 warning 数正好压在阈值上——多一条就断链。所以宿主单独成文件，
 * 该文件里只有一个组件（同一条规则不会告警）。
 */
import { defineComponent, h, ref, type Ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { vi } from 'vitest'
import { useImageAnnotation } from '@/components/data/composables/useImageAnnotation'

export interface AnnoHost {
  /** composable 的完整返回面（全部方法都在这里可直测） */
  api: ReturnType<typeof useImageAnnotation>
  annoCanvas: Ref<HTMLCanvasElement | null>
  currentIndex: Ref<number>
  /** 无标注态时的键盘回落（断言是否被调用） */
  fallback: ReturnType<typeof vi.fn>
  wrapper: VueWrapper
}

export function mountAnnoHost(): AnnoHost {
  const annoCanvas = ref<HTMLCanvasElement | null>(null)
  const currentIndex = ref(0)
  const fallback = vi.fn()
  let api!: ReturnType<typeof useImageAnnotation>

  const Host = defineComponent({
    setup() {
      api = useImageAnnotation(annoCanvas, { currentIndex, onKeydownFallback: fallback })
      return () => h('div', { class: 'anno-host' })
    },
  })
  const wrapper = mount(Host, { attachTo: document.body })
  return { api, annoCanvas, currentIndex, fallback, wrapper }
}

/**
 * 造一个挂在 stage 下的画布：stage 有实测尺寸与矩形偏移，canvas.getContext 打桩。
 *
 * ⚠️ 尺寸**必须避开 happy-dom 的 canvas 默认值（宽 300 / 高 150）**：否则「渲染时把
 * stage 尺寸写给画布」这条契约会被默认值巧合满足——去掉赋值断言照样通过（假绿）。
 * 所以默认取 640×480，两个方向都不是默认值。
 */
export function makeCanvas(opts: { w?: number; h?: number; left?: number; top?: number } = {}) {
  const { w = 640, h = 480, left = 10, top = 20 } = opts
  const stage = document.createElement('div')
  Object.defineProperty(stage, 'clientWidth', { value: w, configurable: true })
  Object.defineProperty(stage, 'clientHeight', { value: h, configurable: true })
  stage.getBoundingClientRect = () =>
    ({
      left,
      top,
      width: w,
      height: h,
      right: left + w,
      bottom: top + h,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect
  const cvs = document.createElement('canvas')
  stage.appendChild(cvs)
  document.body.appendChild(stage)
  const ctx = { clearRect: vi.fn() }
  // 不用 spyOn：happy-dom 的 HTMLCanvasElement 未必有可 spy 的 getContext 实现，
  // 直接定义成实例自有属性最稳（与 barcode 那边给原型打桩同理）
  Object.defineProperty(cvs, 'getContext', {
    value: vi.fn(() => ctx as unknown as CanvasRenderingContext2D),
    configurable: true,
    writable: true,
  })
  return { stage, cvs, ctx, left, top, w, h }
}