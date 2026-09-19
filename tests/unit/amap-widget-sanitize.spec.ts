// 修复锁定：AmapWidget 信息窗 HTML 必须经 sanitizeHTML 白名单消毒
// 背景：item.infoWindow 为 HTML 字符串，若含用户输入（店名/地址）直接 setContent 有 XSS 面（审计 P1 安全）
// 策略：源码级锁定 setContent 前调用 sanitizeHTML（与 richtext-xss.spec 的 P0-4 锁定方式一致）
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(resolve(import.meta.dirname, '../../src/components/amap/AmapWidget.vue'), 'utf-8')

describe('AmapWidget · infoWindow HTML 消毒（源码锁定）', () => {
  it('setContent 前调用 sanitizeHTML 包裹 infoWindow', () => {
    expect(src).toMatch(/setContent\(sanitizeHTML\(item\.infoWindow\)\)/)
  })

  it('不允许未消毒地直接 setContent(item.infoWindow)', () => {
    // setContent( 后直接跟 item.infoWindow（无 sanitizeHTML 包裹）即视为回归
    expect(src).not.toMatch(/setContent\(\s*item\.infoWindow\s*\)/)
  })

  it('expose 的 openInfoWindow 也必须消毒（宿主传入内容同面）', () => {
    // openInfoWindow expose 直插 DOM（审查 §17.2-7 遗留）：回归时 setContent(content) 裸调会被此处捕获
    expect(src).toMatch(/setContent\(sanitizeHTML\(content\)\)/)
    expect(src).not.toMatch(/setContent\(\s*content\s*\)/)
  })

  it('sanitizeHTML 对信息窗场景剥离脚本与事件属性', async () => {
    const { sanitizeHTML } = await import('@/components/_internal/sanitize')
    // 店名/地址注入恶意内容：script 整体移除、onclick 事件剥离
    expect(sanitizeHTML('<b>门店A</b><script>alert(1)</script>')).toBe('<b>门店A</b>')
    expect(sanitizeHTML('<p onclick="evil()">地址</p>')).toBe('<p>地址</p>')
  })
})
