/**
 * 表格页脚分页的语义对齐（第 140 轮）。
 *
 * 库里有**两套分页**：公开组件 `nav/Pagination.vue` 与 `data/DataTablePagination.vue`（表格页脚）。
 * 前者是标准写法（`<nav aria-label>` + `type="button"` + `aria-current="page"` + 省略号 `aria-hidden`），
 * 后者四样全缺。其中 `type="button"` 缺失是**功能缺陷**而不只是无障碍问题：
 * `<button>` 默认 `type` 是 `submit`，宿主把 `<DataTable>` 放进自己的 `<form>`（后台 CRUD 常见写法）时，
 * **点一下页码就把表单提交了**。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DataTable from '@/components/data/DataTable.vue'

const COLUMNS = [{ key: 'name', label: '名称', title: '名称' }]
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: 'r' + i, name: '行' + i }))

const MINIMAL = {
  columns: COLUMNS,
  rowKey: 'id',
  virtualScroll: false,
}

/**
 * 把 DataTable 挂到**真实 DOM 的 <form> 里**：这才是宿主页面的真实形态
 * （后台 CRUD 常把表格放进表单）。用 attachTo 而不是自定义宿主组件，
 * 好处是按钮真正处于 form 的提交语义下，且不必在用例里再定义组件。
 */
function mountInsideForm(rowCount = 5) {
  const form = document.createElement('form')
  const counter = { submits: 0 }
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    counter.submits++
  })
  document.body.appendChild(form)
  const w = mount(DataTable, {
    attachTo: form,
    props: { ...MINIMAL, data: rows(rowCount), pageSize: 2 },
  })
  return { w, submits: counter }
}

describe('页脚分页 · 在宿主表单里不该提交表单', () => {
  it('**点「下一页」不触发表单提交**（type="button"）', async () => {
    const { w, submits } = mountInsideForm()
    const pager = w.find('.table-pagination')
    expect(pager.exists(), '先要有分页脚注').toBe(true)
    const next = pager.findAll('.page-btn').at(-1)!
    await next.trigger('click')
    await nextTick()
    expect(submits.submits, '点页码把宿主表单提交了').toBe(0)
    w.unmount()
  })

  it('**点页码数字也不触发表单提交**', async () => {
    const { w, submits } = mountInsideForm()
    const pager = w.find('.table-pagination')
    const page2 = pager.findAll('.page-btn').find((b) => b.text() === '2')
    expect(page2, '应有第 2 页按钮').toBeTruthy()
    await page2!.trigger('click')
    await nextTick()
    expect(submits.submits).toBe(0)
    w.unmount()
  })

  it('三个按钮都显式带 type="button"', () => {
    const { w } = mountInsideForm()
    const btns = w.find('.table-pagination').findAll('button')
    expect(btns.length).toBeGreaterThanOrEqual(3)
    for (const b of btns) {
      expect(b.attributes('type'), `按钮缺 type="button"：${b.html().slice(0, 60)}`).toBe('button')
    }
    w.unmount()
  })
})

describe('页脚分页 · 无障碍语义对齐 nav/Pagination', () => {
  it('容器是导航地标且带 aria-label', () => {
    const { w } = mountInsideForm()
    const pager = w.find('.table-pagination')
    expect(pager.element.tagName, '应与 nav/Pagination 一样是 nav').toBe('NAV')
    const label = pager.attributes('aria-label')
    expect(label, '导航地标必须有可读名字').toBeTruthy()
    expect(String(label).length).toBeGreaterThan(0)
    w.unmount()
  })

  it('**当前页带 aria-current="page"**，其它页不带', async () => {
    const { w } = mountInsideForm()
    const pager = w.find('.table-pagination')
    const pageBtns = pager.findAll('.page-btn').filter((b) => /^\d+$/.test(b.text()))
    expect(pageBtns.length).toBe(3)
    expect(pageBtns[0].attributes('aria-current'), '第 1 页应标记当前').toBe('page')
    expect(pageBtns[1].attributes('aria-current')).toBeUndefined()
    expect(pageBtns[2].attributes('aria-current')).toBeUndefined()

    // 翻到第 2 页后标记跟着走
    await pageBtns[1].trigger('click')
    await nextTick()
    const after = w.find('.table-pagination').findAll('.page-btn').filter((b) => /^\d+$/.test(b.text()))
    expect(after[0].attributes('aria-current'), '离开的页不该继续标记').toBeUndefined()
    expect(after[1].attributes('aria-current'), '新页应标记当前').toBe('page')
    w.unmount()
  })

  it('**省略号是纯装饰**：aria-hidden，且读屏不会把它当页码', () => {
    const { w } = mountInsideForm(40) // 40 行 / 每页 2 = 20 页 → 必然出现省略号
    const pager = w.find('.table-pagination')
    const ellipsis = pager.findAll('.page-ellipsis')
    expect(ellipsis.length, '20 页应出现省略号').toBeGreaterThan(0)
    for (const e of ellipsis) {
      expect(e.attributes('aria-hidden')).toBe('true')
    }
    w.unmount()
  })

  it('前后翻页按钮有可读名字（无障碍名称非空）', () => {
    const { w } = mountInsideForm()
    const pager = w.find('.table-pagination')
    const btns = pager.findAll('.page-btn')
    const prev = btns[0]
    const next = btns.at(-1)!
    expect(prev.attributes('aria-label')).toBeTruthy()
    expect(next.attributes('aria-label')).toBeTruthy()
    w.unmount()
  })
})

describe('页脚分页 · 渲染条件没被改坏', () => {
  it('只有一页时不渲染', () => {
    const { w } = mountInsideForm(2)
    expect(w.find('.table-pagination').exists()).toBe(false)
    w.unmount()
  })

  it('pageSize=0 时不渲染（避免除零页）', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const w = mount(DataTable, {
      attachTo: host,
      props: { ...MINIMAL, data: rows(5), pageSize: 0 },
    })
    expect(w.find('.table-pagination').exists()).toBe(false)
    w.unmount()
    host.remove()
  })
})
