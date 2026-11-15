/**
 * DataTableBatchDialog · 三条关闭路径都必须停用焦点陷阱（#511）
 *
 * 批量修改弹窗是 `role="dialog" aria-modal="true"`，配了焦点陷阱（Tab 循环不逃到背后的表格）。
 * 它的关闭路径有三条：
 *   · 取消按钮 → `closeBatchEdit()`  → 先 `deactivateTrap()` 再隐藏  ✅
 *   · 弹窗上的 Esc → 同上                                            ✅
 *   · **确定按钮 / 输入框回车** → `confirmBatchEdit()` → 只隐藏，**从不停用陷阱**  ❌
 *
 * 后果（不是崩溃，是状态泄漏）：`useFocusTrap` 内部 `active` 永远为 true，于是
 *   · `window` 上的 keydown 监听留到组件卸载才摘；
 *   · `lastFocusedEl` 一直不清（陷阱的"焦点归还"永远不执行）；
 *   · 同一实例再次 `open()` 时 `activate()` 因 `if (active) return` 直接空转 ——
 *     "首次打开之后，陷阱就再也不是被显式管理的状态了"。
 *
 * 这里用**桩掉 useFocusTrap** 的方式断言组件与协作者的契约：三条路径各调用一次 `deactivate`。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, defineComponent, h, nextTick, ref } from 'vue'

const trap = vi.hoisted(() => ({
  activate: vi.fn(),
  deactivate: vi.fn(),
  isActive: vi.fn(() => true),
}))
vi.mock('@/components/_internal/useFocusTrap', () => ({
  useFocusTrap: () => trap,
}))

import DataTableBatchDialog from '@/components/data/DataTableBatchDialog.vue'
import { provideDataTableContext } from '@/components/data/composables/context'

const COLS = [
  { key: 'city', title: '城市' },
  { key: 'status', title: '状态' },
]

interface DialogApi {
  open: () => void
  close: () => void
  show: { value: boolean }
}

/**
 * 注入最小上下文 + 渲染弹窗，并把组件暴露的 api 带出来。
 * 整个文件只定义一个内联组件（`vue/one-component-per-file`），用例靠参数区分。
 */
function mountDialog(selected: string[] = ['r1', 'r2']) {
  const selectedKeys = ref<string[]>(selected)
  const noteInputEl = ref<HTMLInputElement | null>(null)
  let api: DialogApi | null = null

  const Host = defineComponent({
    setup() {
      provideDataTableContext({
        visibleColumns: computed(() => COLS),
        selectedKeys,
        noteInputEl,
        setNoteInputEl: (el: unknown) => {
          noteInputEl.value = el as HTMLInputElement | null
        },
      } as never)
      return () =>
        h(DataTableBatchDialog, {
          selectable: true,
          ref: (r: unknown) => {
            api = r as DialogApi
          },
        })
    },
  })

  const w = mount(Host, { attachTo: document.body })
  return {
    w,
    get api(): DialogApi {
      return api!
    },
  }
}

beforeEach(() => {
  trap.activate.mockClear()
  trap.deactivate.mockClear()
})

describe('DataTableBatchDialog · 焦点陷阱的停用（#511）', () => {
  it('打开时激活陷阱（不是只设个布尔）', async () => {
    const { api } = mountDialog()
    api.open()
    await nextTick()
    expect(trap.activate).toHaveBeenCalledTimes(1)
  })

  it('取消按钮 → 停用陷阱', async () => {
    const { w, api } = mountDialog()
    api.open()
    await nextTick()
    await w.find('.dt-filter-btn-reset').trigger('click')
    expect(trap.deactivate).toHaveBeenCalledTimes(1)
  })

  it('**确定按钮 → 也必须停用陷阱**（主路径最常走，漏了就是永久泄漏）', async () => {
    const { w, api } = mountDialog()
    api.open()
    await nextTick()
    await w.find('.dt-filter-btn-apply').trigger('click')
    expect(trap.deactivate, '确定/回车是最常走的关闭路径，停用陷阱不能只写在取消分支里').toHaveBeenCalledTimes(1)
  })

  it('**输入框回车（= 确定）→ 也要停用陷阱**', async () => {
    const { w, api } = mountDialog()
    api.open()
    await nextTick()
    await w.find('input.note-editor-input').trigger('keydown', { key: 'Enter' })
    expect(trap.deactivate).toHaveBeenCalledTimes(1)
  })

  it('弹窗上的 Esc → 停用陷阱', async () => {
    const { w, api } = mountDialog()
    api.open()
    await nextTick()
    await w.find('.note-editor').trigger('keydown', { key: 'Escape' })
    expect(trap.deactivate).toHaveBeenCalledTimes(1)
  })

  it('没选中行时 open 无效（不该激活陷阱、也不该弹窗）', async () => {
    const { w, api } = mountDialog([])
    api.open()
    await nextTick()
    expect(trap.activate).not.toHaveBeenCalled()
    expect(w.find('.note-editor').exists()).toBe(false)
  })
})
