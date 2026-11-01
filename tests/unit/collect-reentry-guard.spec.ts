/* eslint-disable vue/one-component-per-file -- 测试夹具：宿主组件只为挂载 composable */
/**
 * 导入确认 / 导出的重入守卫（#313）
 *
 * ## 缺陷
 *
 * `confirmImport` 与 `exportExcel` 都只在开始时把 `importing/exporting` 置 true，
 * **没有入口守卫**。按钮上的 `:loading` 只是**界面层**的保护（#287/#299 已证明：
 * 界面层挡不住程序化触发，也挡不住快速连点落在 loading 生效前）。
 *
 * 后果：
 *   · 确认导入连点两次 → 同一批记录**再写一遍**（8 条变 16 条，用户以为自己只导入一次）
 *   · 导出连点两次 → **两次下载**（浏览器可能弹两个文件，或第二次静默失败）
 *
 * ## 判据
 *
 * 用"可控慢 store / 可控慢加载器"让第一次调用挂起，第二次必须被守卫挡掉。
 * 导出的重入窗口正好在 `await import(xlsx)` 那一段 —— 直接 mock 动态 import 时
 * 模块会被缓存，第二次调用不会真正重跑（实测负向对照变绿），所以把加载器做成
 * 可注入的 `loadXlsx`，让"加载中"变成手动放行的 Promise（#312 的教训：不要 sleep 赌时序）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref, nextTick } from 'vue'
import { useCollectImport } from '@/components/form-builder/useCollectImport'
import { useCollectExport } from '@/components/form-builder/useCollectExport'

const fields = [{ id: 'n1', key: 'name', type: 'text', label: '姓名' }] as never[]

type Rec = { id: string; time: string; data: Record<string, unknown> }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('确认导入 · 连点只导一次', () => {
  /** 极小宿主：直接暴露 composable，避免依赖 FormCollect 内部状态赋值 */
  function mountImportHost(appendRecord: (k: string, r: Rec) => Promise<void>) {
    let api: ReturnType<typeof useCollectImport> | null = null
    const Host = defineComponent({
      setup() {
        api = useCollectImport({
          fields: () => fields,
          storageKey: () => 'k',
          records: ref([]) as never,
          appendRecord,
          genRecordId: () => 'id-' + Math.random().toString(36).slice(2),
          refreshRecords: () => {},
          okMsgTtlMs: 1000,
          onOk: () => {},
          formatValue: (v: unknown) => String(v),
        } as never)
        return () => h('div')
      },
    })
    const w = mount(Host)
    return { w, api: api as unknown as ReturnType<typeof useCollectImport> }
  }

  it('**第一次挂起期间再点 → 记录不会被写两遍**', async () => {
    const written: string[] = []
    const pending: (() => void)[] = []
    const appendRecord = vi.fn(
      (_k: string, rec: Rec) =>
        new Promise<void>((resolve) => {
          pending.push(() => {
            written.push(rec.data.name as string)
            resolve()
          })
        }),
    )
    const { w, api } = mountImportHost(appendRecord)
    await nextTick()

    // 预览里存的是**归一化后的原始数据**（confirmImport 会包成 { id, time, data } 再写入）
    api.importPreview.value = [{ name: '张三' }, { name: '李四' }] as never
    await nextTick()

    void api.confirmImport()
    await nextTick()
    // 逐条 await 写入：此刻只发出了第 1 条
    expect(appendRecord, '第一次确认应已开始写入').toHaveBeenCalledTimes(1)

    // 挂起期间连点两次（重入点就在这里）
    void api.confirmImport()
    void api.confirmImport()
    await nextTick()
    expect(appendRecord, '重入没挡住 → 会继续写第 2、3… 条').toHaveBeenCalledTimes(1)

    // 逐条放行，直到两条都写完
    for (let i = 0; i < 10 && written.length < 2; i++) {
      while (pending.length) pending.shift()!()
      await flushPromises()
    }
    expect(appendRecord, '最终只应有 2 次写入（不是 4 次）').toHaveBeenCalledTimes(2)
    expect(written).toEqual(['张三', '李四'])
    w.unmount()
  })
})

describe('导出 Excel · 连点只下一次', () => {
  it('**第一次加载中再点 → 只写一次文件；结束后能再导出**', async () => {
    const writeFile = vi.fn()
    const fakeXlsx = {
      utils: {
        json_to_sheet: () => ({}),
        book_new: () => ({ sheets: [] }),
        book_append_sheet: () => {},
        encode_cell: (a: { c: number; r: number }) => `C${a.c}R${a.r}`,
      },
      writeFile,
    }
    // 可控加载器：把"动态 import 的那段时间"变成手动放行的 Promise
    const pending: (() => void)[] = []
    const loadXlsx = () =>
      new Promise<typeof fakeXlsx>((resolve) => pending.push(() => resolve(fakeXlsx)))

    const records = ref([{ id: 'r1', time: '2026-08-23 14:30:00', data: { name: '张三' } }])
    let api: ReturnType<typeof useCollectExport> | null = null
    const Host = defineComponent({
      setup() {
        api = useCollectExport({
          records: records as never,
          meta: () => ({ title: '表单' }),
          fields: () => fields,
          okMsgTtlMs: 1000,
          onError: () => {},
          onOk: () => {},
          loadXlsx,
        } as never)
        return () => h('div')
      },
    })
    const w = mount(Host)
    await nextTick()

    void api!.exportExcel()
    await nextTick()
    expect(pending.length, '第一次应停在加载器上').toBe(1)

    // 加载中连点两次
    void api!.exportExcel()
    void api!.exportExcel()
    await nextTick()
    expect(pending.length, '重入没挡住 → 会再排两次加载').toBe(1)

    while (pending.length) pending.shift()!()
    await flushPromises()
    expect(writeFile, '导出应真的执行过（否则用例是假绿）').toHaveBeenCalledTimes(1)

    // 结束后必须解锁：再点一次应真的重新开始（否则用户第二次导出永远没反应）
    void api!.exportExcel()
    await nextTick()
    expect(pending.length, '结束后未复位 exporting → 第二次导出被自己挡住').toBe(1)
    while (pending.length) pending.shift()!()
    await flushPromises()
    expect(writeFile, '第二次导出也应真的写文件').toHaveBeenCalledTimes(2)
    w.unmount()
  })
})