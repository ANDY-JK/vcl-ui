/**
 * NotificationCenter · 契约
 *
 * 它是「可回溯收件箱」，与瞬时 Toast 分工不同。这里钉的是：
 * 受控契约（read 只从 items 来）、未读计数、只读不落值、键盘可达。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import NotificationCenter from '@/components/feedback/NotificationCenter.vue'
import type { NotificationItem } from '@/components/feedback/notification-types'

const baseItems: NotificationItem[] = [
  { id: 1, title: '新订单', desc: '订单 #1024 已支付', time: '刚刚', type: 'success' },
  { id: 2, title: '库存告警', desc: 'SKU-88 低于阈值', time: '5 分钟前', type: 'warning' },
  { id: 3, title: '系统公告', time: '昨天', type: 'info', read: true },
]

function mountNc(items: NotificationItem[] = baseItems, extra: Record<string, unknown> = {}) {
  return mount(NotificationCenter, {
    props: { items, ...extra } as never,
    attachTo: document.body,
  })
}

const panel = () => document.querySelector<HTMLElement>('.nc-panel')
const rows = () => Array.from(document.querySelectorAll<HTMLElement>('.nc-item'))
const badge = () => document.querySelector<HTMLElement>('.nc-badge')

async function openPanel(w: ReturnType<typeof mountNc>) {
  await w.find('.nc-trigger').trigger('click')
  await nextTick()
  await nextTick()
}

describe('NotificationCenter · 开关与未读计数', () => {
  it('默认收起：aria-expanded=false，面板不渲染', () => {
    const w = mountNc()
    expect(w.find('.nc-trigger').attributes('aria-expanded')).toBe('false')
    expect(panel()).toBeNull()
    w.unmount()
  })

  it('点铃铛打开面板：aria-expanded=true，面板是 dialog 且带标题', async () => {
    const w = mountNc()
    await openPanel(w)
    expect(w.find('.nc-trigger').attributes('aria-expanded')).toBe('true')
    const p = panel()
    expect(p?.getAttribute('role')).toBe('dialog')
    expect(p?.textContent).toContain('通知中心')
    w.unmount()
  })

  it('未读数 = items 里 read 非真的条数；角标显示它', async () => {
    const w = mountNc()
    expect(badge()?.textContent?.trim()).toBe('2')
    w.unmount()
  })

  it('全部已读时不显示角标', () => {
    const w = mountNc(baseItems.map((i) => ({ ...i, read: true })))
    expect(badge()).toBeNull()
    w.unmount()
  })

  it('未读数 > 99 收敛成 99+（否则角标把铃铛撑变形）', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, title: `通知${i + 1}` }))
    const w = mountNc(many)
    expect(badge()?.textContent?.trim()).toBe('99+')
    w.unmount()
  })

  it('Esc 关闭面板', async () => {
    const w = mountNc()
    await openPanel(w)
    expect(panel()).not.toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(panel()).toBeNull()
    w.unmount()
  })
})

describe('NotificationCenter · 受控契约（read 只从 items 来）', () => {
  it('点未读项：emit item-click + read，但不自己改 items', async () => {
    const w = mountNc()
    await openPanel(w)
    await rows()[0]!.click()
    expect(w.emitted('item-click')?.[0]?.[0]).toMatchObject({ id: 1 })
    expect(w.emitted('read')?.[0]?.[0]).toMatchObject({ id: 1 })
    // 宿主没更新 items → 角标仍是 2（不做「假装已读」）
    expect(badge()?.textContent?.trim()).toBe('2')
    w.unmount()
  })

  it('点已读项：只 emit item-click，不 emit read', async () => {
    const w = mountNc()
    await openPanel(w)
    const readRow = rows().find((r) => r.textContent?.includes('系统公告'))
    await readRow!.click()
    expect(w.emitted('item-click')).toHaveLength(1)
    expect(w.emitted('read')).toBeUndefined()
    w.unmount()
  })

  it('全部已读：有未读时可用并 emit read-all', async () => {
    const w = mountNc()
    await openPanel(w)
    const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('.nc-text-btn')).find((b) =>
      b.textContent?.includes('全部已读'),
    )
    expect(btn?.disabled).toBe(false)
    await btn!.click()
    expect(w.emitted('read-all')).toHaveLength(1)
    w.unmount()
  })

  it('全部已读：无未读时禁用且不 emit（避免无意义事件）', async () => {
    const w = mountNc(baseItems.map((i) => ({ ...i, read: true })))
    await openPanel(w)
    const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('.nc-text-btn')).find((b) =>
      b.textContent?.includes('全部已读'),
    )
    expect(btn?.disabled).toBe(true)
    await btn!.click()
    expect(w.emitted('read-all')).toBeUndefined()
    w.unmount()
  })

  it('清空：列表为空时禁用', async () => {
    const w = mountNc([])
    await openPanel(w)
    const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('.nc-text-btn')).find((b) =>
      b.textContent?.includes('清空'),
    )
    expect(btn?.disabled).toBe(true)
    w.unmount()
  })

  it('清空：有数据时 emit clear', async () => {
    const w = mountNc()
    await openPanel(w)
    const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('.nc-text-btn')).find((b) =>
      b.textContent?.includes('清空'),
    )
    await btn!.click()
    expect(w.emitted('clear')).toHaveLength(1)
    w.unmount()
  })
})

describe('NotificationCenter · 列表与过滤', () => {
  it('只看未读：切掉已读项，文案跟着变', async () => {
    const w = mountNc()
    await openPanel(w)
    expect(rows()).toHaveLength(3)
    const toggle = Array.from(document.querySelectorAll<HTMLButtonElement>('.nc-text-btn')).find((b) =>
      b.textContent?.includes('只看未读'),
    )
    await toggle!.click()
    await nextTick()
    expect(rows()).toHaveLength(2)
    w.unmount()
  })

  it('空列表显示空态文案；只看未读且全已读时显示另一句', async () => {
    const w = mountNc([])
    await openPanel(w)
    expect(document.querySelector('.nc-empty')?.textContent).toContain('暂无通知')
    w.unmount()

    const w2 = mountNc(baseItems.map((i) => ({ ...i, read: true })))
    await openPanel(w2)
    const toggle = Array.from(document.querySelectorAll<HTMLButtonElement>('.nc-text-btn')).find((b) =>
      b.textContent?.includes('只看未读'),
    )
    await toggle!.click()
    await nextTick()
    expect(document.querySelector('.nc-empty')?.textContent).toContain('没有未读通知')
    w2.unmount()
  })

  it('列表挂滚动边缘软化：两条遮罩存在且无溢出时都隐去', async () => {
    const w = mountNc()
    await openPanel(w)
    const veils = document.querySelectorAll('.vcl-scroll-edge__veil')
    expect(veils.length).toBe(2)
    expect(getComputedStyle(veils[0]!).opacity).toBe('0')
    w.unmount()
  })
})
