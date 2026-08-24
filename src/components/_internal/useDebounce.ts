/**
 * useDebounce — 防抖 composable
 *
 * 场景：搜索输入、窗口 resize、列宽重算等「高频触发但只需最后一次」的场景。
 *
 * 用法：
 *   const { debouncedRef, cancel } = useDebounce(sourceRef, 300)
 *   // debouncedRef 会在 sourceRef 停止变化 300ms 后同步
 *
 *   // 或者直接包装一个函数：
 *   const { run, cancel } = useDebounceFn(fn, 300)
 *
 * also exports useThrottle for scroll/mousemove etc.
 */
import { ref, watch, onUnmounted, getCurrentInstance, type Ref } from 'vue'

/**
 * 防抖 ref：source 变化后等待 delay ms 才同步到 debouncedRef。
 * 每次 source 新变化都会重置计时器。
 */
export function useDebounce<T>(source: Ref<T>, delay = 300) {
  const debounced = ref(source.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | null = null

  const stop = watch(
    source,
    (val) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        debounced.value = val
        timer = null
      }, delay)
    },
    { flush: 'pre' },
  )

  function cancel() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  // 组件上下文才注册清理钩子（非组件调用如测试/工具场景跳过，避免 Vue warn）
  if (getCurrentInstance()) {
    onUnmounted(() => {
      cancel()
      stop()
    })
  }

  return { debouncedRef: debounced, cancel }
}

/**
 * 防抖函数：包装一个函数，在最后一次调用后 delay ms 执行。
 * 适合事件处理函数。
 */
export function useDebounceFn<F extends (...args: never[]) => unknown>(fn: F, delay = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null

  function run(...args: Parameters<F>) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn(...args)
      timer = null
    }, delay)
  }

  function cancel() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  if (getCurrentInstance()) onUnmounted(cancel)

  return { run, cancel }
}

/**
 * 节流 ref：source 变化时，每 delay ms 最多同步一次到 throttledRef。
 * 适合 scroll / mousemove 等持续高频事件。
 */
export function useThrottle<T>(source: Ref<T>, delay = 100) {
  const throttled = ref(source.value) as Ref<T>
  let lastTime = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const stop = watch(source, (val) => {
    const now = Date.now()
    const remaining = delay - (now - lastTime)

    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      throttled.value = val
      lastTime = now
    } else if (!timer) {
      timer = setTimeout(() => {
        throttled.value = val
        lastTime = Date.now()
        timer = null
      }, remaining)
    }
  })

  function cancel() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      cancel()
      stop()
    })
  }

  return { throttledRef: throttled, cancel }
}

/**
 * 节流函数：包装一个函数，每 delay ms 最多执行一次。
 * 适合 scroll / mousemove 等事件处理函数。
 */
export function useThrottleFn<F extends (...args: never[]) => unknown>(fn: F, delay = 100) {
  let lastTime = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  function run(...args: Parameters<F>) {
    const now = Date.now()
    const remaining = delay - (now - lastTime)

    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      fn(...args)
      lastTime = now
    } else if (!timer) {
      timer = setTimeout(() => {
        fn(...args)
        lastTime = Date.now()
        timer = null
      }, remaining)
    }
  }

  function cancel() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  if (getCurrentInstance()) onUnmounted(cancel)

  return { run, cancel }
}
