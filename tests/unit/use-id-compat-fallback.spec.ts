/**
 * useIdCompat · Vue 3.4 退化路径（#484）
 *
 * 本库 peer 声明的是 `vue ^3.4.0`，而 `useId()` 是 3.5 才有的 —— 也就是说
 * **退化路径是一个被承诺支持的配置**，但它此前一行都没被跑过（`useIdCompat.ts`
 * 脚本段 71.4%，未覆盖的正是 `seq += 1` 与 `hasNativeUseId` 初值）。
 *
 * 为什么必须单独一份 spec：正式环境装的是 3.5，`nativeUseId` 恒为函数，
 * 退化分支在整套 7000 例里永远走不到。这里用 `vi.mock('vue')` 把 `useId`
 * 抹掉来模拟 3.4 —— 同时也就验了「命名空间取属性探测」这个写法本身
 * （直接 `import { useId } from 'vue'` 在 3.4 会是运行期 TypeError）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('vue', async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>
  // 覆盖掉 useId 即可模拟 3.4：其它导出原样透传，不能把整个 vue 模块换掉
  return { ...mod, useId: undefined }
})

type Mod = typeof import('@/components/_internal/useIdCompat')
let m: Mod

beforeEach(async () => {
  vi.resetModules()
  m = await import('@/components/_internal/useIdCompat')
})

describe('useIdCompat · Vue 3.4 退化到模块级自增', () => {
  it('探测结果为"没有原生 useId"', () => {
    expect(m.hasNativeUseId).toBe(false)
  })

  it('产出带语义前缀的 id，且从 1 开始', () => {
    expect(m.useIdSafe('input')).toBe('vcl-input-1')
  })

  it('连续调用单调递增、互不重复（这是 id 存在的唯一理由）', () => {
    const a = m.useIdSafe('select-panel')
    const b = m.useIdSafe('select-panel')
    expect(a).not.toBe(b)
    expect(a).toBe('vcl-select-panel-1')
    expect(b).toBe('vcl-select-panel-2')
  })

  it('不给 prefix 时用默认 id', () => {
    expect(m.useIdSafe()).toMatch(/^vcl-id-\d+$/)
  })

  it('id 只含安全字符（能直接进 label[for] / aria-controls）', () => {
    expect(m.useIdSafe('a11y')).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})