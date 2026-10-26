/**
 * 标签页键盘导航（WAI-ARIA Tab Pattern，第 125 轮）。此前**零覆盖**：
 * `tabs-panel.spec.ts` 覆盖了 aria-controls / 激活切换 / lazy / 独立面板，但一个按键都没测。
 *
 * ⚠️ `Tabs.vue` 是**保护文件**（源码标注禁止改 clamp→px、active 指示器动画、TabItem 接口，
 *    且 underline/pill 模式行为需用户确认），因此本文件**只补测试、不动实现**。
 *    其中一处发现的边界问题用 `it.fails` 记录（断言"应有的行为"、当前不满足），
 *    这样既不会把缺陷固化成"期望值"，修好后也会立刻提醒把它翻成正式用例。详见 TD-34。
 *
 * 键盘导航错了会怎样：读屏/纯键盘用户按方向键**跳到别的页签**，或者更糟 ——
 * 未识别的按键也被 `preventDefault` 吃掉，于是 Tab 键、Esc、页面滚动全部失灵。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Tabs from '@/components/nav/Tabs.vue'
import type { TabItem } from '@/components/nav/types'

const ITEMS: TabItem[] = [
  { value: 'a', label: '甲' },
  { value: 'b', label: '乙' },
  { value: 'c', label: '丙' },
]

async function mountTabs(opts: { items?: TabItem[]; modelValue?: string | number; variant?: string } = {}) {
  const w = mount(Tabs, {
    props: {
      items: opts.items ?? ITEMS,
      modelValue: opts.modelValue ?? 'a',
      ...(opts.variant ? { variant: opts.variant as never } : {}),
    },
    attachTo: document.body,
  })
  await nextTick()
  /** 派发一个可取消的 keydown 到 tablist（组件把监听挂在 .tabs 上） */
  const press = (key: string) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    w.find('[role="tablist"]').element.dispatchEvent(e)
    return e
  }
  /** 最后一个 emit 的值 */
  const lastEmit = () => {
    const evs = w.emitted('update:modelValue') as Array<[string | number]> | undefined
    return evs?.at(-1)?.[0]
  }
  return { w, press, lastEmit }
}

describe('标签页键盘导航：四个按键的语义与环绕', () => {
  it('ArrowRight 前进一格', async () => {
    const { w, press, lastEmit } = await mountTabs({ modelValue: 'a' })
    press('ArrowRight')
    expect(lastEmit()).toBe('b')
    w.unmount()
  })

  it('**ArrowRight 在末项环绕到首项**', async () => {
    const { w, press, lastEmit } = await mountTabs({ modelValue: 'c' })
    press('ArrowRight')
    expect(lastEmit(), '末项再往右该回到第一项').toBe('a')
    w.unmount()
  })

  it('ArrowLeft 后退一格', async () => {
    const { w, press, lastEmit } = await mountTabs({ modelValue: 'b' })
    press('ArrowLeft')
    expect(lastEmit()).toBe('a')
    w.unmount()
  })

  it('**ArrowLeft 在首项环绕到末项**', async () => {
    const { w, press, lastEmit } = await mountTabs({ modelValue: 'a' })
    press('ArrowLeft')
    expect(lastEmit(), '首项再往左该回到最后一项').toBe('c')
    w.unmount()
  })

  it('Home → 首项、End → 末项', async () => {
    const { w, press, lastEmit } = await mountTabs({ modelValue: 'b' })
    press('Home')
    expect(lastEmit()).toBe('a')
    press('End')
    expect(lastEmit()).toBe('c')
    w.unmount()
  })

  it('**已被处理的按键才 preventDefault**（否则 Tab/Esc/输入会被吃掉）', async () => {
    const { w, press } = await mountTabs({ modelValue: 'a' })
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
      expect(press(key).defaultPrevented, `${key} 应阻止默认滚动/焦点移动`).toBe(true)
    }
    // 未识别的按键：一个都不许拦
    for (const key of ['Tab', 'Escape', 'Enter', 'a', ' ', 'ArrowUp', 'ArrowDown', 'PageDown']) {
      expect(press(key).defaultPrevented, `${key} 不该被拦（页面/输入要正常工作）`).toBe(false)
    }
    w.unmount()
  })

  it('未识别的按键不产生任何切换', async () => {
    const { w, press } = await mountTabs({ modelValue: 'a' })
    for (const key of ['Tab', 'Escape', 'ArrowUp', 'a', 'Enter']) press(key)
    expect(w.emitted('update:modelValue'), '这些键不该触发切换').toBeUndefined()
    w.unmount()
  })

  it('空列表：按键不崩、也不 preventDefault', async () => {
    const { w, press } = await mountTabs({ items: [], modelValue: '' })
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
      expect(() => press(key)).not.toThrow()
      expect(press(key).defaultPrevented, '没有页签时不该拦截按键').toBe(false)
    }
    expect(w.emitted('update:modelValue')).toBeUndefined()
    w.unmount()
  })
})

describe('标签页键盘导航：焦点跟随', () => {
  it('切换后焦点落到**新的那个 tab 按钮**上（读屏要跟着走）', async () => {
    const { w, press } = await mountTabs({ modelValue: 'a' })
    press('ArrowRight')
    await nextTick()
    await nextTick()
    const btns = w.findAll('[role="tab"]')
    expect(document.activeElement, '焦点应落在第二项').toBe(btns[1].element)
    w.unmount()
  })

  it('End 之后焦点落到末项按钮', async () => {
    const { w, press } = await mountTabs({ modelValue: 'a' })
    press('End')
    await nextTick()
    await nextTick()
    const btns = w.findAll('[role="tab"]')
    expect(document.activeElement).toBe(btns[2].element)
    w.unmount()
  })
})

describe('标签页：值与标签的取值规则', () => {
  it('**`value: 0` 必须被当成有效值**（`??` 而不是 `||`：0 是合法页签值）', async () => {
    const items: TabItem[] = [
      { value: 0, label: '零' },
      { value: 1, label: '一' },
    ]
    const { w } = await mountTabs({ items, modelValue: 0 })
    const btns = w.findAll('[role="tab"]')
    expect(btns[0].attributes('aria-selected'), 'value=0 要能选中').toBe('true')
    expect(btns[1].attributes('aria-selected')).toBe('false')
    // 点击第一项应 emit 0（不是 label）
    await btns[0].trigger('click')
    const evs = w.emitted('update:modelValue') as Array<[string | number]>
    expect(evs.at(-1)![0]).toBe(0)
    w.unmount()
  })

  it('缺 value 的项回落到 label（且选中判定同样用回落值）', async () => {
    const items: TabItem[] = [{ label: '裸标签' }, { value: 'x', label: '有值' }]
    const { w } = await mountTabs({ items, modelValue: '裸标签' })
    const btns = w.findAll('[role="tab"]')
    expect(btns[0].attributes('aria-selected'), '回落成 label 后应能选中').toBe('true')
    w.unmount()
  })

  it('点击页签 emit 对应值（鼠标与键盘同一条出口）', async () => {
    const { w } = await mountTabs({ modelValue: 'a' })
    const btns = w.findAll('[role="tab"]')
    await btns[2].trigger('click')
    const evs = w.emitted('update:modelValue') as Array<[string | number]>
    expect(evs.at(-1)![0]).toBe('c')
    w.unmount()
  })
})

describe('标签页：ARIA 与形态', () => {
  it('容器是 role=tablist，每项是 role=tab，选中项 aria-selected=true', async () => {
    const { w } = await mountTabs({ modelValue: 'b' })
    expect(w.find('[role="tablist"]').exists()).toBe(true)
    const btns = w.findAll('[role="tab"]')
    expect(btns.length).toBe(3)
    expect(btns.map((b) => b.attributes('aria-selected'))).toEqual(['false', 'true', 'false'])
    w.unmount()
  })

  it('active 类与 aria-selected 同源（不会一个说选中、另一个没选中）', async () => {
    const { w } = await mountTabs({ modelValue: 'b' })
    const btns = w.findAll('[role="tab"]')
    btns.forEach((b, i) => {
      expect(b.classes().includes('active'), `第 ${i} 项 active 与 aria-selected 必须一致`).toBe(
        b.attributes('aria-selected') === 'true',
      )
    })
    w.unmount()
  })

  it('variants 各自挂上对应 class；未传时默认 underline', async () => {
    const def = await mountTabs({})
    expect(def.w.find('.tabs').classes()).toContain('tabs-underline')
    def.w.unmount()
    for (const v of ['pills', 'card', 'tabbar']) {
      const t = await mountTabs({ variant: v })
      expect(t.w.find('.tabs').classes()).toContain(`tabs-${v}`)
      t.w.unmount()
    }
  })

  it('**icon 只在 tabbar 形态渲染**（其余形态静默忽略，避免多出一个不明图标）', async () => {
    const items: TabItem[] = [
      { value: 'a', label: '甲', icon: 'home' },
      { value: 'b', label: '乙', icon: 'user' },
    ]
    const tabbar = await mountTabs({ items, variant: 'tabbar' })
    expect(tabbar.w.find('.tab-btn svg').exists(), 'tabbar 应渲染图标').toBe(true)
    tabbar.w.unmount()

    for (const v of ['underline', 'pills', 'card']) {
      const t = await mountTabs({ items, variant: v })
      expect(t.w.find('.tab-btn svg').exists(), `${v} 不该渲染图标`).toBe(false)
      t.w.unmount()
    }
  })

  it('按钮 id 带实例前缀（**同一个页面/同一个 app 内**多个 Tabs 不冲突）', async () => {
    // 必须挂在**一个** app 里：useIdSafe 走 Vue 原生 useId，计数是 app 级的 ——
    // 挂两个独立 app 各自从 0 开始，id 必然相同，那是测试假象而不是缺陷
    const w = mount(
      {
        components: { Tabs },
        data: () => ({ items: ITEMS }),
        template: `<div><Tabs :items="items" model-value="a" /><Tabs :items="items" model-value="a" /></div>`,
      },
      { attachTo: document.body },
    )
    await nextTick()
    const roots = w.findAll('.tabs')
    expect(roots.length, '前提：确实挂了两组').toBe(2)
    const idA = roots[0].findAll('[role="tab"]')[0].attributes('id')
    const idB = roots[1].findAll('[role="tab"]')[0].attributes('id')
    expect(idA).toBeTruthy()
    expect(idB).toBeTruthy()
    expect(idA, '同页两个 Tabs 的 tab id 必须不同（否则 aria-controls 会串到另一个组件）').not.toBe(idB)
    // 同一组内部各项也必须互不相同
    const ids = roots[0].findAll('[role="tab"]').map((b) => b.attributes('id'))
    expect(new Set(ids).size).toBe(ids.length)
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
// 受控值失效（items 变了、modelValue 还停在旧值）—— 曾经的 TD-34
// ════════════════════════════════════════════════════════════════════
describe('标签页键盘导航：受控值失效（items 变了、modelValue 还停在旧值）', () => {
  /**
   * 真实场景：页签列表随权限/数据变化重建（少了一项），而宿主的 `modelValue` 仍指向已消失的那一项，
   * 于是 `findIndex` 返回 -1。旧的环绕公式 `(currentIdx - 1 + len) % len` 会算出 `len - 2`
   * —— **跳过末项**（第 125 轮发现、TD-34 登记；第 126 轮修）。
   */
  it('ArrowLeft 在"无匹配项"时落到**最后一项**（曾落到倒数第二项、跳过末项）', async () => {
    const { w, press, lastEmit } = await mountTabs({ modelValue: '已经不存在了' })
    press('ArrowLeft')
    expect(lastEmit(), '从"无选中"往左应绕到末项').toBe('c')
    w.unmount()
  })

  it('ArrowLeft 在"无匹配项"且只有两项时也落到末项', async () => {
    const items: TabItem[] = [
      { value: 'x', label: 'X' },
      { value: 'y', label: 'Y' },
    ]
    const { w, press, lastEmit } = await mountTabs({ items, modelValue: '不存在' })
    press('ArrowLeft')
    expect(lastEmit()).toBe('y')
    w.unmount()
  })

  it('ArrowRight 在"无匹配项"时落到首项（-1 + 1 = 0，与往左对称）', async () => {
    const { w, press, lastEmit } = await mountTabs({ modelValue: '已经不存在了' })
    press('ArrowRight')
    expect(lastEmit()).toBe('a')
    w.unmount()
  })

  it('无论从哪个状态出发，按键后 emit 的值**必须真的存在于 items 里**（否则选中项会指向空气）', async () => {
    const values = ITEMS.map((i) => i.value)
    for (const mv of ['a', 'b', 'c', '已经不存在了', '']) {
      for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
        const { w, press, lastEmit } = await mountTabs({ modelValue: mv })
        press(key)
        const v = lastEmit()
        expect(values, `modelValue=${mv} 按 ${key} 后 emit 了不存在的值 ${String(v)}`).toContain(v)
        w.unmount()
      }
    }
  })
})