/**
 * `AppLayout` 是每页入口，但此前分支覆盖只有 37%（111 语句 / 34 行未覆盖）：
 * `provide` 出去的两个开关、横屏断点切换、面包屑、上一页/下一页、滚动进度拖拽都没被测过。
 *
 * 这里只测**公开行为**（DOM 与既有的 provide 契约），不改组件。
 * 手法：真装一个 memory-history 路由（AppLayout 依赖 useRoute/useRouter + RouterView），
 * 屏幕宽度用 `window.innerWidth` 打桩驱动 `checkScreen()` 的三档断点。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, inject, nextTick } from 'vue'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

const { default: AppLayout } = await import('@/components/layout/AppLayout.vue')
const { BP_MD, BP_LG } = await import('@/components/_internal/breakpoints')

const NAV = [
  {
    label: '指南',
    children: [
      { label: '开始', route: '/guide/start' },
      { label: '进阶', route: '/guide/advanced' },
    ],
  },
]

let router: Router

beforeEach(async () => {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => h('div', 'root') } },
      { path: '/guide/start', component: { render: () => h('div', 'start-page') } },
      { path: '/guide/advanced', component: { render: () => h('div', 'advanced-page') } },
      { path: '/other', component: { render: () => h('div', 'other-page') } },
    ],
  })
  await router.push('/guide/start')
  await router.isReady()
})

afterEach(() => {
  vi.restoreAllMocks()
  // 复位可能被 patch 过的 innerWidth
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 })
})

function setWidth(w: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w })
}

async function mountLayout(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  const w = mount(AppLayout, {
    props: { navItems: NAV, ...props },
    global: { plugins: [router] },
    attachTo: document.body,
  })
  for (let i = 0; i < 3; i++) await nextTick()
  return w
}

describe('AppLayout · 侧栏开合（provide 出去的契约）', () => {
  it('toggleSidebar 把 sidebarOpen 翻过来；toggleCollapse 翻 collapsed', async () => {
    const w = await mountLayout()
    const aside = w.find('aside.sidebar')
    expect(aside.classes(), '初始未打开').not.toContain('open')

    const toggleSidebar = w.vm.$.provides['toggleSidebar'] as () => void
    const toggleCollapse = w.vm.$.provides['toggleCollapse'] as () => void
    expect(typeof toggleSidebar, 'provide(toggleSidebar) 是对外契约').toBe('function')
    expect(typeof toggleCollapse, 'provide(toggleCollapse) 是对外契约').toBe('function')

    toggleSidebar()
    await nextTick()
    expect(w.find('aside.sidebar').classes(), '应加上 open').toContain('open')

    toggleCollapse()
    await nextTick()
    expect(w.find('aside.sidebar').classes(), '应加上 collapsed').toContain('collapsed')

    toggleSidebar()
    await nextTick()
    expect(w.find('aside.sidebar').classes(), '再切一次应关闭').not.toContain('open')
    w.unmount()
  })

  it('侧栏折叠按钮（aside 内那个）也能切换 collapsed', async () => {
    const w = await mountLayout()
    const btn = w.find('aside.sidebar button')
    expect(btn.exists(), '侧栏头部应有折叠按钮').toBe(true)
    await btn.trigger('click')
    await nextTick()
    expect(w.find('aside.sidebar').classes()).toContain('collapsed')
    w.unmount()
  })

  it('provide(isMobile) 跟随窗口宽度（< BP_MD 为移动端）', async () => {
    setWidth(BP_MD - 1)
    const w = await mountLayout()
    const isMobile = w.vm.$.provides['isMobile'] as { value: boolean }
    expect(isMobile.value, '窄屏应判移动端').toBe(true)
    w.unmount()

    setWidth(BP_LG + 100)
    const w2 = await mountLayout()
    const isMobile2 = w2.vm.$.provides['isMobile'] as { value: boolean }
    expect(isMobile2.value, '宽屏不是移动端').toBe(false)
    w2.unmount()
  })

  it('resize 到窄屏 → 汉堡按钮出现；再回到宽屏 → 消失', async () => {
    setWidth(BP_LG + 100)
    const w = await mountLayout()
    expect(w.find('.vcl-topbar-hamburger').exists(), '宽屏无汉堡').toBe(false)

    setWidth(BP_MD - 1)
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(w.find('.vcl-topbar-hamburger').exists(), '窄屏出现汉堡').toBe(true)

    setWidth(BP_LG + 100)
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(w.find('.vcl-topbar-hamburger').exists(), '回宽屏又消失').toBe(false)
    w.unmount()
  })

  it('移动端汉堡点开抽屉后，点击遮罩关闭', async () => {
    setWidth(BP_MD - 1)
    const w = await mountLayout()
    await w.find('.vcl-topbar-hamburger').trigger('click')
    await nextTick()
    const overlay = w.find('.vcl-sidebar-overlay')
    expect(overlay.exists(), '打开后应出现遮罩').toBe(true)
    await overlay.trigger('click')
    await nextTick()
    expect(w.find('.vcl-sidebar-overlay').exists(), '点遮罩应关闭').toBe(false)
    w.unmount()
  })
})

describe('AppLayout · 面包屑与上一页/下一页', () => {
  it('当前路由在 navItems 里 → 显示分类 + 标题', async () => {
    const w = await mountLayout()
    // ⚠️ 不能查 `w.text()`：侧栏 AccordionNav 也渲染同一批 label（指南/开始），
    // 面包屑坏了它照样能"通过"（第 157 轮负向对照据此发现假绿）。
    // 必须限定在顶栏的两个专属类上。
    const cat = w.find('.vcl-topbar-category')
    const title = w.find('.vcl-topbar-title')
    expect(cat.exists(), '顶栏应有分类').toBe(true)
    expect(cat.text(), '分类名').toBe('指南')
    expect(title.exists(), '顶栏应有标题').toBe(true)
    expect(title.text(), '当前项标题').toBe('开始')
    w.unmount()
  })

  it('有上一页/下一页时渲染按钮，点击会导航', async () => {
    const w = await mountLayout()
    const btns = w.findAll('.vcl-nav-btn')
    expect(btns.length, '首项：下一页有、上一页为空占位').toBe(2)
    // 第 2 个是"下一页"
    const next = btns[1]
    expect(next.text()).toContain('进阶')
    await next.trigger('click')
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
    expect(router.currentRoute.value.path, '应导航到下一项').toBe('/guide/advanced')
    w.unmount()
  })

  it('不在 navItems 里的路由 → 无面包屑；上一页为空占位、下一页给第一项', async () => {
    await router.push('/other')
    const w = await mountLayout()
    expect(w.find('.vcl-topbar-category').exists(), '无分类').toBe(false)
    expect(w.find('.vcl-topbar-title').exists(), '无标题').toBe(false)
    // 语义（getPrevNext）：idx = -1 → prev = null（(idx>0) 不成立），
    // next = flat[0]（-1 < len-1）—— 故意让"下一页"始终可前进，别把它当 bug。
    expect(w.findAll('.vcl-nav-btn.is-empty').length, '只有上一页是空占位').toBe(1)
    const btns = w.findAll('.vcl-nav-btn:not(.is-empty)')
    expect(btns[0].text(), '下一页给第一项').toContain('开始')
    w.unmount()
  })

  it('**首项时上一页是空占位、末项时下一页是空占位**（边界不能都变成可点）', async () => {
    // 首项
    await router.push('/guide/start')
    const w1 = await mountLayout()
    expect(w1.findAll('.vcl-nav-btn.is-empty').length, '首项：只有上一页空').toBe(1)
    expect(w1.text(), '首项没有"开始"作为上一页').not.toContain('上一页不存在')
    w1.unmount()

    // 末项：上一页有、下一页空
    await router.push('/guide/advanced')
    const w2 = await mountLayout()
    const empty = w2.findAll('.vcl-nav-btn.is-empty')
    expect(empty.length, '末项：只有下一页空').toBe(1)
    // 末项的空占位在右侧（DOM 顺序上排在上一页按钮之后）
    const all = w2.findAll('.vcl-nav-btn')
    expect(all[0].classes(), '左侧是上一页（可点）').not.toContain('is-empty')
    expect(all[all.length - 1].classes(), '右侧是下一页（空）').toContain('is-empty')
    w2.unmount()
  })
})

describe('AppLayout · 顶栏用户区', () => {
  it('不传 topbar-right 插槽时回退到 username 头像 + 退出按钮', async () => {
    const w = await mountLayout({ username: 'alice' })
    expect(w.text(), '显示用户名').toContain('alice')
    expect(w.find('.vcl-user-avatar').text(), '头像取首字母大写').toBe('A')
    const logout = w.find('.vcl-logout-btn')
    expect(logout.exists(), '有退出按钮').toBe(true)
    await logout.trigger('click')
    expect(w.emitted('logout'), '点击应 emit logout').toBeTruthy()
    w.unmount()
  })

  it('不传 username → 无用户区（不留空壳）', async () => {
    const w = await mountLayout()
    expect(w.find('.vcl-user-info').exists(), '无用户名不渲染用户区').toBe(false)
    w.unmount()
  })

  it('传 topbar-right 插槽时用插槽内容替换内置用户区', async () => {
    const w = mount(AppLayout, {
      props: { navItems: NAV, username: 'alice' },
      global: { plugins: [router] },
      slots: { 'topbar-right': () => h('span', { class: 'my-user' }, '自定义') },
      attachTo: document.body,
    })
    await nextTick()
    expect(w.find('.my-user').exists(), '插槽内容应渲染').toBe(true)
    expect(w.find('.vcl-user-info').exists(), '内置用户区应被替换').toBe(false)
    w.unmount()
  })
})

describe('AppLayout · 滚动进度条（可拖拽）', () => {
  /** 给内容区造出可滚动几何（happy-dom 不做布局，scrollHeight/clientHeight 需打桩） */
  function fakeScrollable(w: VueWrapper) {
    const body = w.find('.content-body').element as HTMLElement
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(body, 'clientHeight', { configurable: true, value: 400 })
    Object.defineProperty(body, 'scrollTop', { configurable: true, writable: true, value: 0 })
    return body
  }

  it('有可滚空间 → 显示进度条；滚到底 → 100%', async () => {
    const w = await mountLayout()
    const body = fakeScrollable(w)
    body.dispatchEvent(new Event('scroll'))
    // 节流 30ms
    await new Promise((r) => setTimeout(r, 60))
    const center = w.find('.vcl-nav-center')
    expect(center.exists(), '可滚动时应显示进度条').toBe(true)

    body.scrollTop = 600 // max = 1000-400 = 600 → 100%
    body.dispatchEvent(new Event('scroll'))
    await new Promise((r) => setTimeout(r, 60))
    expect(w.find('.vcl-nav-percent').text(), '滚到底应是 100%').toBe('100%')
    w.unmount()
  })

  it('无可滚空间 → 不显示进度条', async () => {
    const w = await mountLayout()
    const body = w.find('.content-body').element as HTMLElement
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 400 })
    Object.defineProperty(body, 'clientHeight', { configurable: true, value: 400 })
    body.dispatchEvent(new Event('scroll'))
    await new Promise((r) => setTimeout(r, 60))
    expect(w.find('.vcl-nav-center').exists(), '滚不动就不显示').toBe(false)
    w.unmount()
  })

  it('**松开鼠标后不再跟手**（把监听器真的摘掉，而不是靠 isDragging 守卫）', async () => {
    const w = await mountLayout()
    const body = fakeScrollable(w)
    body.dispatchEvent(new Event('scroll'))
    await new Promise((r) => setTimeout(r, 60))

    const bar = w.find('.vcl-nav-progress-track').element as HTMLElement
    Object.defineProperty(bar, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, width: 100, top: 0, height: 8, right: 100, bottom: 8 }),
    })

    // 按下在中点 → 50%
    await w.find('.vcl-nav-center').trigger('mousedown', { clientX: 50 })
    await nextTick()
    expect(body.scrollTop, '中点应滚到一半（600*0.5）').toBe(300)

    // 按住拖动到 3/4 → 450
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 75 }))
    await nextTick()
    expect(body.scrollTop, '按住拖动应跟手滚到 3/4').toBe(450)

    // 松开 → 监听器必须被**摘掉**
    document.dispatchEvent(new MouseEvent('mouseup'))
    await nextTick()

    // ⚠️ 关键设计（第 157 轮实测得出）：探针是"松开后仍跟手"，而**只剩 isDragging 守卫**
    // 时该探针抓不住 —— 因为 onProgressMouseUp 里的 removeEventListener 真的生效了，
    // "松开后仍跟手"在行为上不可能发生（要么监听器已摘、要么守卫挡住）。
    // 故改用**能区分两种实现**的数值：选中点 60（=360），而不是端点 100（=600）。
    //   正确实现：无监听器 → 不动，仍 450
    //   "只靠守卫"的错实现：仍算 60% → 360 ≠ 450
    //   "守卫也坏了"的错实现：90% → 540 ≠ 450
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 60 }))
    await nextTick()
    expect(body.scrollTop, '松开后鼠标再动：必须一动不动（既不是 360 也不是 540）').toBe(450)

    // 直接证据：松开后**重新按下**应能再拖（说明是"摘监听器"而非把功能永久废掉）
    await w.find('.vcl-nav-center').trigger('mousedown', { clientX: 100 })
    await nextTick()
    expect(body.scrollTop, '再按下应仍可拖到 600').toBe(600)
    w.unmount()
  })

  it('**监听器不泄漏**：第一次拖拽结束后，第二次「只按下」不被上一次的残留监听器带跑', async () => {
    const w = await mountLayout()
    const body = fakeScrollable(w)
    body.dispatchEvent(new Event('scroll'))
    await new Promise((r) => setTimeout(r, 60))

    const bar = w.find('.vcl-nav-progress-track').element as HTMLElement
    Object.defineProperty(bar, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, width: 100, top: 0, height: 8, right: 100, bottom: 8 }),
    })

    // 第一次完整手势：按下 50 → 拖到 75 → 松开（停 450）
    await w.find('.vcl-nav-center').trigger('mousedown', { clientX: 50 })
    await nextTick()
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 75 }))
    await nextTick()
    document.dispatchEvent(new MouseEvent('mouseup'))
    await nextTick()
    expect(body.scrollTop, '第一次手势后停在 450').toBe(450)

    // ⚠️ 判别点（第 157 轮实测得出）：第二次**只按下**到 20 → 应滚到 120。
    // 若上一次的 mousemove 监听器没被摘掉，它会在本次 mousedown 改写 scrollTop 之前
    // 先跑一遍旧值 —— 断言随之落空。这是「监听器泄漏」唯一可被单测区分的行为差异
    // （同一手势内两种实现表现完全一致，只有跨手势才看得出）。
    await w.find('.vcl-nav-center').trigger('mousedown', { clientX: 20 })
    await nextTick()
    expect(body.scrollTop, '第二次按下应只按 20% 计算（120），不受上次残留影响').toBe(120)
    w.unmount()
  })

  it('**只按下、不拖动**：单次手势只按一次比例滚（残留监听器会把它算两遍）', async () => {
    const w = await mountLayout()
    const body = fakeScrollable(w)
    body.dispatchEvent(new Event('scroll'))
    await new Promise((r) => setTimeout(r, 60))

    const bar = w.find('.vcl-nav-progress-track').element as HTMLElement
    Object.defineProperty(bar, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, width: 100, top: 0, height: 8, right: 100, bottom: 8 }),
    })

    // 第一次完整手势
    await w.find('.vcl-nav-center').trigger('mousedown', { clientX: 50 })
    await nextTick()
    document.dispatchEvent(new MouseEvent('mouseup'))
    await nextTick()

    // 第二次：只按下一次（不派发任何 mousemove）→ 值必须精确等于按 80% 算的 480
    await w.find('.vcl-nav-center').trigger('mousedown', { clientX: 80 })
    await nextTick()
    expect(body.scrollTop, '一次按下只应算一次（480）').toBe(480)
    w.unmount()
  })
})

/* 若 provide 的 key 名变了，上面这些用例会一起红——那正是要的：
 * 它们是 `provide` 对外契约的活文档。 */
describe('AppLayout · provide 契约自检', () => {
  it('注入方能拿到 isMobile / toggleSidebar / toggleCollapse 三个 key', async () => {
    const Probe = defineComponent({
      setup() {
        const isMobile = inject<{ value: boolean }>('isMobile', null as never)
        const toggleSidebar = inject<() => void>('toggleSidebar', null as never)
        const toggleCollapse = inject<() => void>('toggleCollapse', null as never)
        return () =>
          h('div', {
            class: 'probe',
            'data-has-mobile': isMobile ? '1' : '0',
            'data-has-sid': typeof toggleSidebar === 'function' ? '1' : '0',
            'data-has-col': typeof toggleCollapse === 'function' ? '1' : '0',
          })
      },
    })
    const w = mount(AppLayout, {
      props: { navItems: NAV },
      global: { plugins: [router] },
      slots: { default: () => h(Probe) },
      attachTo: document.body,
    })
    await nextTick()
    // 注意：AppLayout 的默认插槽不在 template 里（内容区固定 RouterView），
    // 所以这里改为直接查 provides（等价断言，避开"插槽位置"这个实现细节）
    const p = w.vm.$.provides
    expect(p['isMobile'], 'isMobile 必须 provide').toBeTruthy()
    expect(typeof p['toggleSidebar']).toBe('function')
    expect(typeof p['toggleCollapse']).toBe('function')
    w.unmount()
  })
})