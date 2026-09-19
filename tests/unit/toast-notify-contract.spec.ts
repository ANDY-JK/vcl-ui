// #24(a) useToastNotify 的 ToastInstance 类型与 Toast.vue 真实 show(message, type?, duration?, options?) => number 对齐，
//         notify 必须把 id 透出，调用方才能按 id 精确 remove（此前返回 void，拿不到 id）
// #24(c) error 级 toast 需 role="alert"（隐式 assertive），只靠容器 aria-live="polite" 会延迟播报
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import Toast from '@/components/feedback/Toast.vue'
import { useToastNotify } from '@/components/_internal/useToastNotify'

const mounted: Array<{ unmount: () => void }> = []

function track<T extends { unmount: () => void }>(w: T): T {
  mounted.push(w)
  return w
}

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('useToastNotify · 契约', () => {
  it('notify 返回 toast id，且该 id 可直接 remove 掉对应通知', async () => {
    let api: ReturnType<typeof useToastNotify> | undefined
    const Host = defineComponent({
      setup() {
        api = useToastNotify()
        return () => h(Toast, { ref: api!.toastRef })
      },
    })
    track(mount(Host, { attachTo: document.body }))
    await nextTick()

    const id = api!.notify('保存成功', 'success')
    expect(typeof id).toBe('number')
    await nextTick()
    expect(document.querySelectorAll('.toast-item')).toHaveLength(1)

    api!.toastRef.value?.remove(id as number)
    await nextTick()
    expect(document.querySelectorAll('.toast-item')).toHaveLength(0)
  })
})

describe('Toast · error 级无障碍播报', () => {
  it('error 条 role="alert"、普通条 role="status"，容器不做 live region（避免嵌套覆盖）', async () => {
    const w = track(mount(Toast, { attachTo: document.body }))
    const vm = w.vm as unknown as { show: (m: string, t: string) => number }

    vm.show('出错了', 'error')
    await nextTick()
    expect(document.querySelector('.toast-item')?.getAttribute('role')).toBe('alert')

    vm.show('普通提示', 'info')
    await nextTick()
    // 新 toast 渲染在最前，此处取到的是刚插入的 info 条
    expect(document.querySelector('.toast-item')?.getAttribute('role')).toBe('status')
    // 容器若仍是 aria-live，alert 会被父级 polite 覆盖或重复播报
    expect(document.querySelector('.toast-container')?.getAttribute('aria-live')).toBeNull()
  })
})
