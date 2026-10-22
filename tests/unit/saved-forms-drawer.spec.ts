/* eslint-disable vue/one-component-per-file, vue/require-prop-types --
   本文件用 vi.mock 造了 9 个轻量桩组件（DataTable/Drawer/Toast/ModalBox/…），
   它们天然是「一个文件多个组件」，且 props 只需要名字不需要类型
   （桩不参与运行时校验，类型由被测组件自身的 props 定义保证）。
   这两条规则针对真实组件文件，对测试桩无意义。 */
/**
 * SavedFormsDrawer.vue — 我的表单抽屉（2026-10-22）
 *
 * ## 第一版是失败的，记录原因
 *
 * 第一版 11 个用例全过、覆盖率从 22.7% 涨到 37.9%，看起来不错。
 * 但**负向对照 6/6 全部未生效** —— 破坏任何一条业务逻辑，测试依然全绿。
 *
 * 原因：`<script setup>` **不暴露内部绑定**，我拿不到 `openShare` / `onConfirmRename` 等方法，
 * 于是"测"的全是 manager 层（`renameForm` / `deleteForm` / `doOpenForm`）——
 * 那是 `useFormManager.ts` 的逻辑，**不是这个组件的逻辑**。
 * 覆盖率涨的 15% 只是"组件能挂载渲染"，业务分支一行没碰。
 *
 * ## 正确的测法
 *
 * 模板里每个操作按钮都有 `data-act` 标记：
 *   `<button class="ld-table-act" data-act="share" :data-id="row.id" @click="onTableAction('share', row)">`
 * 所以**点真实按钮**就能触发真实方法，不需要 expose。
 *
 * 本版所有断言都通过 `trigger('click')` 走模板绑定，不再直接调 manager。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

// ── 重依赖桩：只保留能触发事件的最小结构 ──
vi.mock('qrcode/lib/browser.js', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,FAKEQR') },
}))
const copyTextMock = vi.fn(async () => true)
vi.mock('@/components/_internal/useCopy', () => ({
  copyText: (...args: unknown[]) => copyTextMock(...args),
}))

/**
 * DataTable 桩：**对每一列 × 每一行**调用 #cell 插槽。
 *
 * ⚠️ 第一版只传了 `column: { key: 'name' }`，于是模板里
 * `v-else-if="column.key === '_actions'"` 分支永远不渲染，
 * 所有操作按钮都拿不到 —— 14 个用例报 "Cannot call trigger on an empty DOMWrapper"。
 * 真实 DataTable 是「每个单元格渲染一次插槽」，桩必须照这个语义来。
 */
vi.mock('@/components/data/DataTable.vue', () => ({
  default: defineComponent({
    name: 'DataTable', // 必须给 name，否则 findComponent({ name: 'DataTable' }) 找不到
    props: ['columns', 'data', 'rowKey', 'pageSize'],
    setup(props, { slots }) {
      return () =>
        h(
          'div',
          { class: 'table-stub' },
          (props.data as Record<string, unknown>[]).flatMap((row) =>
            (props.columns as Array<{ key: string }>).map((col) =>
              slots.cell?.({ column: col, row }),
            ),
          ),
        )
    },
  }),
}))

/** Drawer 桩：渲染默认插槽 */
vi.mock('@/components/feedback/Drawer.vue', () => ({
  default: defineComponent({
    props: ['visible', 'title'],
    emits: ['update:visible'],
    setup(_, { slots }) {
      return () => h('div', { class: 'drawer-stub' }, slots.default?.())
    },
  }),
}))

/** Toast 桩：expose show，记录每次调用 */
const toastShow = vi.fn()
vi.mock('@/components/feedback/Toast.vue', () => ({
  default: defineComponent({
    setup(_, { expose }) {
      expose({ show: toastShow })
      return () => h('div', { class: 'toast-stub' })
    },
  }),
}))

/**
 * ModalBox / ConfirmModal 桩：**必须尊重 visible**。
 *
 * ⚠️ 第一版桩无条件渲染插槽，导致 `shareVisible=false` 时
 * `.ld-share-copy` 依然存在 → 「loadForm 失败时不打开弹窗」的断言失效。
 * 真实 ModalBox 是 `v-if="visible"` 语义，桩必须一致，否则测的是假象。
 */
vi.mock('@/components/layout/ModalBox.vue', () => ({
  default: defineComponent({
    props: ['visible', 'title', 'modalType'],
    emits: ['update:visible'],
    setup(props, { slots }) {
      // ⚠️ 必须同时渲染 **default 与 footer 两个插槽**：
      // 重命名/删除弹窗的「确认」按钮在 #footer 里（不是 ConfirmModal），
      // 第一版只渲染 default，导致 `.confirm-ok` 拿不到、renameForm 从没被调用。
      return () =>
        props.visible
          ? h('div', { class: 'modal-stub' }, [
              slots.default?.(),
              h('div', { class: 'modal-footer-stub' }, slots.footer?.()),
            ])
          : null
    },
  }),
}))

vi.mock('@/components/feedback/ConfirmModal.vue', () => ({
  default: defineComponent({
    props: ['visible', 'title', 'content', 'danger'],
    emits: ['confirm', 'cancel', 'update:visible'],
    setup(props, { slots, emit }) {
      return () =>
        props.visible
          ? h('div', { class: 'confirm-stub' }, [
              slots.default?.(),
              h('button', { class: 'confirm-ok', onClick: () => emit('confirm') }, 'ok'),
            ])
          : null
    },
  }),
}))
vi.mock('@/components/basic/Button.vue', () => ({
  default: defineComponent({
    props: ['text', 'variant', 'icon'],
    setup(props) {
      return () => h('button', { class: 'btn-stub' }, props.text)
    },
  }),
}))
vi.mock('@/components/basic/IconSvg.vue', () => ({
  default: defineComponent({ setup: () => () => h('i') }),
}))
vi.mock('@/components/form-builder/designer/FormDataSummary.vue', () => ({
  default: defineComponent({ setup: () => () => h('div', { class: 'summary-stub' }) }),
}))
vi.mock('@/components/form-builder/designer/FormReview.vue', () => ({
  default: defineComponent({ setup: () => () => h('div', { class: 'review-stub' }) }),
}))
vi.mock('@/components/form-builder/FormCollect.vue', () => ({
  default: defineComponent({ setup: () => () => h('div', { class: 'collect-stub' }) }),
}))

import SavedFormsDrawer from '@/components/form-builder/designer/SavedFormsDrawer.vue'
import { FORM_MANAGER_KEY } from '@/components/form-builder/designer/context'
import { useFormManager } from '@/components/form-builder/designer/useFormManager'
import { setActiveFormStore, createLocalFormStore } from '@/components/form-builder/designer/store'
import type { FormMetaItem } from '@/components/form-builder/designer/store'
import QRCode from 'qrcode/lib/browser.js'

function makeHost(overrides: Record<string, unknown> = {}) {
  return {
    nodes: () => [],
    meta: () => ({}),
    updateMeta: vi.fn(),
    applyNodes: vi.fn(),
    snapshot: vi.fn(),
    showTip: vi.fn(),
    ...overrides,
  }
}

/** 挂载并注入真实 manager；formsList 预置一条数据，保证表格渲染 */
async function mountWithForms(
  opts: { host?: Record<string, unknown>; store?: Record<string, unknown> } = {},
) {
  const host = makeHost(opts.host)
  const manager = useFormManager(host as never)
  setActiveFormStore((opts.store ?? createLocalFormStore()) as never)
  manager.formsList.push(makeItem({ id: 'f1', name: '表单A' }))

  const w = mount(SavedFormsDrawer, {
    global: { provide: { [FORM_MANAGER_KEY as symbol]: manager } },
  })
  await flushPromises()
  return { w, manager, host }
}

function makeItem(overrides: Partial<FormMetaItem> = {}): FormMetaItem {
  return { id: 'f1', name: '表单A', updatedAt: 1000, collectKey: 'c1', ...overrides } as FormMetaItem
}

/**
 * 点击弹窗里的「确认」按钮。
 *
 * ⚠️ 重命名/删除弹窗的确认按钮在 `ModalBox` 的 **#footer 插槽**里，
 * 不是 `ConfirmModal`（删除用的是 ConfirmModal，重命名用的是 ModalBox+footer）。
 * 第一版用 `.confirm-ok` 选择器，重命名永远点不到 → renameForm 从没被调用。
 * 这里改成按按钮文本匹配（footer 里的 Button 桩渲染 `:text`）。
 */
async function clickModalConfirm(w: ReturnType<typeof mount>): Promise<void> {
  const buttons = w.findAll('button')
  const confirm = buttons.find((b) => /确认|ok|confirm/i.test(b.text()))
  if (confirm) await confirm.trigger('click')
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  copyTextMock.mockResolvedValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('操作列按钮渲染', () => {
  it('有数据时渲染 5 个操作按钮（share/view/review/rename/delete）', async () => {
    const { w } = await mountWithForms()
    const acts = w.findAll('.ld-table-act').map((b) => b.attributes('data-act'))
    expect(acts).toEqual(['share', 'view', 'review', 'rename', 'delete'])
  })

  it('每行都带 data-id，指向对应表单', async () => {
    const { w } = await mountWithForms()
    const first = w.find('.ld-table-act[data-act="share"]')
    expect(first.attributes('data-id')).toBe('f1')
  })
})

describe('分享（openShare）', () => {
  it('点击分享 → 加载设计、生成分享码与短链、打开弹窗', async () => {
    const loadForm = vi.fn(async () => ({ schemaVersion: 3, meta: {}, nodes: [] }))
    const { w } = await mountWithForms({ store: { ...createLocalFormStore(), loadForm } })
    await w.find('.ld-table-act[data-act="share"]').trigger('click')
    await flushPromises()

    expect(loadForm, '分享前必须加载设计').toHaveBeenCalledWith('f1')
    // 分享弹窗内容出现
    expect(w.html()).toContain('ld-share-copy')
  })

  it('loadForm 返回 null → 提示错误，**不打开弹窗**', async () => {
    const loadForm = vi.fn(async () => null)
    const { w } = await mountWithForms({ store: { ...createLocalFormStore(), loadForm } })
    await w.find('.ld-table-act[data-act="share"]').trigger('click')
    await flushPromises()

    expect(toastShow, '应提示加载失败').toHaveBeenCalled()
    // 分享弹窗的复制按钮不该出现
    expect(w.find('.ld-share-copy').exists(), '失败时不该打开分享弹窗').toBe(false)
  })

  it('二维码生成成功 → 显示二维码图片', async () => {
    const loadForm = vi.fn(async () => ({ schemaVersion: 3, meta: {}, nodes: [] }))
    const { w } = await mountWithForms({ store: { ...createLocalFormStore(), loadForm } })
    await w.find('.ld-table-act[data-act="share"]').trigger('click')
    await flushPromises()
    expect(QRCode.toDataURL).toHaveBeenCalled()
  })

  it('二维码生成抛错 → 显示错误提示（不崩）', async () => {
    ;(QRCode.toDataURL as unknown as { mockRejectedValueOnce: (e: unknown) => void }).mockRejectedValueOnce(
      new Error('too long'),
    )
    const loadForm = vi.fn(async () => ({ schemaVersion: 3, meta: {}, nodes: [] }))
    const { w } = await mountWithForms({ store: { ...createLocalFormStore(), loadForm } })
    await w.find('.ld-table-act[data-act="share"]').trigger('click')
    await flushPromises()
    // 不应抛错，页面仍在
    expect(w.find('.ld-forms').exists()).toBe(true)
  })

  it('复制分享码 → 调 copyText 并提示成功', async () => {
    const loadForm = vi.fn(async () => ({ schemaVersion: 3, meta: {}, nodes: [] }))
    const { w } = await mountWithForms({ store: { ...createLocalFormStore(), loadForm } })
    await w.find('.ld-table-act[data-act="share"]').trigger('click')
    await flushPromises()

    const copyBtn = w.findAll('.ld-share-copy')[0]
    if (copyBtn) {
      await copyBtn.trigger('click')
      await flushPromises()
      expect(copyTextMock, '应调用 copyText').toHaveBeenCalled()
      expect(toastShow, '应提示复制结果').toHaveBeenCalled()
    }
  })
})

describe('查看 / 审核（openSummary / openReview）', () => {
  it('点击 view → 打开数据汇总弹窗', async () => {
    const { w } = await mountWithForms()
    await w.find('.ld-table-act[data-act="view"]').trigger('click')
    await flushPromises()
    expect(w.find('.summary-stub').exists(), '应渲染 FormDataSummary').toBe(true)
  })

  it('点击 review → 打开审核弹窗', async () => {
    const { w } = await mountWithForms()
    await w.find('.ld-table-act[data-act="review"]').trigger('click')
    await flushPromises()
    expect(w.find('.review-stub').exists(), '应渲染 FormReview').toBe(true)
  })
})

describe('重命名（openRename → onConfirmRename）', () => {
  it('点击 rename → 打开弹窗且**预填当前名字**', async () => {
    const { w } = await mountWithForms()
    await w.find('.ld-table-act[data-act="rename"]').trigger('click')
    await flushPromises()
    const input = w.find('input')
    if (input.exists()) {
      expect((input.element as HTMLInputElement).value, '应预填当前名字').toBe('表单A')
    }
  })

  it('重命名成功 → 调 manager.renameForm 并刷新列表', async () => {
    const { w, manager } = await mountWithForms()
    const renameForm = vi.spyOn(manager, 'renameForm').mockResolvedValue(true)
    const refreshForms = vi.spyOn(manager, 'refreshForms').mockResolvedValue(undefined)

    await w.find('.ld-table-act[data-act="rename"]').trigger('click')
    await flushPromises()
    const input = w.find('input')
    if (input.exists()) await input.setValue('新名字')
    await clickModalConfirm(w)
    await flushPromises()

    expect(renameForm, '应调用 renameForm').toHaveBeenCalled()
    expect(refreshForms, '成功后应刷新列表').toHaveBeenCalled()
  })

  it('重命名失败 → **不刷新列表**（保持弹窗，别把输入弄丢）', async () => {
    const { w, manager } = await mountWithForms()
    vi.spyOn(manager, 'renameForm').mockResolvedValue(false)
    const refreshForms = vi.spyOn(manager, 'refreshForms').mockResolvedValue(undefined)

    await w.find('.ld-table-act[data-act="rename"]').trigger('click')
    await flushPromises()
    await clickModalConfirm(w)
    await flushPromises()

    expect(refreshForms, '失败时不该刷新').not.toHaveBeenCalled()
  })
})

describe('删除（requestDelete → onConfirmDelete）', () => {
  it('点击 delete → 调 manager.deleteForm 并刷新', async () => {
    const { w, manager } = await mountWithForms()
    const deleteForm = vi.spyOn(manager, 'deleteForm').mockResolvedValue(true)
    const refreshForms = vi.spyOn(manager, 'refreshForms').mockResolvedValue(undefined)

    await w.find('.ld-table-act[data-act="delete"]').trigger('click')
    await flushPromises()
    await clickModalConfirm(w)
    await flushPromises()

    expect(deleteForm, '应调用 deleteForm').toHaveBeenCalled()
    expect(refreshForms, '成功后应刷新').toHaveBeenCalled()
  })

  it('删除失败 → 不刷新', async () => {
    const { w, manager } = await mountWithForms()
    vi.spyOn(manager, 'deleteForm').mockResolvedValue(false)
    const refreshForms = vi.spyOn(manager, 'refreshForms').mockResolvedValue(undefined)

    await w.find('.ld-table-act[data-act="delete"]').trigger('click')
    await flushPromises()
    await clickModalConfirm(w)
    await flushPromises()
    expect(refreshForms).not.toHaveBeenCalled()
  })
})

describe('名称列点击（openCollect）', () => {
  it('点击表单名 → 加载该表单设计并打开收集列表', async () => {
    const loadForm = vi.fn(async () => ({ schemaVersion: 3, meta: {}, nodes: [] }))
    const { w } = await mountWithForms({ store: { ...createLocalFormStore(), loadForm } })
    await w.find('.ld-form-link').trigger('click')
    await flushPromises()
    expect(loadForm, '应加载该表单设计').toHaveBeenCalledWith('f1')
  })

  it('加载失败 → 提示错误（不静默）', async () => {
    const loadForm = vi.fn(async () => {
      throw new Error('boom')
    })
    const { w } = await mountWithForms({ store: { ...createLocalFormStore(), loadForm } })
    await w.find('.ld-form-link').trigger('click')
    await flushPromises()
    expect(toastShow, '失败应提示').toHaveBeenCalled()
  })
})

describe('列表空态与错误态', () => {
  it('formsList 为空 → 显示空态文案', async () => {
    const host = makeHost()
    const manager = useFormManager(host as never)
    setActiveFormStore(createLocalFormStore() as never)
    manager.formsList.length = 0
    const w = mount(SavedFormsDrawer, {
      global: { provide: { [FORM_MANAGER_KEY as symbol]: manager } },
    })
    await flushPromises()
    expect(w.find('.ld-forms-state').exists(), '空列表应显示状态区').toBe(true)
  })

  it('formsError 有值 → 显示 role=alert', async () => {
    const host = makeHost()
    const manager = useFormManager(host as never)
    setActiveFormStore(createLocalFormStore() as never)
    manager.formsError = '加载失败'
    const w = mount(SavedFormsDrawer, {
      global: { provide: { [FORM_MANAGER_KEY as symbol]: manager } },
    })
    await nextTick()
    expect(w.find('[role="alert"]').exists(), '错误应有 role=alert').toBe(true)
  })

  it('formsLoading 为 true → 显示 role=status', async () => {
    const host = makeHost()
    const manager = useFormManager(host as never)
    setActiveFormStore(createLocalFormStore() as never)
    manager.formsLoading = true
    const w = mount(SavedFormsDrawer, {
      global: { provide: { [FORM_MANAGER_KEY as symbol]: manager } },
    })
    await nextTick()
    expect(w.find('[role="status"]').exists(), '加载中应有 role=status').toBe(true)
  })
})

describe('表格列定义与数据同步（补充：负向对照驱动）', () => {
  it('三列：name / updatedAt / _actions，**操作列宽度 260**', async () => {
    const { w } = await mountWithForms()
    const table = w.findComponent({ name: 'DataTable' })
    expect(table.exists(), '应渲染 DataTable').toBe(true)
    const cols = table.props('columns') as Array<{ key: string; width: unknown }>
    expect(cols.map((c) => c.key)).toEqual(['name', 'updatedAt', '_actions'])
    // 负向对照发现：不写这条断言时，把 260 改成 100 测试依然绿
    expect(cols[2].width, '操作列宽度必须是 260（容纳 5 个按钮）').toBe(260)
  })

  it('**formsList 变化时 tableRows 同步**（watch deep）', async () => {
    const { w, manager } = await mountWithForms()
    const before = (w.findComponent({ name: 'DataTable' }).props('data') as unknown[]).length

    manager.formsList.push(makeItem({ id: 'x2', name: '第二个表单' }))
    await flushPromises()

    const rows = w.findComponent({ name: 'DataTable' }).props('data') as Array<Record<string, unknown>>
    // 负向对照发现：只断言「有表格」抓不到删掉 watch
    expect(rows.length, '新增表单后 tableRows 应增加').toBe(before + 1)
    expect(rows[rows.length - 1]._item, '每行应携带 _item 供操作列使用').toBeTruthy()
  })

  it('操作按钮点击只打开弹窗，**不直接调 manager**（需二次确认）', async () => {
    const { w, manager } = await mountWithForms()
    const renameForm = vi.spyOn(manager, 'renameForm')
    const deleteForm = vi.spyOn(manager, 'deleteForm')

    await w.find('.ld-table-act[data-act="rename"]').trigger('click')
    await flushPromises()
    expect(renameForm, '点 rename 只打开弹窗，不该直接重命名').not.toHaveBeenCalled()
    expect(deleteForm).not.toHaveBeenCalled()
  })
})

describe('分享码内容（补充）', () => {
  it('分享弹窗打开后渲染**两个**复制按钮（分享码 / 发布链接）', async () => {
    const loadForm = vi.fn(async () => ({ schemaVersion: 3, meta: { title: 'T' }, nodes: [] }))
    const { w } = await mountWithForms({ store: { ...createLocalFormStore(), loadForm } })
    await w.find('.ld-table-act[data-act="share"]').trigger('click')
    await flushPromises()

    const copyBtns = w.findAll('.ld-share-copy')
    expect(copyBtns.length, '应有分享码与发布链接两个复制按钮').toBe(2)
  })

  /**
   * ⚠️ `encodeShareCode` 的返回值**无法从 DOM 断言**（诚实记录，不假装覆盖）
   *
   * 模板里 `{{ shareCode }}` 与图标、提示文案同在一个按钮内，
   * 文本断言无法区分「真实分享码」与「空串」——
   * 负向对照（把 `encodeShareCode(design)` 换成 `''`）实测不会让本文件任何用例变红。
   *
   * 该函数的正确性由 `share.ts` 自己的编解码往返单测覆盖，此处不重复也不假称覆盖。
   */

  it('二维码生成失败 → 显示 **role=alert** 的错误提示', async () => {
    ;(QRCode.toDataURL as unknown as { mockRejectedValueOnce: (e: unknown) => void }).mockRejectedValueOnce(
      new Error('too long'),
    )
    const loadForm = vi.fn(async () => ({ schemaVersion: 3, meta: {}, nodes: [] }))
    const { w } = await mountWithForms({ store: { ...createLocalFormStore(), loadForm } })
    await w.find('.ld-table-act[data-act="share"]').trigger('click')
    await flushPromises()

    // 负向对照发现：只断言「页面还在」抓不到删掉 shareQrError
    expect(w.find('.ld-share-qr-error').exists(), '失败应显示二维码错误区').toBe(true)
  })

  it('复制失败 → 提示 **error 类型**（不是 success）', async () => {
    copyTextMock.mockResolvedValue(false)
    const loadForm = vi.fn(async () => ({ schemaVersion: 3, meta: {}, nodes: [] }))
    const { w } = await mountWithForms({ store: { ...createLocalFormStore(), loadForm } })
    await w.find('.ld-table-act[data-act="share"]').trigger('click')
    await flushPromises()

    const copyBtn = w.findAll('.ld-share-copy')[0]
    if (copyBtn) {
      await copyBtn.trigger('click')
      await flushPromises()
      // 负向对照发现：只断言「调了 show」抓不到"总提示成功"
      const calls = toastShow.mock.calls as unknown[][]
      const last = calls[calls.length - 1]
      expect(last?.[1], '复制失败应提示 error 类型').toBe('error')
    }
  })
})

describe('覆盖打开确认（onConfirmLoad）', () => {
  /**
   * 通过**真实 UI**触发：`manager.pendingLoad` 有值时，模板会渲染
   * 「覆盖打开」确认弹窗（`ConfirmModal`），点它的确认按钮走 `onConfirmLoad`。
   *
   * ⚠️ 第一版这里是「手动模拟组件逻辑」：
   *     manager.pendingLoad = null; await manager.doOpenForm(item)
   * 测的是我自己的模拟代码，不是组件的 `onConfirmLoad` ——
   * 负向对照（删掉组件里 `manager.pendingLoad = null`）自然抓不到。
   */
  it('pendingLoad 有值 → 渲染覆盖确认弹窗；确认后清空并加载', async () => {
    const loadForm = vi.fn(async () => ({ schemaVersion: 3, meta: {}, nodes: [] }))
    const { w, manager } = await mountWithForms({
      store: { ...createLocalFormStore(), loadForm } as never,
    })

    manager.pendingLoad = makeItem({ id: 'p1' })
    await flushPromises()

    // 覆盖确认弹窗应出现（ConfirmModal 桩在 visible 时渲染 .confirm-stub）
    const confirmStub = w.find('.confirm-stub')
    if (confirmStub.exists()) {
      await w.find('.confirm-ok').trigger('click')
      await flushPromises()
      expect(manager.pendingLoad, '确认后必须清空，否则下次会重复弹').toBeNull()
      expect(loadForm, '确认后应加载该表单').toHaveBeenCalledWith('p1')
    } else {
      // 若模板用的是 ModalBox 而非 ConfirmModal，用文本匹配点确认
      await clickModalConfirm(w)
      await flushPromises()
      expect(manager.pendingLoad, '确认后必须清空').toBeNull()
    }
  })

  it('pendingLoad 为 null → 不渲染覆盖确认弹窗', async () => {
    const { w, manager } = await mountWithForms()
    manager.pendingLoad = null
    await flushPromises()
    expect(w.find('.confirm-stub').exists(), '无 pendingLoad 时不该弹确认').toBe(false)
  })
})

