/**
 * 门店新增/编辑弹窗（第 133 轮）。此前**没有任何单测** —— 44 条语句、83 个分支只有 40% 覆盖。
 *
 * 这个弹窗是"用户填的东西直接进 localStorage"的最后一道关口，重点钉四件事：
 *   · **校验**：名称与地址至少填一个；空白串不算填；错误提示要**跟得上输入**（本轮修的残留 bug）
 *   · **编辑 vs 新增**：表单回填、id 复用、坐标来源（coordSource）在"没改坐标"时不能被重置
 *   · **提交产物**：所有字段 trim、坐标 null 语义、`skipped` 保留
 *   · **关闭路径**：取消/Esc 只 close、不 save
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import StoreFormModal from '@/components/route-planner/StoreFormModal.vue'
import type { Store } from '@/components/route-planner/types'

function mountModal(visible = true, store: Store | null = null) {
  const w = mount(StoreFormModal, {
    props: { visible, store },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
  const lastSave = (): Store | undefined => {
    const evs = w.emitted('save') as Array<[Store]> | undefined
    return evs?.at(-1)?.[0]
  }
  /**
   * 按 placeholder 片段找输入框。
   *
   * 不用 label 文本：本组件的 label 走 i18n（实际是"门店名"/"区/县"/"镇/乡"，与直觉写法不同），
   * 而 placeholder 才是各字段稳定的区分点（见模板里的 placeholder="..."）。
   */
  const FIELD_PH: Record<string, string> = {
    名称: '营业厅',
    地址: 'xx路',
    省: '湖南省',
    市: '长沙市',
    区县: '芙蓉区',
    乡镇: 'xx镇',
    联系人: '姓名',
    电话: '手机号',
    经度: '113.',
    纬度: '28.1',
  }
  const inputByLabel = (key: keyof typeof FIELD_PH | string) => {
    const hint = FIELD_PH[key] ?? key
    const el = w.findAll('input').find((i) => (i.attributes('placeholder') ?? '').includes(hint))
    if (!el) throw new Error(`找不到 placeholder 含「${hint}」的输入框`)
    return el
  }
  const submit = () => w.find('form').trigger('submit')
  return { w, lastSave, inputByLabel, submit }
}

const EDIT_STORE: Store = {
  id: 's-1',
  name: '老门店',
  address: '老地址',
  province: '广东省',
  city: '深圳市',
  district: '南山区',
  town: '粤海街道',
  contact: '张三',
  phone: '13800000000',
  longitude: 113.93,
  latitude: 22.53,
  coordSource: 'manual',
  skipped: false,
}

// ════════════════════════════════════════════════════════════════════
describe('校验：名称与地址至少填一个', () => {
  it('两个都空 → 不 save，出现错误提示', async () => {
    const { w, submit, lastSave } = mountModal()
    await nextTick()
    await submit()
    await nextTick()
    expect(lastSave(), '不该保存').toBeUndefined()
    expect(w.find('.form-error').text()).toContain('至少')
    w.unmount()
  })

  it('**纯空白**等同于没填（不能用 `!== ""` 判）', async () => {
    const { w, submit, lastSave, inputByLabel } = mountModal()
    await nextTick()
    await inputByLabel('名称').setValue('   ')
    await inputByLabel('地址').setValue('\t\n ')
    await submit()
    await nextTick()
    expect(lastSave(), '全是空白不该保存').toBeUndefined()
    expect(w.find('.form-error').exists()).toBe(true)
    w.unmount()
  })

  it('只填名称 → 可以保存', async () => {
    const { w, submit, lastSave, inputByLabel } = mountModal()
    await nextTick()
    await inputByLabel('名称').setValue('只有名称')
    await submit()
    await nextTick()
    expect(lastSave()?.name).toBe('只有名称')
    expect(lastSave()?.address).toBe('')
    w.unmount()
  })

  it('只填地址 → 可以保存', async () => {
    const { w, submit, lastSave, inputByLabel } = mountModal()
    await nextTick()
    await inputByLabel('地址').setValue('只有地址')
    await submit()
    await nextTick()
    expect(lastSave()?.address).toBe('只有地址')
    expect(lastSave()?.name).toBe('')
    w.unmount()
  })

  // ── 本轮修的 bug：错误提示要跟得上输入 ──
  it('**报错后填上名称，红字要立刻消失**（此前要等下次打开弹窗）', async () => {
    const { w, submit, inputByLabel } = mountModal()
    await nextTick()
    await submit()
    await nextTick()
    expect(w.find('.form-error').exists(), '先确认报错了').toBe(true)

    await inputByLabel('名称').setValue('测试门店')
    await nextTick()
    expect(w.find('.form-error').exists(), '填上名称后不该还挂着"至少填一个"').toBe(false)
    w.unmount()
  })

  it('报错后填地址也一样消失', async () => {
    const { w, submit, inputByLabel } = mountModal()
    await nextTick()
    await submit()
    await nextTick()
    await inputByLabel('地址').setValue('某地址')
    await nextTick()
    expect(w.find('.form-error').exists()).toBe(false)
    w.unmount()
  })

  it('填上又清空 → 红字重新出现（判定跟着当前值走，不是一次性的）', async () => {
    const { w, submit, inputByLabel } = mountModal()
    await nextTick()
    await submit()
    await nextTick()
    const name = inputByLabel('名称')
    await name.setValue('临时')
    await nextTick()
    expect(w.find('.form-error').exists()).toBe(false)
    await name.setValue('')
    await nextTick()
    expect(w.find('.form-error').exists(), '又空了应重新提示').toBe(true)
    w.unmount()
  })

  it('没提交过就不该先红一片（第一次打开是干净的）', async () => {
    const { w } = mountModal()
    await nextTick()
    expect(w.find('.form-error').exists()).toBe(false)
    expect(w.findAll('.input-error').length, '输入框不该先标红').toBe(0)
    w.unmount()
  })

  it('报错时**两个都空才两个都标红**；填上任意一个后红标全部撤掉', async () => {
    const { w, submit, inputByLabel } = mountModal()
    await nextTick()
    await submit()
    await nextTick()
    // 校验规则是"名称与地址至少填一个"，两个都空时两项都错，所以两个都标红
    expect(w.findAll('.input-error').length, '两个都空 → 两个都标红').toBe(2)

    await inputByLabel('名称').setValue('有名称')
    await nextTick()
    expect(w.findAll('.input-error').length, '满足"至少一个"后不该再有红标').toBe(0)
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('提交产物：trim / 坐标 / 默认值', () => {
  it('所有文本字段都 trim（首尾空格不进库）', async () => {
    const { w, submit, lastSave, inputByLabel } = mountModal()
    await nextTick()
    await inputByLabel('名称').setValue('  名  ')
    await inputByLabel('地址').setValue('  址  ')
    await inputByLabel('省').setValue('  省 ')
    await inputByLabel('联系人').setValue(' 人 ')
    await submit()
    await nextTick()
    const s = lastSave()!
    expect(s.name).toBe('名')
    expect(s.address).toBe('址')
    expect(s.province).toBe('省')
    expect(s.contact).toBe('人')
    w.unmount()
  })

  it('没填的文本字段是空串（不是 undefined，避免下游 `??` 兜不住）', async () => {
    const { w, submit, lastSave, inputByLabel } = mountModal()
    await nextTick()
    await inputByLabel('名称').setValue('x')
    await submit()
    await nextTick()
    const s = lastSave()!
    for (const k of ['address', 'province', 'city', 'district', 'town', 'contact', 'phone'] as const) {
      expect(s[k], `${k} 应是空串`).toBe('')
    }
    w.unmount()
  })

  it('新增时没有坐标 → longitude/latitude 为 null、coordSource 为 none', async () => {
    const { w, submit, lastSave, inputByLabel } = mountModal()
    await nextTick()
    await inputByLabel('名称').setValue('无坐标')
    await submit()
    await nextTick()
    const s = lastSave()!
    expect(s.longitude).toBeNull()
    expect(s.latitude).toBeNull()
    expect(s.coordSource).toBe('none')
    w.unmount()
  })

  it('新增时填了坐标 → coordSource 为 manual', async () => {
    const { w, submit, lastSave, inputByLabel } = mountModal()
    await nextTick()
    await inputByLabel('名称').setValue('有坐标')
    await inputByLabel('经度').setValue('113.5')
    await inputByLabel('纬度').setValue('22.5')
    await submit()
    await nextTick()
    const s = lastSave()!
    expect(s.longitude).toBe(113.5)
    expect(s.latitude).toBe(22.5)
    expect(s.coordSource, '新增手填坐标 → manual').toBe('manual')
    w.unmount()
  })

  it('新增时只填了经度（缺纬度）→ coordSource 为 none', async () => {
    const { w, submit, lastSave, inputByLabel } = mountModal()
    await nextTick()
    await inputByLabel('名称').setValue('半个坐标')
    await inputByLabel('经度').setValue('113.5')
    await submit()
    await nextTick()
    expect(lastSave()?.coordSource, '坐标必须成对').toBe('none')
    w.unmount()
  })

  it('新增的 id 以 store_ 开头且每次不同（宿主漏传也不会撞）', async () => {
    const a = mountModal()
    await nextTick()
    await a.inputByLabel('名称').setValue('A')
    await a.submit()
    await nextTick()
    const idA = a.lastSave()!.id
    a.w.unmount()

    const b = mountModal()
    await nextTick()
    await b.inputByLabel('名称').setValue('B')
    await b.submit()
    await nextTick()
    const idB = b.lastSave()!.id
    b.w.unmount()

    expect(idA).toMatch(/^store_/)
    expect(idB).toMatch(/^store_/)
    expect(idA).not.toBe(idB)
  })

  it('新增时 skipped 一律 false', async () => {
    const { w, submit, lastSave, inputByLabel } = mountModal()
    await nextTick()
    await inputByLabel('名称').setValue('x')
    await submit()
    await nextTick()
    expect(lastSave()?.skipped).toBe(false)
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('编辑模式：回填与"不静默重置"', () => {
  it('打开时回填已有门店（含省市区与坐标）', async () => {
    const { w, inputByLabel } = mountModal(true, EDIT_STORE)
    await nextTick()
    const val = (kw: string) => (inputByLabel(kw)!.element as HTMLInputElement).value
    expect(val('名称')).toBe('老门店')
    expect(val('地址')).toBe('老地址')
    expect(val('省')).toBe('广东省')
    expect(val('市')).toBe('深圳市')
    expect(val('区县')).toBe('南山区')
    expect(val('乡镇')).toBe('粤海街道')
    expect(val('经度')).toBe('113.93')
    expect(val('纬度')).toBe('22.53')
    w.unmount()
  })

  it('编辑时复用原 id，不重新生成', async () => {
    const { w, submit, lastSave } = mountModal(true, EDIT_STORE)
    await nextTick()
    await submit()
    await nextTick()
    expect(lastSave()!.id).toBe('s-1')
    w.unmount()
  })

  it('**改了名称但没动坐标 → coordSource 保持原值**（不能因为编辑被重置成 manual）', async () => {
    const w0 = mountModal(true, { ...EDIT_STORE, coordSource: 'address_geocode' })
    await nextTick()
    await w0.inputByLabel('名称').setValue('改了名')
    await w0.submit()
    await nextTick()
    const s = w0.lastSave()!
    expect(s.name).toBe('改了名')
    expect(s.coordSource, '坐标没变就不该覆盖来源').toBe('address_geocode')
    w0.w.unmount()
  })

  it('改了坐标 → coordSource 变成 manual', async () => {
    const { w, submit, lastSave, inputByLabel } = mountModal(true, { ...EDIT_STORE, coordSource: 'township_geocode' })
    await nextTick()
    await inputByLabel('经度').setValue('114.05')
    await submit()
    await nextTick()
    expect(lastSave()!.coordSource, '用户手改了坐标就该标 manual').toBe('manual')
    w.unmount()
  })

  it('编辑时把坐标清空 → coordSource 变 none', async () => {
    const { w, submit, lastSave, inputByLabel } = mountModal(true, EDIT_STORE)
    await nextTick()
    await inputByLabel('经度').setValue('')
    await inputByLabel('纬度').setValue('')
    await submit()
    await nextTick()
    const s = lastSave()!
    expect(s.longitude).toBeNull()
    expect(s.latitude).toBeNull()
    expect(s.coordSource).toBe('none')
    w.unmount()
  })

  it('**编辑时不改写 skipped**（跳过状态不能被编辑动作静默重置）', async () => {
    const { w, submit, lastSave } = mountModal(true, { ...EDIT_STORE, skipped: true })
    await nextTick()
    await submit()
    await nextTick()
    expect(lastSave()!.skipped, 'skipped=true 要保留').toBe(true)
    w.unmount()
  })

  it('坐标来源为 original 且未改动 → 保持 original（不误判成 none）', async () => {
    const { w, submit, lastSave } = mountModal(true, { ...EDIT_STORE, coordSource: 'original' })
    await nextTick()
    await submit()
    await nextTick()
    expect(lastSave()!.coordSource).toBe('original')
    w.unmount()
  })

  it('标题与保存按钮文案在新增/编辑下不同', async () => {
    const add = mountModal(false, null)
    await add.w.setProps({ visible: true })
    await nextTick()
    const addText = add.w.text()
    add.w.unmount()

    const edit = mountModal(false, EDIT_STORE)
    await edit.w.setProps({ visible: true })
    await nextTick()
    const editText = edit.w.text()
    edit.w.unmount()

    expect(addText).not.toBe(editText)
    expect(editText, '编辑标题应含"编辑"').toContain('编辑')
  })
})

// ════════════════════════════════════════════════════════════════════
describe('关闭路径与重开重置', () => {
  it('点取消 → 只 close，不 save', async () => {
    const { w } = mountModal()
    await nextTick()
    const cancel = w.findAll('button').find((b) => b.classes().includes('btn-cancel'))
    expect(cancel, '应有取消按钮').toBeTruthy()
    await cancel!.trigger('click')
    expect(w.emitted('close')?.length, '应发出 close').toBe(1)
    expect(w.emitted('save'), '不该 save').toBeUndefined()
    w.unmount()
  })

  it('保存成功后**也 emit close**（宿主不必自己关）', async () => {
    const { w, submit, inputByLabel } = mountModal()
    await nextTick()
    await inputByLabel('名称').setValue('x')
    await submit()
    await nextTick()
    expect(w.emitted('save')?.length).toBe(1)
    expect(w.emitted('close')?.length, '保存后要关窗').toBe(1)
    w.unmount()
  })

  it('**重新打开时清空上次的输入与报错**（新增模式）', async () => {
    const { w, submit, inputByLabel } = mountModal()
    await nextTick()
    await inputByLabel('名称').setValue('上次写的')
    await submit()
    await nextTick()
    // 关窗再打开
    await w.setProps({ visible: false })
    await nextTick()
    await w.setProps({ visible: true })
    await nextTick()
    expect((inputByLabel('名称')!.element as HTMLInputElement).value, '重开应清空').toBe('')
    expect(w.find('.form-error').exists(), '重开不该带着上次的红字').toBe(false)
    w.unmount()
  })

  it('从编辑切到新增（同一个组件实例）→ 表单清空，标题回到新增', async () => {
    const { w } = mountModal(false, EDIT_STORE)
    await w.setProps({ visible: true })
    await nextTick()
    expect(w.text()).toContain('编辑')
    await w.setProps({ visible: false })
    await nextTick()
    await w.setProps({ store: null })
    await w.setProps({ visible: true })
    await nextTick()
    const firstInput = w.findAll('input')[0]
    expect((firstInput.element as HTMLInputElement).value, '新增模式不该残留上一次的门店').toBe('')
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('表单可访问性接线', () => {
  it('每个 label 的 for 都指向真实存在的 id（10 个字段）', async () => {
    const { w } = mountModal()
    await nextTick()
    const labels = w.findAll('label')
    expect(labels.length).toBe(10)
    const ids = new Set(w.findAll('input').map((i) => i.attributes('id')))
    for (const l of labels) {
      const forId = l.attributes('for')
      expect(forId, `label「${l.text()}」缺 for`).toBeTruthy()
      expect(ids.has(forId!), `label for=${forId} 指向了不存在的输入框`).toBe(true)
    }
    w.unmount()
  })

  it('footer 的提交按钮用 form 属性关联表体表单（跨插槽）', async () => {
    const { w } = mountModal()
    await nextTick()
    const submitBtn = w.findAll('button').find((b) => b.classes().includes('btn-save'))!
    const formId = w.find('form').attributes('id')
    expect(formId, '表体 form 要有 id').toBeTruthy()
    expect(submitBtn.attributes('form'), '提交按钮要指向该 form').toBe(formId)
    w.unmount()
  })

  it('两个必填项标了星号', async () => {
    const { w } = mountModal()
    await nextTick()
    expect(w.findAll('.required').length, '名称与地址两个必填标记').toBe(2)
    w.unmount()
  })
})
// ════════════════════════════════════════════════════════════════════
// 第 133 轮修的三个缺陷，各留一条"锁死"用例
// ════════════════════════════════════════════════════════════════════
describe('第 133 轮修复锁定', () => {
  it('**以 visible=true 直接挂载也要回填**（宿主常用 v-if + 静态 visible 写法）', async () => {
    // 此前 watch 没加 immediate：visible 从头到尾不变 → 一次都不触发 → 表单空着，
    // 编辑场景一保存就把原门店的名称/地址/省市区全清空（静默数据丢失）
    const w = mount(StoreFormModal, {
      props: { visible: true, store: EDIT_STORE },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    await nextTick()
    const firstInput = w.findAll('input')[0]
    expect((firstInput.element as HTMLInputElement).value, '挂载即应回填门店名').toBe('老门店')
    w.find('form').trigger('submit')
    await nextTick()
    const saved = (w.emitted('save') as Array<[Store]>)[0][0]
    expect(saved.name, '保存的必须是原值而不是空串').toBe('老门店')
    expect(saved.address).toBe('老地址')
    expect(saved.province).toBe('广东省')
    w.unmount()
  })

  it('**清空坐标存 null，不能存空串**（v-model.number 清空给的是空串）', async () => {
    const w = mount(StoreFormModal, {
      props: { visible: true, store: EDIT_STORE },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    await nextTick()
    const numInputs = w.findAll('input[type="number"]')
    await numInputs[0].setValue('')
    await numInputs[1].setValue('')
    await w.find('form').trigger('submit')
    await nextTick()
    const saved = (w.emitted('save') as Array<[Store]>)[0][0]
    // 类型声明是 number | null —— 空串会让下游 toFixed / 算术当场炸
    expect(saved.longitude, '清空后应是 null，不是空串').toBeNull()
    expect(saved.latitude).toBeNull()
    expect(saved.coordSource).toBe('none')
    w.unmount()
  })

  it('**坐标为 0 也算"有坐标"**（原实现用真值判断，0 会被当成没填）', async () => {
    // 依据：isValidLatLon 只拒绝 (0,0)，(0, 30) 是合法坐标；coordSource 判定要与它同口径
    const w = mount(StoreFormModal, {
      props: { visible: true, store: null },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    await nextTick()
    const [nameInput] = w.findAll('input')
    await nameInput.setValue('赤道门店')
    const numInputs = w.findAll('input[type="number"]')
    await numInputs[0].setValue('0')
    await numInputs[1].setValue('30')
    await w.find('form').trigger('submit')
    await nextTick()
    const saved = (w.emitted('save') as Array<[Store]>)[0][0]
    expect(saved.longitude).toBe(0)
    expect(saved.latitude).toBe(30)
    expect(saved.coordSource, '经度 0 是真坐标，不该判成 none').toBe('manual')
    w.unmount()
  })
})

