/**
 * useFormManager — 表单管理编排（2026-10-23）
 *
 * ## 为什么补
 *
 * 342 行、覆盖率仅 25.2%，是 form-builder 域拉低最大的文件。
 * 只有 saved-forms-drawer.spec 间接用过它（经组件），
 * 保存/打开/重命名/删除/分享码/存储切换的分支完全没测。
 *
 * ## 测法
 *
 * 纯 composable，直接调 useFormManager(host) 拿 manager 对象。
 * 通过 `host.injectedStore` 注入内存 store，隔离 localStorage 与云端。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'

/* ═══════════ 依赖 mock ═══════════ */

const h = vi.hoisted(() => ({
  /** 当前注入 store 的行为开关 */
  failSave: false,
  failList: false,
  failRename: false,
  failDelete: false,
  /** loadForm 返回值：null = 表单不存在 */
  loadFormResult: null as unknown,
  /** 记录 saveForm 的入参 */
  savedArgs: [] as unknown[],
  /** 新建时的自增序号：真实存储层每次新建都给新 id，"恒 new-1"会让身份类断言失真 */
  newSeq: 0,
  /** validateSupabaseConfig 返回值 */
  cfgInvalid: '' as string,
  /** createCloudFormStore 是否抛错 */
  cloudThrow: false,
  /** listForms 抛错（testCloud 用） */
  cloudListFail: false,
  /** 活动签名者 */
  signer: null as null | { id: string },
  /** signShareCodeWith 返回值 */
  signedResult: '' as string,
  /** encodeShareCode 返回值 */
  encoded: 'FD1xxxx',
}))

vi.mock('@/components/storage/supabase-transport', () => ({
  validateSupabaseConfig: vi.fn(() => h.cfgInvalid),
}))

vi.mock('@/components/form-builder/designer/store', () => {
  const mem: { forms: Map<string, unknown> } = { forms: new Map() }
  const store = {
    listForms: vi.fn(async () => {
      if (h.failList) throw new Error('list boom')
      return [...mem.forms.values()]
    }),
    loadForm: vi.fn(async () => h.loadFormResult),
    saveForm: vi.fn(async (id: string | null, design: unknown, name?: string) => {
      if (h.failSave) throw new Error('save boom')
      h.savedArgs.push({ id, design, name })
      h.newSeq += 1
      const item = {
        id: id ?? `new-${h.newSeq}`,
        name: name || '未命名',
        updatedAt: '2026-01-01',
        collectKey: 'k',
      }
      mem.forms.set(item.id, item)
      return item
    }),
    renameForm: vi.fn(async () => {
      if (h.failRename) throw new Error('rename boom')
    }),
    deleteForm: vi.fn(async () => {
      if (h.failDelete) throw new Error('delete boom')
    }),
    loadRecords: vi.fn(async () => []),
    appendRecord: vi.fn(async () => {}),
    removeRecord: vi.fn(async () => {}),
    clearRecords: vi.fn(async () => {}),
  }
  const cloudStore = {
    ...store,
    listForms: vi.fn(async () => {
      if (h.cloudListFail) throw new Error('cloud unreachable')
      return []
    }),
  }
  return {
    /** 测试用：清空 mock 的内存表单索引（模块级共享，会跨用例残留） */
    __mem: mem,
    createLocalFormStore: vi.fn(() => store),
    createCloudFormStore: vi.fn(() => {
      if (h.cloudThrow) throw new Error('cloud create boom')
      return cloudStore
    }),
    getActiveFormStore: vi.fn(() => store),
    setActiveFormStore: vi.fn(() => {}),
    loadStoreMode: vi.fn(() => 'local' as const),
    saveStoreMode: vi.fn(() => {}),
    loadCloudConfig: vi.fn(() => null),
    saveCloudConfig: vi.fn(() => {}),
    envCloudConfig: vi.fn(() => null),
    /** 测试用：拿注入的那个 store 断言调用 */
    __store: store,
    __cloudStore: cloudStore,
  }
})

vi.mock('@/components/form-builder/designer/share', () => ({
  encodeShareCode: vi.fn(() => h.encoded),
  signShareCodeWith: vi.fn(async () => h.signedResult),
}))

vi.mock('@/components/form-builder/designer/share-signer', () => ({
  getActiveShareSigner: vi.fn(() => h.signer),
}))

import { useFormManager, type FormManagerHost } from '@/components/form-builder/designer/useFormManager'
import type { DesignerNode, FormMeta, FormMetaItem } from '@/components/form-builder/designer/types'

/* ═══════════ 夹具 ═══════════ */

const node = (id: string): DesignerNode => ({ id, type: 'text', label: id }) as unknown as DesignerNode

/** 造 host：默认画布 1 个节点、标题「测试表单」 */
function makeHost(over: Partial<FormManagerHost> & { nodesCount?: number } = {}) {
  const tips: string[] = []
  let nodesArr = Array.from({ length: over.nodesCount ?? 1 }, (_, i) => node(`n${i}`))
  const metaRef: { v: FormMeta } = { v: { title: '测试表单' } as FormMeta }
  const calls = {
    snapshot: 0,
    applyNodes: [] as DesignerNode[][],
    updateMeta: [] as FormMeta[],
    onSaved: [] as FormMetaItem[],
    onFormOpened: 0,
  }
  const host: FormManagerHost = {
    nodes: () => nodesArr,
    meta: () => metaRef.v,
    updateMeta: (m) => {
      metaRef.v = m
      calls.updateMeta.push(m)
    },
    applyNodes: (n) => {
      nodesArr = n
      calls.applyNodes.push(n)
    },
    snapshot: () => {
      calls.snapshot++
    },
    showTip: (msg) => tips.push(msg),
    onSaved: (item) => calls.onSaved.push(item),
    onFormOpened: () => {
      calls.onFormOpened++
    },
    ...over,
  }
  return { host, tips, calls, setNodes: (n: DesignerNode[]) => (nodesArr = n), getMeta: () => metaRef.v }
}

const item = (id: string, name = '表单A'): FormMetaItem =>
  ({ id, name, updatedAt: '2026-01-01', collectKey: 'k' }) as unknown as FormMetaItem

beforeEach(async () => {
  // 第 147 轮：saveForm 新建时会调 listForms 查重名，而 mock 的 mem.forms 是**模块级共享 Map**，
  // 前一个用例存过的表单会留到这里 → 查重误判"重名" → saveForm 返回 null（表现为奇怪的连锁失败）。
  // 每个用例前清空索引，与真实 store 的"每次新建 store 各自独立"对齐。
  const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
    __mem: { forms: Map<string, unknown> }
  }
  storeMod.__mem.forms.clear()
  h.failSave = false
  h.failList = false
  h.failRename = false
  h.failDelete = false
  h.loadFormResult = null
  h.savedArgs = []
  h.newSeq = 0
  h.cfgInvalid = ''
  h.cloudThrow = false
  h.cloudListFail = false
  h.signer = null
  h.signedResult = ''
  h.encoded = 'FD1xxxx'
  localStorage.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(async () => {
  localStorage.clear()
  vi.restoreAllMocks()
})

/* ═══════════ 保存 ═══════════ */

describe('saveForm：保存画布', () => {
  it('**空画布 → 不保存、提示 nothingToSave、返回 null**', async () => {
    const { host, tips } = makeHost({ nodesCount: 0 })
    const m = useFormManager(host)
    const r = await m.saveForm('名字')
    expect(r, '应返回 null').toBeNull()
    expect(tips.length, '应提示').toBeGreaterThan(0)
  })

  it('**正常保存 → 返回 item、记录 currentFormId、提示已保存**', async () => {
    const { host, tips, calls } = makeHost()
    const m = useFormManager(host)
    const r = await m.saveForm('我的表单')

    expect(r, '应返回 item').toBeTruthy()
    expect(m.currentFormId, '应记住 id').toBe('new-1')
    expect(tips.some((x) => x.includes('我的表单')), '提示应带表单名').toBe(true)
    expect(calls.onSaved.length, '应通知宿主 onSaved').toBe(1)
  })

  it('**name 为空串 → 回落用 meta.title**', async () => {
    const { host } = makeHost()
    const m = useFormManager(host)
    await m.saveForm('   ')
    const arg = h.savedArgs[0] as { name?: string }
    expect(arg.name, '应回落 meta.title').toBe('测试表单')
  })

  /* ── 第 147 轮：新建时不能悄悄建出同名表单 ──
   * 表单名就是导航项标签。低代码的目标是"用户完全自己建导航项"，
   * 两个都叫「报表」的导航项在侧栏里分不清，用户只能靠点开猜。
   * 新建（currentFormId 为 null）时要拦住并说明；覆盖保存不拦（那是同一份表单）。 */

  it('**新建时与已有表单同名 → 拦住并提示重名**（不静默创建）', async () => {
    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      __store: { listForms: ReturnType<typeof vi.fn>; saveForm: ReturnType<typeof vi.fn> }
    }
    const original = storeMod.__store.listForms.getMockImplementation()
    storeMod.__store.listForms.mockImplementation(async () => [
      { id: 'old', name: '报表', updatedAt: '', collectKey: 'k' },
    ])
    try {
      storeMod.__store.saveForm.mockClear()
      const { host, tips } = makeHost()
      const m = useFormManager(host)
      const r = await m.saveForm('报表')
    expect(r, '重名不该创建').toBeNull()
    expect(storeMod.__store.saveForm, '不该调存储层').not.toHaveBeenCalled()
      expect(tips.join(' | '), `实际提示：${JSON.stringify(tips)}`).toMatch(/重名|已存在|同名/)
      expect(m.saving, 'saving 应复位').toBe(false)
    } finally {
      if (original) storeMod.__store.listForms.mockImplementation(original)
    }
  })

  it('**重名判断要 trim 后比**（" 报表 " 与 "报表" 算重名）', async () => {
    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      __store: { listForms: ReturnType<typeof vi.fn>; saveForm: ReturnType<typeof vi.fn> }
    }
    const original = storeMod.__store.listForms.getMockImplementation()
    storeMod.__store.listForms.mockImplementation(async () => [
      { id: 'old', name: '报表', updatedAt: '', collectKey: 'k' },
    ])
    try {
      storeMod.__store.saveForm.mockClear()
      const { host } = makeHost()
      const m = useFormManager(host)
      const r = await m.saveForm('  报表  ')
      expect(r, 'trim 后同名也要拦住').toBeNull()
      expect(storeMod.__store.saveForm).not.toHaveBeenCalled()
    } finally {
      if (original) storeMod.__store.listForms.mockImplementation(original)
    }
  })

  it('**覆盖保存（currentFormId 非空）不拦同名**', async () => {
    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      __store: { listForms: ReturnType<typeof vi.fn> }
    }
    const { host } = makeHost()
    const m = useFormManager(host)
    await m.saveForm('原名') // 建立 currentFormId
    const original = storeMod.__store.listForms.getMockImplementation()
    storeMod.__store.listForms.mockImplementation(async () => [
      { id: 'new-1', name: '原名', updatedAt: '', collectKey: 'k' },
    ])
    try {
      const r = await m.saveForm('原名')
      expect(r, '覆盖自己不算重名').toBeTruthy()
    } finally {
      if (original) storeMod.__store.listForms.mockImplementation(original)
    }
  })

  it('**不同名 → 正常保存**', async () => {
    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      __store: { listForms: ReturnType<typeof vi.fn> }
    }
    const original = storeMod.__store.listForms.getMockImplementation()
    storeMod.__store.listForms.mockImplementation(async () => [
      { id: 'old', name: '报表', updatedAt: '', collectKey: 'k' },
    ])
    try {
      const { host } = makeHost()
      const m = useFormManager(host)
      const r = await m.saveForm('另一个报表')
      expect(r).toBeTruthy()
    } finally {
      if (original) storeMod.__store.listForms.mockImplementation(original)
    }
  })

  it('**取索引失败时不能因此挡住保存**（重名检查是尽力而为）', async () => {
    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      __store: { listForms: ReturnType<typeof vi.fn> }
    }
    const original = storeMod.__store.listForms.getMockImplementation()
    storeMod.__store.listForms.mockImplementation(async () => {
      throw new Error('list boom')
    })
    try {
      const { host } = makeHost()
      const m = useFormManager(host)
      const r = await m.saveForm('随便')
      expect(r, '查重失败不该拖累保存').toBeTruthy()
    } finally {
      if (original) storeMod.__store.listForms.mockImplementation(original)
    }
  })

  it('**第二次保存复用 currentFormId**（覆盖而非新建）', async () => {
    const { host } = makeHost()
    const m = useFormManager(host)
    await m.saveForm('第一次')
    await m.saveForm('第二次')
    const second = h.savedArgs[1] as { id: string | null }
    expect(second.id, '第二次应带已有 id').toBe('new-1')
  })

  /* ── 第 152 轮：当前表单被别处删掉后，保存会**永远失败且无路可走** ──
   * `currentFormId` 只在"自己删除它"时清空（而删除已不存在的目标会提前返回），
   * 也没有"新建/脱离"入口。store.saveForm 覆盖不存在的 id 会抛 formNotFound，
   * 于是每次点保存都被同一条错误挡住 —— 用户的内容再也存不下去。 */

  it('**覆盖目标已被删除 → 转为另存为新表单**（不能让内容存不下去）', async () => {
    const { host, tips } = makeHost()
    const m = useFormManager(host)
    await m.saveForm('第一次')
    const oldId = m.currentFormId
    expect(oldId, '前置：已有 id').toBeTruthy()

    // 别的窗口把它删了：索引里再也查不到这个 id
    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      __store: { listForms: ReturnType<typeof vi.fn> }
      __mem: { forms: Map<string, unknown> }
    }
    storeMod.__mem.forms.clear()
    const original = storeMod.__store.listForms.getMockImplementation()
    storeMod.__store.listForms.mockImplementation(async () => [])
    try {
      h.savedArgs.length = 0
      const r = await m.saveForm('第二次')
      expect(r, '内容应被保存下来（新建），而不是报错返回 null').toBeTruthy()
      const arg = h.savedArgs[0] as { id: string | null }
      expect(arg.id, '不再用那个已消失的 id').toBeNull()
      expect(m.currentFormId, '身份要切到新表单').not.toBe(oldId)
      expect(tips.join(' | '), '要说明为什么改成新建').toMatch(/已不存在|已删除|另存/)
    } finally {
      if (original) storeMod.__store.listForms.mockImplementation(original)
    }
  })

  it('**目标还在 → 仍走覆盖**（别把正常的覆盖保存也改成新建）', async () => {
    const { host } = makeHost()
    const m = useFormManager(host)
    await m.saveForm('第一次')
    await m.saveForm('第二次')
    const second = h.savedArgs[1] as { id: string | null }
    expect(second.id, '目标还在时不该新建').toBe('new-1')
  })

  it('**取索引失败时不挡住保存**（查存在性是尽力而为）', async () => {
    const { host } = makeHost()
    const m = useFormManager(host)
    await m.saveForm('第一次')

    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      __store: { listForms: ReturnType<typeof vi.fn> }
    }
    const original = storeMod.__store.listForms.getMockImplementation()
    storeMod.__store.listForms.mockImplementation(async () => {
      throw new Error('list boom')
    })
    try {
      h.savedArgs.length = 0
      const r = await m.saveForm('第二次')
      expect(r, '读不到索引不该拖累保存').toBeTruthy()
      const arg = h.savedArgs[0] as { id: string | null }
      expect(arg.id, '按原 id 覆盖（真没了会由 store 抛错兜底）').toBe('new-1')
    } finally {
      if (original) storeMod.__store.listForms.mockImplementation(original)
    }
  })

  it('**保存抛错 → 返回 null、提示失败、saving 复位**', async () => {
    h.failSave = true
    const { host, tips } = makeHost()
    const m = useFormManager(host)
    const r = await m.saveForm('x')
    expect(r).toBeNull()
    expect(tips.length).toBeGreaterThan(0)
    expect(m.saving, 'saving 应复位').toBe(false)
  })

  it('**saving 中重复调用 → 直接返回 null（防重复提交）**', async () => {
    const { host } = makeHost()
    const m = useFormManager(host)
    const p1 = m.saveForm('a')
    const p2 = m.saveForm('b') // saving 已 true
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1, '第一次应成功').toBeTruthy()
    expect(r2, '第二次应被挡').toBeNull()
    expect(h.savedArgs.length, '只该保存一次').toBe(1)
  })
})

/* ═══════════ 我的表单 ═══════════ */

describe('refreshForms / openForms', () => {
  it('**openForms → 打开抽屉并刷新列表**（listForms 必须被调用）', async () => {
    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      __store: { listForms: ReturnType<typeof vi.fn> }
    }
    // 第 147 轮：`saveForm` 新建时会调 listForms 查重名，因此"消耗一次返回"的
    // mockResolvedValueOnce 不再可靠 —— 改为整段覆盖 + 复原。
    const original = storeMod.__store.listForms.getMockImplementation()
    storeMod.__store.listForms.mockClear()
    storeMod.__store.listForms.mockImplementation(async () => [item('f1'), item('f2')])

    const { host } = makeHost()
    const m = useFormManager(host)
    m.openForms()
    expect(m.formsOpen, '应打开').toBe(true)
    await nextTick()
    await nextTick()
    expect(storeMod.__store.listForms, 'openForms 应触发刷新').toHaveBeenCalledTimes(1)
    expect(m.formsList.length, '列表应被填充').toBe(2)
    if (original) storeMod.__store.listForms.mockImplementation(original)
  })

  it('**listForms 抛错 → formsError 有值、loading 复位**', async () => {
    h.failList = true
    const { host } = makeHost()
    const m = useFormManager(host)
    await m.refreshForms()
    expect(m.formsError, '应记录错误').toBeTruthy()
    expect(m.formsLoading, 'loading 应复位').toBe(false)
  })
})

describe('requestOpenForm / doOpenForm', () => {
  it('**画布为空 → 直接打开（不弹确认）**', async () => {
    h.loadFormResult = { nodes: [node('x')], meta: { title: '已存' } }
    const { host, calls } = makeHost({ nodesCount: 0 })
    const m = useFormManager(host)
    m.requestOpenForm(item('f1'))
    await nextTick()
    await nextTick()
    expect(m.pendingLoad, '不该进 pending').toBeNull()
    expect(calls.applyNodes.length, '应回填节点').toBe(1)
  })

  it('**画布非空 → 进 pendingLoad 等确认**（不立刻打开）', async () => {
    const { host, calls } = makeHost()
    const m = useFormManager(host)
    m.requestOpenForm(item('f1'))
    expect(m.pendingLoad, '应进 pending').toBeTruthy()
    expect(calls.applyNodes.length, '确认前不该回填').toBe(0)
  })

  /* ── 第 148 轮：判据是"有未保存修改"，不是"画布非空" ──
   * 确认弹窗的文案是「当前画布尚有未保存内容，打开将替换画布」——
   * 但实现判的是 `host.nodes().length`。两者不等价，于是两个方向同时出问题：
   * ① 虚假警报：刚打开/刚保存过、什么都没改，也被告知"尚有未保存内容"；
   * ② **真丢数据**：画布为空但改过标题（meta）时判为"空"→ 不确认 → 标题被静默覆盖。 */

  it('**改过标题但画布为空 → 仍要确认**（这是真丢数据的路径）', async () => {
    const { host } = makeHost({ nodesCount: 0 })
    const m = useFormManager(host)
    // 用户先敲了标题还没加字段
    host.updateMeta({ title: '客户台账' } as never)
    m.requestOpenForm(item('f1'))
    expect(m.pendingLoad, '改了没保存就该拦一下').toBeTruthy()
  })

  it('**画布非空但没改动 → 不弹确认**（"尚有未保存内容"不能是假的）', async () => {
    const { host } = makeHost()
    const m = useFormManager(host)
    // 先保存一次：此后内容与库中一致
    await m.saveForm('我的表单')
    m.requestOpenForm(item('other', '别的表单'))
    expect(m.pendingLoad, '没改动就不该吓唬用户').toBeNull()
  })

  it('**保存后立刻打开另一个 → 不弹确认**', async () => {
    const { host } = makeHost()
    const m = useFormManager(host)
    await m.saveForm('我的表单')
    m.requestOpenForm(item('f1'))
    expect(m.pendingLoad).toBeNull()
  })

  it('**保存后又改了内容 → 重新要确认**（保存不能把脏标记永久清掉）', async () => {
    const { host, setNodes } = makeHost()
    const m = useFormManager(host)
    await m.saveForm('我的表单')
    m.requestOpenForm(item('f1'))
    expect(m.pendingLoad, '保存后应视为干净').toBeNull()

    setNodes([node('n0'), node('n1'), node('n2')]) // 又加了一个字段
    m.requestOpenForm(item('f1'))
    expect(m.pendingLoad, '改了就要拦').toBeTruthy()
  })

  it('**打开某个表单后立刻打开另一个 → 不弹确认**（刚打开的内容就是库里的）', async () => {
    h.loadFormResult = { nodes: [node('a')], meta: { title: '已存表单' } }
    const { host } = makeHost({ nodesCount: 0 })
    const m = useFormManager(host)
    await m.doOpenForm(item('f1', '已存表单'))
    m.requestOpenForm(item('f2', '另一个'))
    expect(m.pendingLoad, '刚打开没改过，不该拦').toBeNull()
  })

  it('**打开后又改了内容 → 要确认**', async () => {
    h.loadFormResult = { nodes: [node('a')], meta: { title: '已存表单' } }
    const { host, setNodes } = makeHost({ nodesCount: 0 })
    const m = useFormManager(host)
    await m.doOpenForm(item('f1', '已存表单'))
    setNodes([node('a'), node('b')])
    m.requestOpenForm(item('f2', '另一个'))
    expect(m.pendingLoad, '改了就要拦').toBeTruthy()
  })

  it('**打开成功 → snapshot + applyNodes + updateMeta + 关抽屉 + onFormOpened**', async () => {
    h.loadFormResult = { nodes: [node('a'), node('b')], meta: { title: '已存表单' } }
    const { host, calls } = makeHost({ nodesCount: 0 })
    const m = useFormManager(host)
    await m.doOpenForm(item('f1', '已存表单'))

    expect(calls.snapshot, '打开前应 snapshot 进撤销栈').toBe(1)
    expect(calls.applyNodes[0]?.length, '应回填 2 个节点').toBe(2)
    expect(calls.updateMeta[0]?.title, '应回填 meta').toBe('已存表单')
    expect(m.currentFormId, '应记住 id').toBe('f1')
    expect(m.formsOpen, '应关抽屉').toBe(false)
    expect(calls.onFormOpened, '应通知宿主').toBe(1)

    // 对照：先打开抽屉再打开表单，确认是「关」而不是「本来就关」
    m.openForms()
    await nextTick()
    expect(m.formsOpen, '前置：抽屉应已打开').toBe(true)
    h.loadFormResult = { nodes: [node('z')], meta: {} }
    await m.doOpenForm(item('f2'))
    expect(m.formsOpen, '打开完成后应把抽屉关掉').toBe(false)
  })

  it('**loadForm 返回 null → 提示表单不存在，不 snapshot**', async () => {
    h.loadFormResult = null
    const { host, tips, calls } = makeHost({ nodesCount: 0 })
    const m = useFormManager(host)
    await m.doOpenForm(item('missing'))
    expect(tips.length, '应提示').toBeGreaterThan(0)
    expect(calls.snapshot, '失败不该 snapshot').toBe(0)
  })

  it('**loadForm 抛错 → 提示失败、不崩**', async () => {
    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      __store: { loadForm: ReturnType<typeof vi.fn> }
    }
    storeMod.__store.loadForm.mockRejectedValueOnce(new Error('load boom'))
    const { host, tips, calls } = makeHost({ nodesCount: 0 })
    const m = useFormManager(host)
    await m.doOpenForm(item('f1'))
    expect(tips.length, '应提示').toBeGreaterThan(0)
    expect(calls.snapshot, '失败不该 snapshot').toBe(0)
  })

  it('**design 只有 fields 没有 nodes → 回落 fields**（旧格式兼容）', async () => {
    h.loadFormResult = { fields: [node('legacy')], meta: {} }
    const { host, calls } = makeHost({ nodesCount: 0 })
    const m = useFormManager(host)
    await m.doOpenForm(item('f1'))
    expect(calls.applyNodes[0]?.length, '应回落 fields').toBe(1)
  })
})

/* ═══════════ 重命名 / 删除 ═══════════ */

describe('renameForm', () => {
  /* 第 151 轮起 `renameForm` 会先查索引（存储层找不到目标会静默 return，
   * 上层必须自己读一次）。所以被测目标要在索引里"真的存在" ——
   * 这是补 fixture，不是放宽断言：对"目标不存在"的断言另有专条（mock 返回 []）。 */
  beforeEach(async () => {
    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      __mem: { forms: Map<string, unknown> }
    }
    for (const [id, name] of [
      ['f1', '表单A'],
      ['f9', '某个'],
      ['other', '别的'],
    ]) {
      storeMod.__mem.forms.set(id, { id, name, updatedAt: '', collectKey: 'k' })
    }
  })

  it('**成功 → 返回 true、提示、renaming 复位**', async () => {
    const { host, tips } = makeHost()
    const m = useFormManager(host)
    const ok = await m.renameForm(item('f1'), '新名字')
    expect(ok, '应成功').toBe(true)
    expect(tips.length).toBeGreaterThan(0)
    expect(m.renaming).toBe(false)
  })

  it('**空名字 → 不写库**（第 145 轮：连"回落原名再写一遍"都不做）', async () => {
    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      __store: { renameForm: ReturnType<typeof vi.fn> }
    }
    const { host } = makeHost()
    const m = useFormManager(host)
    storeMod.__store.renameForm.mockClear()
    await m.renameForm(item('f1', '原名'), '   ')
    // 契约变更说明：原来会调 `renameForm('f1', '原名')`（回落原名写一遍），
    // 现在改成"名没变就不写库" —— 省掉一次无意义的写，也让返回值能表达"没改名"。
    expect(storeMod.__store.renameForm, '名没变就不该写库').not.toHaveBeenCalled()
  })

  /* ── 第 145 轮：空白名不能报"已重命名" ──
   * 兜底（`trim() || item.name`）保证了不写空串，但**界面照样提示"已重命名"** ——
   * 用户会以为改名成功了。表单名就是导航项标签，用户自建导航项时改名是高频操作。 */

  it('**空白名 → 不提示"已重命名"**（名字没变就不能说改成功了）', async () => {
    const { host, tips } = makeHost()
    const m = useFormManager(host)
    const ok = await m.renameForm(item('f1', '原名'), '   ')
    const all = tips.join(' | ')
    expect(all, `实际提示：${JSON.stringify(tips)}`).not.toContain('已重命名')
    expect(ok, '没改名不该报成功').toBe(false)
  })

  it('**只加首尾空格（trim 后与原名相同）→ 也不提示"已重命名"**', async () => {
    const { host, tips } = makeHost()
    const m = useFormManager(host)
    const ok = await m.renameForm(item('f1', '原名'), '  原名  ')
    const all = tips.join(' | ')
    expect(all, `实际提示：${JSON.stringify(tips)}`).not.toContain('已重命名')
    expect(ok).toBe(false)
  })

  it('空白名要给"没改名"的明确提示（不能静默无反应）', async () => {
    const { host, tips } = makeHost()
    const m = useFormManager(host)
    await m.renameForm(item('f1', '原名'), '')
    expect(tips.length, '既没改成功就得说一句').toBeGreaterThan(0)
    expect(tips.join(' | '), '要说明是名字为空/未变化').toMatch(/名|空|变化/)
  })

  it('改了名字但只是大小写/内部空格不同 → 照常成功', async () => {
    const { host, tips } = makeHost()
    const m = useFormManager(host)
    const ok = await m.renameForm(item('f1', 'a b'), 'A  B')
    expect(ok).toBe(true)
    expect(tips.join(' | ')).toContain('已重命名')
  })

  it('**抛错 → 返回 false、提示失败**', async () => {
    h.failRename = true
    const { host, tips } = makeHost()
    const m = useFormManager(host)
    const ok = await m.renameForm(item('f1'), 'x')
    expect(ok).toBe(false)
    expect(tips.length).toBeGreaterThan(0)
  })

  it('**renaming 中重复调用 → 返回 false**', async () => {
    const { host } = makeHost()
    const m = useFormManager(host)
    const p1 = m.renameForm(item('f1'), 'a')
    const p2 = m.renameForm(item('f1'), 'b')
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toBe(true)
    expect(r2, '第二次应被挡').toBe(false)
  })

  /* ── 第 150 轮：重命名"当前打开的表单"必须同步画布标题 ──
   * `store.renameForm` 只改索引里的 name，从不碰设计稿的 meta.title；
   * 而 `saveForm` 在名字为空时正是回落到 `design.meta.title`
   * （store.ts：`name || design.meta.title || t('fbd.untitled')`）。
   * 于是「重命名当前表单 → 直接点保存」会把新名悄悄写回旧名 —— 改名白改。 */

  it('**重命名当前打开的表单 → 画布标题跟着改**（否则下次保存退回旧名）', async () => {
    const { host, getMeta } = makeHost()
    const m = useFormManager(host)
    await m.saveForm('旧名') // 建立 currentFormId
    expect(m.currentFormId, '前置：应有当前表单').toBeTruthy()
    expect(getMeta().title, '前置：画布标题是旧名').toBe('旧名')

    await m.renameForm(item(m.currentFormId as string, '旧名'), '新名')
    expect(getMeta().title, '改名后画布标题必须同步').toBe('新名')
  })

  it('**改名后再保存 → 不会把新名写回旧名**', async () => {
    const { host } = makeHost()
    const m = useFormManager(host)
    await m.saveForm('旧名')
    await m.renameForm(item(m.currentFormId as string, '旧名'), '新名')

    h.savedArgs.length = 0
    await m.saveForm('') // 名字框留空 → 走 meta.title 回落
    const arg = h.savedArgs[0] as { name?: string }
    expect(arg.name, '回落应拿到新名，而不是旧名').toBe('新名')
  })

  it('**重命名别的表单 → 不动当前画布标题**（同进同退 ≠ 乱同步）', async () => {
    const { host, getMeta } = makeHost()
    const m = useFormManager(host)
    await m.saveForm('当前表单')
    const id = m.currentFormId
    await m.renameForm(item('other', '别的'), '别人的新名')
    expect(m.currentFormId, '身份不该变').toBe(id)
    expect(getMeta().title, '不该动当前画布').toBe('当前表单')
  })

  it('**还没打开任何表单时重命名 → 不动画布标题**', async () => {
    const { host, getMeta } = makeHost()
    const m = useFormManager(host)
    await m.renameForm(item('f9', '某个'), '新名')
    expect(getMeta().title, '没有当前表单就不该改画布').toBe('测试表单')
  })

  /* ── 第 151 轮：存储层 `renameForm(id,name): Promise<void>` 找不到目标也**静默 return**
   * （第 146 轮只修了 `deleteForm` 的同类洞）。于是"重命名一个已被别处删掉的表单"
   * 会报**已重命名**并返回 true —— 假成功，与 TD-43 同一族。 */

  it('**目标已不存在 → 不报"已重命名"、返回 false**（存储静默 return 不能被当成成功）', async () => {
    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      __store: { listForms: ReturnType<typeof vi.fn>; renameForm: ReturnType<typeof vi.fn> }
    }
    storeMod.__store.renameForm.mockClear()
    const original = storeMod.__store.listForms.getMockImplementation()
    storeMod.__store.listForms.mockImplementation(async () => [])
    try {
      const { host, tips } = makeHost()
      const m = useFormManager(host)
      const ok = await m.renameForm(item('gone', '原名'), '新名')
      expect(ok, '没改到东西不该报成功').toBe(false)
      expect(tips.join(' | '), `实际提示：${JSON.stringify(tips)}`).not.toContain('已重命名')
      expect(tips.join(' | '), '要说明"不存在"').toMatch(/不存在|已删|找不到/)
    } finally {
      if (original) storeMod.__store.listForms.mockImplementation(original)
    }
  })

  it('**取索引失败时不挡住改名**（查存在性是尽力而为，不能反过来制造故障）', async () => {
    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      __store: { listForms: ReturnType<typeof vi.fn> }
    }
    const original = storeMod.__store.listForms.getMockImplementation()
    storeMod.__store.listForms.mockImplementation(async () => {
      throw new Error('list boom')
    })
    try {
      const { host } = makeHost()
      const m = useFormManager(host)
      const ok = await m.renameForm(item('f1', '原名'), '新名')
      expect(ok, '读不到索引不该拖累改名').toBe(true)
    } finally {
      if (original) storeMod.__store.listForms.mockImplementation(original)
    }
  })
})

describe('deleteForm', () => {
  it('**删除当前表单 → currentFormId 清空**', async () => {
    const { host } = makeHost()
    const m = useFormManager(host)
    await m.saveForm('x') // 设 currentFormId = new-1
    expect(m.currentFormId).toBe('new-1')

    const ok = await m.deleteForm(item('new-1'))
    expect(ok, '应成功').toBe(true)
    expect(m.currentFormId, '删当前表单应清 id').toBeNull()
  })

  it('**删除其他表单 → currentFormId 不变**', async () => {
    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      __store: { listForms: ReturnType<typeof vi.fn> }
    }
    const { host } = makeHost()
    const m = useFormManager(host)
    // 先建 currentFormId（第 147 轮起新建会查重，索引里不能有同名）
    await m.saveForm('x')
    expect(m.currentFormId, '前置：应有当前表单').toBe('new-1')
    // 第 146 轮起删前查索引：目标必须真的存在，否则会走"已不存在"分支
    const original = storeMod.__store.listForms.getMockImplementation()
    storeMod.__store.listForms.mockImplementation(async () => [item('new-1'), item('other', '表单B')])
    try {
      const ok = await m.deleteForm(item('other', '表单B'))
      expect(ok, '目标存在应删除成功').toBe(true)
      expect(m.currentFormId, '不该动当前 id').toBe('new-1')
    } finally {
      if (original) storeMod.__store.listForms.mockImplementation(original)
    }
  })

  it('**抛错 → 返回 false、提示失败**', async () => {
    h.failDelete = true
    const { host, tips } = makeHost()
    const m = useFormManager(host)
    const ok = await m.deleteForm(item('f1'))
    expect(ok).toBe(false)
    expect(tips.length).toBeGreaterThan(0)
  })

  it('**deleting 中重复调用 → 返回 false（防重复删）**', async () => {
    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      __store: { deleteForm: ReturnType<typeof vi.fn>; listForms: ReturnType<typeof vi.fn> }
    }
    storeMod.__store.deleteForm.mockClear()
    // 第 146 轮起删前会查索引：目标必须"真的存在"（真实 store 的 listForms 返回已存表单）
    const original = storeMod.__store.listForms.getMockImplementation()
    storeMod.__store.listForms.mockImplementation(async () => [{ id: 'f1', name: 'F1', updatedAt: '' }])
    try {
      const { host } = makeHost()
      const m = useFormManager(host)
      const p1 = m.deleteForm(item('f1'))
      const p2 = m.deleteForm(item('f1'))
      const [r1, r2] = await Promise.all([p1, p2])
      expect(r1, '第一次应成功').toBe(true)
      expect(r2, '第二次应被挡').toBe(false)
      expect(storeMod.__store.deleteForm, '只该删一次').toHaveBeenCalledTimes(1)
    } finally {
      if (original) storeMod.__store.listForms.mockImplementation(original)
    }
  })

  /* ── 第 146 轮：删一个已经不在的表单，不能报"已删除" ──
   * 存储层接口是 `deleteForm(id): Promise<void>`，**找不到目标就静默 return**（不抛错）。
   * 于是"已经被别人删掉了"和"真的删掉了"在返回值上完全一样，`deleteForm` 一律提示"已删除"。
   * 两个标签页同时打开、或多人共用后端时，这就是"我说删成功了，刷新一下它又回来了"。 */

  it('**目标已不存在 → 不报"已删除"**（存储静默 return 不能被当成成功）', async () => {
    const { host, tips } = makeHost()
    const m = useFormManager(host)
    // 索引里没有 f1：模拟别的会话已经删掉
    h.failList = false
    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      __store: { listForms: ReturnType<typeof vi.fn> }
    }
    const original = storeMod.__store.listForms.getMockImplementation()
    storeMod.__store.listForms.mockImplementation(async () => [])
    try {
      const ok = await m.deleteForm(item('gone'))
      const all = tips.join(' | ')
      expect(all, `实际提示：${JSON.stringify(tips)}`).not.toContain('已删除')
      expect(ok, '没删到东西不该报成功').toBe(false)
    } finally {
      if (original) storeMod.__store.listForms.mockImplementation(original)
    }
  })

  it('找不到目标时要说明原因（不能静默无反应）', async () => {
    const { host, tips } = makeHost()
    const m = useFormManager(host)
    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      __store: { listForms: ReturnType<typeof vi.fn> }
    }
    const original = storeMod.__store.listForms.getMockImplementation()
    storeMod.__store.listForms.mockImplementation(async () => [])
    try {
      await m.deleteForm(item('gone'))
      expect(tips.length, '既没删成功就得说一句').toBeGreaterThan(0)
      expect(tips.join(' | '), '要说明"不存在/已被删除"').toMatch(/不存在|已删|找不到/)
    } finally {
      if (original) storeMod.__store.listForms.mockImplementation(original)
    }
  })
})

/* ═══════════ 分享码 ═══════════ */

describe('buildShareCode / buildShareCodeAsync', () => {
  it('**空画布 → 空串**', () => {
    const { host } = makeHost({ nodesCount: 0 })
    const m = useFormManager(host)
    expect(m.buildShareCode(), '空画布应空串').toBe('')
  })

  it('**非空画布 → 返回 encodeShareCode 结果**', () => {
    h.encoded = 'FD1-ABC'
    const { host } = makeHost()
    const m = useFormManager(host)
    expect(m.buildShareCode()).toBe('FD1-ABC')
  })

  it('**无签名者 → async 版与同步版一致（FD1 向后兼容）**', async () => {
    h.signer = null
    h.encoded = 'FD1-ABC'
    const { host } = makeHost()
    const m = useFormManager(host)
    expect(await m.buildShareCodeAsync()).toBe('FD1-ABC')
  })

  it('**有签名者 → 返回已签名码（FD2）**', async () => {
    h.signer = { id: 'local-hmac' }
    h.encoded = 'FD1-ABC'
    h.signedResult = 'FD2-SIGNED'
    const { host } = makeHost()
    const m = useFormManager(host)
    expect(await m.buildShareCodeAsync()).toBe('FD2-SIGNED')
  })

  it('**签名失败 → 抛错而非静默降级为未签名**', async () => {
    h.signer = { id: 'local-hmac' }
    h.encoded = 'FD1-ABC'
    h.signedResult = '' // 签名返回空 = 失败
    const { host } = makeHost()
    const m = useFormManager(host)
    await expect(m.buildShareCodeAsync(), '应抛错').rejects.toThrow(/签名失败/)
  })

  it('**空画布 → async 版也返回空串（不签名）**', async () => {
    h.signer = { id: 'local-hmac' }
    const { host } = makeHost({ nodesCount: 0 })
    const m = useFormManager(host)
    expect(await m.buildShareCodeAsync()).toBe('')
  })
})

/* ═══════════ 存储方式切换 ═══════════ */

describe('onModeChange：存储方式', () => {
  /**
   * ⚠️ 不能真造 <select> 再 el.value = 'cloud'：select 没有对应 <option> 时
   * value 恒为空串（HTML 规范）→ onModeChange 读到的 mode 是 ''，
   * 三个分支全部走错。这里直接用带 value 的普通对象当 target。
   */
  function evt(value: string): Event {
    return { target: { value } } as unknown as Event
  }

  it('**切到相同模式 → 早退（不重复切换）**', () => {
    const { host, tips } = makeHost()
    const m = useFormManager(host)
    m.onModeChange(evt('local')) // 默认已是 local
    expect(tips.length, '不该提示').toBe(0)
  })

  it('**切云端但配置非法 → 保持原模式 + 提示非法原因**', () => {
    h.cfgInvalid = 'URL 格式不对'
    const { host, tips } = makeHost()
    const m = useFormManager(host)
    m.onModeChange(evt('cloud'))
    expect(m.storageMode, '应保持 local').toBe('local')
    expect(tips, '应提示非法原因').toContain('URL 格式不对')
    expect(m.cloudTestMsg, '应写入测试消息').toBe('URL 格式不对')
  })

  it('**切本地 → 调用 setActiveFormStore(createLocalFormStore())**', async () => {
    const storeMod = (await import('@/components/form-builder/designer/store')) as unknown as {
      setActiveFormStore: ReturnType<typeof vi.fn>
      createLocalFormStore: ReturnType<typeof vi.fn>
    }
    // 先切到 cloud，再切回 local（同模式会早退）
    const { host } = makeHost()
    const m = useFormManager(host)
    m.cloudUrl = 'https://x.supabase.co'
    m.onModeChange(evt('cloud'))
    expect(m.storageMode).toBe('cloud')

    storeMod.setActiveFormStore.mockClear()
    storeMod.createLocalFormStore.mockClear()
    m.onModeChange(evt('local'))
    expect(storeMod.createLocalFormStore, '应创建本地 store').toHaveBeenCalledTimes(1)
    expect(storeMod.setActiveFormStore, '应切换活动 store').toHaveBeenCalledTimes(1)
    expect(m.storageMode, '应切回 local').toBe('local')
  })

  it('**切云端配置合法 → 切换成功并提示**', () => {
    const { host, tips } = makeHost()
    const m = useFormManager(host)
    m.cloudUrl = 'https://x.supabase.co'
    m.onModeChange(evt('cloud'))
    expect(m.storageMode, '应切到 cloud').toBe('cloud')
    expect(tips.length, '应提示切换成功').toBeGreaterThan(0)
  })

  it('**切云端 createCloudFormStore 抛错 → 保持原模式 + 提示**', () => {
    h.cloudThrow = true
    const { host, tips } = makeHost()
    const m = useFormManager(host)
    m.cloudUrl = 'https://x.supabase.co'
    m.onModeChange(evt('cloud'))
    expect(m.storageMode, '应保持 local').toBe('local')
    expect(tips.some((x) => x.includes('cloud create boom')), '应透出错误').toBe(true)
  })
})

describe('testCloud：连通性测试', () => {
  it('**配置非法 → cloudTestOk=false、不请求**', async () => {
    h.cfgInvalid = '缺 anonKey'
    const { host } = makeHost()
    const m = useFormManager(host)
    await m.testCloud()
    expect(m.cloudTestOk, '应失败').toBe(false)
    expect(m.cloudTestMsg).toBe('缺 anonKey')
  })

  it('**配置合法 + 请求成功 → cloudTestOk=true**', async () => {
    const { host } = makeHost()
    const m = useFormManager(host)
    m.cloudUrl = 'https://x.supabase.co'
    await m.testCloud()
    expect(m.cloudTestOk, '应成功').toBe(true)
    expect(m.cloudTesting, 'testing 应复位').toBe(false)
  })

  it('**请求失败 → cloudTestOk=false、消息含错误**', async () => {
    h.cloudListFail = true
    const { host } = makeHost()
    const m = useFormManager(host)
    m.cloudUrl = 'https://x.supabase.co'
    await m.testCloud()
    expect(m.cloudTestOk, '应失败').toBe(false)
    expect(m.cloudTestMsg, '消息应含错误').toContain('cloud unreachable')
    expect(m.cloudTesting, 'testing 应复位').toBe(false)
  })
})

/* ═══════════ 宿主注入 store 优先 ═══════════ */

describe('宿主注入 store 优先于全局活动 store', () => {
  it('**injectedStore 存在 → hasInjectedStore=true、用注入的 store**', async () => {
    const injected = {
      listForms: vi.fn(async () => [item('inj')]),
      loadForm: vi.fn(async () => null),
      saveForm: vi.fn(async () => item('inj-saved')),
      renameForm: vi.fn(async () => {}),
      deleteForm: vi.fn(async () => {}),
      loadRecords: vi.fn(async () => []),
      appendRecord: vi.fn(async () => {}),
      removeRecord: vi.fn(async () => {}),
      clearRecords: vi.fn(async () => {}),
    }
    const { host } = makeHost({ injectedStore: () => injected as never })
    const m = useFormManager(host)

    expect(m.hasInjectedStore, '应识别注入').toBe(true)
    await m.refreshForms()
    expect(injected.listForms, '应走注入 store').toHaveBeenCalled()
    expect(m.formsList[0]?.id, '列表来自注入 store').toBe('inj')
  })

  it('**注入 store 时 onModeChange 直接早退**（存储方式不可切）', () => {
    const injected = { listForms: vi.fn(async () => []) } as never
    const { host, tips } = makeHost({ injectedStore: () => injected })
    const m = useFormManager(host)
    const el = document.createElement('select')
    el.value = 'cloud'
    m.onModeChange({ target: el } as unknown as Event)
    expect(m.storageMode, '不该切换').toBe('local')
    expect(tips.length, '不该提示').toBe(0)
  })
})
