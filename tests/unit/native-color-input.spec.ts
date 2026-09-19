// 原生 <input type="color"> 只接受 #rrggbb 一种写法。
// 库内 IconPicker 的默认色是 var(--color-primary)、背景可选 transparent，直接绑进 value
// 会被 Chrome 拒收：demo 站 icon 页实测刷 18 条 console 警告，取色块也显示成默认黑。
// 这里锁两件事：① 归一函数永远吐合法 #rrggbb；② 三个绑定点挂上后 value 合法。
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { toNativeColorValue } from '@/components/_internal/utils'
import IconPicker from '@/components/form/IconPicker.vue'
import Input from '@/components/form/Input.vue'

const HEX6 = /^#[0-9a-fA-F]{6}$/

let wrapper: ReturnType<typeof mount> | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('toNativeColorValue', () => {
  it('#RGB 简写展开成 #RRGGBB，已是 6 位的原样保持', () => {
    expect(toNativeColorValue('#f00')).toBe('#FF0000')
    expect(toNativeColorValue('#FF0000')).toBe('#FF0000')
    expect(toNativeColorValue('#6366f1')).toBe('#6366F1')
  })

  it('浏览器能算出色值的写法（rgb()/命名色）归一为十六进制', () => {
    expect(toNativeColorValue('rgb(17, 34, 51)')).toBe('#112233')
  })

  it('var() 令牌值解析不出时走兜底，交给控件的仍是合法值', () => {
    // 探针必须挂在文档树里才拿得到 :root 上的自定义属性；happy-dom 不实现这条解析（实测回空），
    // 所以这里只能锁「解析不出来时仍然合法」，真解析链路由 tests/e2e/icon-color-picker.spec.ts 在浏览器里取证
    document.documentElement.style.setProperty('--vcl-token-under-test', '#0a1428')
    try {
      expect(toNativeColorValue('var(--vcl-token-under-test)')).toMatch(HEX6)
    } finally {
      document.documentElement.style.removeProperty('--vcl-token-under-test')
    }
  })

  it('非法颜色串落黑，不能把宿主正文色当成用户选的色', () => {
    // CSSOM 会静默拒收非法值，此时计算色是从 html 继承来的正文色 —— 拿它填取色块就是串色
    document.documentElement.style.color = 'rgb(1, 2, 3)'
    try {
      for (const bad of ['#GG0000', 'ff8800', '#12345']) expect(toNativeColorValue(bad)).toBe('#000000')
    } finally {
      document.documentElement.style.color = ''
    }
  })

  it('算不出色值的输入一律落到合法兜底，绝不把原串直接交给控件', () => {
    const inputs: unknown[] = [
      'var(--color-primary)',
      'transparent',
      'oklch(0.7 0.1 200)',
      '#12345', // 位数不对
      'ff8800', // 缺 # 的裸十六进制不能当颜色认
      '',
      null,
      undefined,
      123,
      {},
    ]
    for (const v of inputs) expect(toNativeColorValue(v)).toMatch(HEX6)
  })

  it('归一时不给宿主文档树留残留节点', () => {
    const before = { html: document.documentElement.childElementCount, body: document.body.childElementCount }
    toNativeColorValue('var(--color-primary)')
    toNativeColorValue('#0f0')
    expect(document.documentElement.childElementCount).toBe(before.html)
    expect(document.body.childElementCount).toBe(before.body)
  })
})

describe('IconPicker 的两个取色器', () => {
  // 面板 Teleport 到 body 且用 v-show 控制，取色器从挂载起就在文档里
  const bodyPickers = () => Array.from(document.body.querySelectorAll('input[type="color"]'))

  it('色值经归一后才交给控件：#abc 到控件已是 #AABBCC', async () => {
    wrapper = mount(IconPicker, { props: { color: '#abc' } })
    await nextTick()
    // 未归一时控件收到 '#abc'，浏览器按非法值处理成黑 —— 这条就是改动前后的分界断言
    expect(bodyPickers()[0].value.toUpperCase()).toBe('#AABBCC')
  })

  it('默认色是 CSS 变量时，控件拿到合法十六进制、色值文本仍显示原值', async () => {
    wrapper = mount(IconPicker)
    await nextTick()
    const pickers = bodyPickers()
    // happy-dom 不解析自定义属性，这里只能锁「交出去的永远合法」；
    // 真浏览器里应拿到解析后的主题色，那条链路由 tests/e2e/icon-color-picker.spec.ts 取证
    for (const p of pickers) expect(p.value.toUpperCase()).toMatch(HEX6)
    const hexTexts = Array.from(document.body.querySelectorAll('.hex-input')) as HTMLInputElement[]
    expect(hexTexts[0].value).toBe('var(--color-primary)')
  })

  it('选「无背景」后背景取色器不接受 transparent', async () => {
    wrapper = mount(IconPicker, { props: { bgColor: '#EAECF0' } })
    ;(document.querySelector('.transparent-btn') as HTMLButtonElement).click()
    await nextTick()
    const bg = bodyPickers()[1]
    expect(bg.value.toUpperCase()).toBe('#000000')
    // 原始值仍保持 transparent —— 归一只发生在喂给控件这一步
    const hexTexts = Array.from(document.body.querySelectorAll('.hex-input')) as HTMLInputElement[]
    expect(hexTexts[1].value).toBe('transparent')
  })
})

describe('Input type=color', () => {
  it('modelValue 是简写或非法颜色时，控件值合法且显示的色值文本保持原样', async () => {
    wrapper = mount(Input, { props: { type: 'color', modelValue: '#abc' } })
    const el = wrapper.find('input[type="color"]').element as HTMLInputElement
    expect(el.value.toUpperCase()).toBe('#AABBCC')
    await wrapper.setProps({ modelValue: 'var(--color-primary)' })
    expect(el.value.toUpperCase()).toMatch(HEX6)
    expect(wrapper.find('.f-color-hex').text()).toBe('var(--color-primary)')
  })
})
