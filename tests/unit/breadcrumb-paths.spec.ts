/**
 * 面包屑 `Breadcrumb.vue` 的路径分类与渲染（第 124 轮）。
 *
 * ⚠️ 本组件是**保护文件**（源码里标注"禁止改 RouterLink 路径逻辑"），所以本文件**只补测试、不动实现**。
 *
 * 为什么值得测：它把 `path`/`to` 分成三类，分错的后果都很具体且**用户很难说清**：
 *   · hash 路由（`#/x`）或站内路径（`/x`）→ 必须走 `RouterLink`（否则整页刷新、丢应用状态）
 *   · 绝对 http(s) 外链 → 必须走 `<a>` 且 `target="_blank"` + `rel="noopener"`（否则拿不到 noopener 的防钓鱼保护）
 *   · 无路径项 → 当前页 `span[aria-current=page]`
 * 另有两条渲染细节：分隔符**最后一项后面不能出现**；自定义分隔符与默认图标互斥。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import Breadcrumb from '@/components/nav/Breadcrumb.vue'
import type { Crumb } from '@/components/nav/types'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div/>' } },
    { path: '/a', component: { template: '<div/>' } },
    { path: '/a/b', component: { template: '<div/>' } },
  ],
})

async function mountCrumb(items: Crumb[], separator?: string) {
  const w = mount(Breadcrumb, {
    props: { items, ...(separator === undefined ? {} : { separator }) },
    global: { plugins: [router] },
  })
  await router.isReady()
  await w.vm.$nextTick()
  return w
}

describe('面包屑：三类路径各自的渲染方式', () => {
  it('hash 路由（`#/a`）→ RouterLink（不整页刷新）', async () => {
    const w = await mountCrumb([{ label: '首页', path: '#/a' }])
    const link = w.find('a.crumb-link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/a')
    w.unmount()
  })

  it('站内路径（`/a/b`）→ RouterLink，href 保持原路径', async () => {
    const w = await mountCrumb([{ label: '子页', to: '/a/b' }])
    const link = w.find('a.crumb-link')
    expect(link.attributes('href')).toBe('/a/b')
    w.unmount()
  })

  it('**外部 http(s) 链接 → `<a>` + target=_blank + rel=noopener**（防钓鱼保护）', async () => {
    for (const url of ['https://example.com/x', 'http://example.com/x', 'HTTPS://EXAMPLE.COM/x']) {
      const w = await mountCrumb([{ label: '外链', path: url }])
      const a = w.find('a.crumb-link')
      expect(a.exists(), `${url} 应渲染成 <a>`).toBe(true)
      expect(a.attributes('href')).toBe(url)
      expect(a.attributes('target'), `${url} 应新标签打开`).toBe('_blank')
      expect(a.attributes('rel'), `${url} 必须带 noopener`).toBe('noopener')
      w.unmount()
    }
  })

  it('无 path/to → 当前页 span + aria-current=page（最后一个面包屑）', async () => {
    const w = await mountCrumb([{ label: '首页', path: '#/a' }, { label: '当前页' }])
    const current = w.find('.crumb-current')
    expect(current.exists()).toBe(true)
    expect(current.text()).toBe('当前页')
    expect(current.attributes('aria-current')).toBe('page')
    w.unmount()
  })

  it('`to` 与 `path` 同时存在时取 `path`（模板里 `path || to` 的顺序）', async () => {
    const w = await mountCrumb([{ label: 'X', path: '#/a', to: '/a/b' }])
    expect(w.find('a.crumb-link').attributes('href')).toBe('/a')
    w.unmount()
  })
})

describe('面包屑：分隔符', () => {
  it('默认用 chevron 图标，且**最后一项后面不加**分隔符', async () => {
    const w = await mountCrumb([{ label: 'A', path: '#/a' }, { label: 'B', path: '#/a' }, { label: 'C' }])
    // 3 项 → 2 个分隔符（不是 3 个）
    expect(w.findAll('.crumb-sep').length).toBe(2)
    expect(w.findAll('.crumb-sep-text').length).toBe(0)
    w.unmount()
  })

  it('单项不渲染任何分隔符', async () => {
    const w = await mountCrumb([{ label: 'only' }])
    expect(w.findAll('.crumb-sep').length).toBe(0)
    expect(w.findAll('.crumb-sep-text').length).toBe(0)
    w.unmount()
  })

  it('自定义 separator 时用文本、**不再出现图标**（两者互斥）', async () => {
    const w = await mountCrumb([{ label: 'A', path: '#/a' }, { label: 'B' }], '>')
    expect(w.findAll('.crumb-sep-text').length).toBe(1)
    expect(w.find('.crumb-sep-text').text()).toBe('>')
    expect(w.findAll('.crumb-sep'), '给了文本分隔符就不该再插图标').toHaveLength(0)
    w.unmount()
  })

  it('传空字符串 separator → 回落到默认图标（空文本不是"有效的自定义分隔符"）', async () => {
    const w = await mountCrumb([{ label: 'A', path: '#/a' }, { label: 'B' }], '')
    expect(w.findAll('.crumb-sep').length, '空分隔符应回落图标').toBe(1)
    w.unmount()
  })
})

describe('面包屑：外壳与无障碍', () => {
  it('根节点是 nav 且带 aria-label（读屏能识别成导航区域）', async () => {
    const w = await mountCrumb([{ label: 'A' }])
    const nav = w.find('nav.breadcrumb')
    expect(nav.exists()).toBe(true)
    expect(nav.attributes('aria-label')).toBe('Breadcrumb')
    w.unmount()
  })

  it('空列表 → 渲染出空 nav，不报错', async () => {
    const w = await mountCrumb([])
    expect(w.find('nav.breadcrumb').exists()).toBe(true)
    expect(w.find('nav.breadcrumb').text()).toBe('')
    w.unmount()
  })

  it('顺序与传入一致（面包屑的层级顺序不能被重排）', async () => {
    const w = await mountCrumb([{ label: '一级' }, { label: '二级' }, { label: '三级' }])
    const labels = w.findAll('.crumb-current, .crumb-link').map((n) => n.text())
    expect(labels).toEqual(['一级', '二级', '三级'])
    w.unmount()
  })

  it('尺寸走缩放令牌（保护注释点名：clamp() 不许改成 px）', async () => {
    const w = await mountCrumb([{ label: 'A' }])
    expect(w.html()).not.toContain('clamp(')
    w.unmount()
    const css = (await import('node:fs')).readFileSync('src/components/nav/Breadcrumb.vue', 'utf8')
    // 只扫 <style> 段：脚本里的**保护注释**本身写着"禁止：clamp() → px"，
    // 拿整文件做 not.toMatch 会把注释当成违规（第一版用例就栽在这里）
    const styleBlock = css.slice(css.indexOf('<style'))
    expect(styleBlock, '字号必须走缩放').toMatch(/font-size:\s*calc\(15px \* var\(--vcl-scale\)\)/)
    expect(styleBlock, '样式里不该出现 clamp()').not.toMatch(/clamp\(/)
    // 顺带钉住"尺寸不出现裸 px"（分隔符 gap/字号都要走令牌）
    // 口径与第 119 轮一致：calc(Npx * var(--vcl-scale)) **内部**的 px 不算裸值
    const stripped = styleBlock.replace(/calc\([^)]*var\(--vcl-scale\)[^)]*\)/g, '')
    const bare = stripped.match(/:\s*[^;:{}]*\b\d+px\b/g) ?? []
    expect(bare, `样式里有裸 px：${bare.join(' / ')}`).toHaveLength(0)
  })
})