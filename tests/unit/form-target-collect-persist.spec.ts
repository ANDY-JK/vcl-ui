import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

/**
 * 组件层判据：#435 的修复必须真的"接上了"。
 *
 * 判据函数本身有单测（blob-url.spec.ts），但**组件是否调用它**是另一回事 ——
 * 上一轮的教训（#433）：把函数写对、却有两处没转调，静态计数才抓得到。
 * 这里直接读源码断言：
 *   ① 不再出现 `dataUrl: f.raw ?? f.url`（原缺陷写法）
 *   ② 落盘前走 isPersistableImageRef
 */
const SRC = readFileSync('src/components/form-builder/FormTargetCollect.vue', 'utf8')
const CODE = SRC.split('\n')
  .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'))
  .join('\n')

describe('FormTargetCollect · 落盘判据接线（#435）', () => {
  it('**不再把 f.url 直接当 dataUrl**（原写法会让 blob: 落盘）', () => {
    expect(CODE).not.toContain('dataUrl: f.raw ?? f.url')
  })

  it('**落盘前用 isPersistableImageRef 判定**（raw 优先、字符串次之）', () => {
    expect(CODE).toContain('isPersistableImageRef(f.raw)')
    expect(CODE).toContain('isPersistableImageRef(f.url)')
  })

  it('**拿不出可持久化本体时不改槽位**（宁可不存，也不把临时 URL 当数据）', () => {
    expect(CODE).toMatch(/if \(!persistable\) \{[\s\S]*?reportWarn\([\s\S]*?return/)
  })
})
