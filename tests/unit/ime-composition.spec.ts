// 输入法（IME）合成期统一判据 + 各入口守卫（2026-11-01 #276）
//
// 中文用户输拼音 → 候选框 → 按 Enter 上屏。浏览器先派发 keydown（合成期），
// 再派发 compositionend。组件若在这个 keydown 里 preventDefault / 执行"确认"动作：
//   ① 上屏被取消；② 拼音被当成真实值（"zhangsan" 而不是「张三」）。
//
// 修前全库**零处**处理，同一个坑在表格内联编辑、下拉搜索、登录表单各踩一遍。
// 本文件锁两件事：判据本身的两种形态，以及各入口守卫生效且不误伤正常提交。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { isImeComposing } from '@/components/_internal/ime'
import Select from '@/components/form/Select.vue'
import Login from '@/components/login/login.vue'

describe('isImeComposing · 判据', () => {
  it('isComposing 为 true → 合成期（Chrome / Firefox / Edge）', () => {
    expect(isImeComposing(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }))).toBe(true)
  })

  it('keyCode 229 → 合成期（部分 Safari / 旧 WebView / 某些输入法只给这个）', () => {
    const e = new KeyboardEvent('keydown', { key: 'Enter' })
    Object.defineProperty(e, 'keyCode', { value: 229, configurable: true })
    expect(isImeComposing(e)).toBe(true)
  })

  it('正常按键 → 不是合成期（守卫不能把正常路径也堵死）', () => {
    expect(isImeComposing(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(false)
    expect(isImeComposing({ isComposing: false })).toBe(false)
    expect(isImeComposing({})).toBe(false)
  })
})

describe('各入口守卫', () => {
  it('**Select 搜索框：合成中按 Enter 不选中、不阻止上屏**', async () => {
    const w = mount(Select, {
      props: {
        modelValue: '',
        options: [
          { label: '北京', value: 'bj' },
          { label: '上海', value: 'sh' },
        ],
        filterable: true,
      },
      attachTo: document.body,
    })
    try {
      await nextTick()
      const input = w.find('input')
      await input.trigger('focus')
      await input.setValue('bei')
      await nextTick()
      const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true })
      input.element.dispatchEvent(e)
      await nextTick()
      expect(e.defaultPrevented, '合成期必须放行（否则上屏被取消）').toBe(false)
      expect(w.emitted('update:modelValue'), '合成期不得选中任何选项').toBeFalsy()
    } finally {
      w.unmount()
    }
  })

  it('**登录表单：合成中按 Enter 不提交**（中文用户名上屏时不该触发登录）', async () => {
    const w = mount(Login, { props: { loading: false }, attachTo: document.body })
    try {
      await nextTick()
      const inputs = w.findAll('input')
      expect(inputs.length, '登录表单应有输入框').toBeGreaterThan(0)
      // **必须先把表单填够**：否则 handleSubmit 被必填校验拦下，这条用例就成了空转
      // （负向对照当场照出过：去掉守卫也绿）
      await inputs[0]!.setValue('zhangsan')
      await inputs[1]!.setValue('secret123')
      // 登录表单绑的是 @keyup（不是 keydown），测试必须对准真实绑定
      const e = new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true })
      inputs[0]!.element.dispatchEvent(e)
      await nextTick()
      expect(w.emitted('submit'), '合成期不得提交').toBeFalsy()
    } finally {
      w.unmount()
    }
  })

  it('登录表单：合成结束后按 Enter 正常提交（正常路径未被堵死）', async () => {
    const w = mount(Login, { props: { loading: false }, attachTo: document.body })
    try {
      await nextTick()
      const inputs = w.findAll('input')
      // 填够长度绕过必填校验（用户名 ≥3、密码 ≥6）
      await inputs[0]!.setValue('zhangsan')
      await inputs[1]!.setValue('secret123')
      // 登录表单绑的是 @keyup（不是 keydown）
      const e = new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true })
      inputs[0]!.element.dispatchEvent(e)
      await nextTick()
      expect(w.emitted('submit'), '正常 Enter 必须提交').toBeTruthy()
    } finally {
      w.unmount()
    }
  })
})