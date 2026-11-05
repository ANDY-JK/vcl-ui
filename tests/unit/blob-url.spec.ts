/**
 * isPersistableImageRef —— "这个图片引用能跨会话存活吗"（#435 收口）
 *
 * 判据背景：`FormTargetCollect` 曾用 `dataUrl: f.raw ?? f.url` 落盘，
 * `raw` 缺失时会把 `blob:http://…/xxx` 当数据存进后端 —— 刷新/换设备后必失效。
 * 这个文件锁住"什么能存、什么不能存"，防止下一次又把临时句柄当数据。
 */
import { describe, it, expect } from 'vitest'
import { isPersistableImageRef } from '@/components/_internal/blob-url'

describe('isPersistableImageRef 可持久化判据', () => {
  it('**Blob/File 本体可持久化**（本地落盘，重建页面前已存好）', () => {
    expect(isPersistableImageRef(new Blob(['x'], { type: 'image/png' }))).toBe(true)
    expect(isPersistableImageRef(new File(['x'], 'a.png', { type: 'image/png' }))).toBe(true)
  })

  it('**data: 引用可持久化**（自包含）', () => {
    expect(isPersistableImageRef('data:image/jpeg;base64,AAAA')).toBe(true)
  })

  it('**http(s): 引用可持久化**（云端）', () => {
    expect(isPersistableImageRef('https://cdn.example.com/a.jpg')).toBe(true)
    expect(isPersistableImageRef('HTTP://cdn.example.com/a.jpg')).toBe(true)
  })

  it('**blob: 拒收**（本文档临时句柄，跨会话必失效 —— 这正是原缺陷）', () => {
    expect(isPersistableImageRef('blob:http://localhost/abcd-1234')).toBe(false)
    expect(isPersistableImageRef('blob:null/abcd-1234')).toBe(false)
  })

  it('**反向保护：别的字符串仍被拒**（相对路径/空串/垃圾值不能混进来）', () => {
    expect(isPersistableImageRef('/uploads/a.jpg')).toBe(false)
    expect(isPersistableImageRef('a.jpg')).toBe(false)
    expect(isPersistableImageRef('')).toBe(false)
    expect(isPersistableImageRef('javascript:alert(1)')).toBe(false)
  })

  it('**非字符串非 Blob 一律拒**（undefined / null / 数字 / 对象）', () => {
    expect(isPersistableImageRef(undefined)).toBe(false)
    expect(isPersistableImageRef(null)).toBe(false)
    expect(isPersistableImageRef(42)).toBe(false)
    expect(isPersistableImageRef({ dataUrl: 'data:x' })).toBe(false)
  })

  it('**前后空白不误判**（" data:..." 仍应通过：判据前先 trim）', () => {
    expect(isPersistableImageRef('  data:image/png;base64,AA  ')).toBe(true)
  })
})
