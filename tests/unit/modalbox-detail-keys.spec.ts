// #24(e) ModalBox detail 列表以 label 作 key：label 重复时 Vue 会报 "Duplicate keys"
//         并在 patch 时错误复用节点。改用 索引 组合成唯一 key
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ModalBox from '@/components/layout/ModalBox.vue'

afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  vi.restoreAllMocks()
})

describe('ModalBox · detail 列表 key', () => {
  it('label 重复时不触发重复 key 警告，且更新后值仍正确', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const w = mount(ModalBox, {
      props: {
        visible: true,
        modalType: 'detail',
        detailItems: [
          { label: '状态', value: '1' },
          { label: '类型', value: '2' },
          { label: '时间', value: '3' },
        ],
      },
      attachTo: document.body,
    })
    await nextTick()

    const read = () => [...document.querySelectorAll('.detail-value')].map((e) => e.textContent)
    const warnText = () => warn.mock.calls.map((c) => c.join(' ')).join(' ')
    expect(read()).toEqual(['1', '2', '3'])

    // 改到「首尾都对不上、中间出现重复 label」的形态，Vue 才会走到 keyToNewIndexMap 并告警
    await w.setProps({
      detailItems: [
        { label: '状态', value: '1' },
        { label: '状态', value: 'X' },
        { label: '状态', value: 'Y' },
      ],
    })
    await nextTick()
    expect(read()).toEqual(['1', 'X', 'Y'])
    expect(warnText()).not.toContain('Duplicate keys')

    w.unmount()
  })
})
