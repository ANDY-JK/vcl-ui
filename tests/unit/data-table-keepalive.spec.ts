// 宿主用 <KeepAlive> 缓存页面时，切走只会 deactivated，不会 unmount。
// 全屏态下切走：表格节点挂在 body 上、body 还带着 dt-fullscreen-active（它把内容区
// overflow:hidden 掉），新页面既被盖住又滚不动，全局 keydown/click 监听也照旧在跑。
// 这里锁的是"失活即退出全屏"，与卸载路径同一类事故。
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue'
import DataTable from '@/components/data/DataTable.vue'
import { useT } from '@/components/_internal/i18n'
import type { Column } from '@/components/data/composables/types'

const t = useT()

const COLS: Column[] = [
  { key: 'name', title: '名称' },
  { key: 'value', title: '数值' },
]

const MINIMAL = {
  columns: COLS,
  data: [{ id: 'r1', name: '行1', value: '1' }],
  rowKey: 'id',
  virtualScroll: false,
  autoFit: false,
  persistence: 'none' as const,
}

let wrapper: ReturnType<typeof mount> | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

function fullscreenBtn(scope: ReturnType<typeof mount>) {
  return scope
    .findAll('button')
    .find(
      (b) => b.attributes('title') === t('table.fullscreenShow') || b.attributes('title') === t('table.exitFullscreen'),
    )
}

describe('全屏期间被 KeepAlive 失活', () => {
  it('失活即退出全屏：节点离开 body、全屏标记摘掉', async () => {
    const showTable = ref(true)
    const Host = defineComponent({
      setup() {
        return () =>
          h('div', { class: 'host-wrap' }, [
            h(KeepAlive, null, [showTable.value ? h(DataTable, { ...MINIMAL, key: 'dt' }) : h('div', { key: 'other' })]),
          ])
      },
    })
    wrapper = mount(Host, { attachTo: document.body })
    const hostWrap = wrapper.find('.host-wrap').element as HTMLElement

    await fullscreenBtn(wrapper)!.trigger('click')
    await nextTick()
    await nextTick()
    // 前提：真的进了全屏（节点确实被搬到 body、body 标记确实挂上），否则后面的断言是空转
    const stray = document.querySelectorAll('body > .table-wrap')
    expect(stray.length).toBe(1)
    expect(document.body.classList.contains('dt-fullscreen-active')).toBe(true)

    showTable.value = false
    await nextTick()
    await nextTick()
    await nextTick()

    expect(document.querySelectorAll('body > .table-wrap').length, '失活后全屏表格仍浮在 body 上盖住新页').toBe(0)
    expect(document.body.classList.contains('dt-fullscreen-active'), '失活后内容区被 overflow:hidden 锁住').toBe(false)
    expect(hostWrap.querySelector('.table-wrap')).toBeTruthy() // 节点回到组件自己的子树里
  })
})
