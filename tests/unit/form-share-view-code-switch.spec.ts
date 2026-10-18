// FormShareView：分享码变化必须重新解析
//
// 立案背景（2026-10-17 浏览器实测发现）：
//   路由从 `/form/<码A>` 切到 `/form/<码B>` 时，vue-router **复用同一个组件实例、只更新 prop**；
//   而 FormShareView 此前只在 `onMounted` 里解码一次 → 页面继续显示 A 的表单。
//   对「分享链接给别人填」的场景，这意味着**用户在同一个标签页打开第二条链接会看到错误的表单
//   并往里填数据**——是数据正确性问题，不是外观问题。
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import FormShareView from '@/components/form-builder/FormShareView.vue'
import {
  encodeShareCode,
  signShareCodeWith,
  SHARE_CODE_PREFIX,
  SHARE_CODE_SIGNED_PREFIX,
} from '@/components/form-builder/designer/share'
import { createHmacSigner, setActiveShareSigner } from '@/components/form-builder/designer/share-signer'
import type { FormDesign } from '@/components/form-builder/designer/types'

function design(title: string): FormDesign {
  return {
    schemaVersion: 3,
    meta: { title, description: `${title} 的说明` },
    nodes: [{ id: 'n1', type: 'text', label: `${title}-字段`, span: 24, key: 'k1' }],
  } as FormDesign
}

const codeA = encodeShareCode(design('表单A'))
const codeB = encodeShareCode(design('表单B'))

describe('FormShareView · 分享码切换', () => {
  it('首次挂载按 code 渲染', async () => {
    const w = mount(FormShareView, { props: { code: codeA } })
    await nextTick()
    expect(w.text()).toContain('表单A')
    expect(w.text()).not.toContain('表单B')
  })

  it('code prop 变化后重新解析（不再停留在旧表单）', async () => {
    const w = mount(FormShareView, { props: { code: codeA } })
    await nextTick()
    expect(w.text()).toContain('表单A')

    await w.setProps({ code: codeB })
    await nextTick()
    expect(w.text()).toContain('表单B')
    expect(w.text(), '旧表单内容必须被换掉').not.toContain('表单A')
  })

  it('连续切换多次仍以最后一个码为准', async () => {
    const w = mount(FormShareView, { props: { code: codeA } })
    await nextTick()
    await w.setProps({ code: codeB })
    await w.setProps({ code: codeA })
    await nextTick()
    expect(w.text()).toContain('表单A')
    expect(w.text()).not.toContain('表单B')
  })

  it('换成非法码 → 走无效态，而不是继续显示上一份表单', async () => {
    const w = mount(FormShareView, { props: { code: codeA } })
    await nextTick()
    expect(w.text()).toContain('表单A')

    await w.setProps({ code: 'FD1.这不是有效的base64' })
    await nextTick()
    expect(w.text(), '不得残留上一份表单').not.toContain('表单A')
  })
})

describe('FormShareView · 配了签发者时的验签', () => {
  afterEach(() => setActiveShareSigner(null))

  it('未配签发者：未签名 FD1 照常渲染（不制造破坏性变更）', async () => {
    setActiveShareSigner(null)
    const w = mount(FormShareView, { props: { code: codeA } })
    await nextTick()
    await flushPromises()
    expect(w.text()).toContain('表单A')
  })

  it('配了签发者：合法签名码正常渲染', async () => {
    const signer = createHmacSigner(['view', 'test'].join('-'))
    setActiveShareSigner(signer)
    const signed = (await signShareCodeWith(codeA, signer))!
    const w = mount(FormShareView, { props: { code: signed } })
    // 验签走 crypto.subtle（多跳异步），flushPromises 不一定够——用 waitFor 等结果稳定
    await vi.waitFor(() => expect(w.text()).toContain('表单A'), { timeout: 2000 })
  })

  it('配了签发者：被篡改的签名码进无效态，绝不渲染内容', async () => {
    const signer = createHmacSigner(['view', 'test'].join('-'))
    setActiveShareSigner(signer)

    // 攻击者改了内容（表单B）但保留原签名（表单A 的）
    const signedA = (await signShareCodeWith(codeA, signer))!
    const tampered = `${SHARE_CODE_SIGNED_PREFIX}${codeB.slice(SHARE_CODE_PREFIX.length)}.${signedA.split('.').pop()}`
    const w = mount(FormShareView, { props: { code: tampered } })
    // 等验签跑完（拒收是"稳定后的结论"，不能只看首帧）
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    expect(w.text(), '被篡改的内容不得渲染').not.toContain('表单B')
    expect(w.text()).not.toContain('表单A')
  })

  it('配了签发者：未签名 FD1 仍放行（unsigned 不等于伪造）', async () => {
    setActiveShareSigner(createHmacSigner(['view', 'test'].join('-'))
    )
    const w = mount(FormShareView, { props: { code: codeA } })
    await nextTick()
    await flushPromises()
    expect(w.text()).toContain('表单A')
  })
})
