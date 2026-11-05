/* ═══════════ 可写判据只许有 canWrite 一份实现（TD-79 类，#448） ═══════════
 *
 * TD-79 的结构：同一个契约分散在两条到达路径上就会漏。TD-90 已把判据收敛成
 * `_internal/writable.ts` 的 `canWrite(props)`，但**没有机械判据阻止新入口再手写一遍** ——
 * 第 427 轮就出过「时间面板确定按钮只靠 v-if 隐藏，面板打开后 disabled 翻真仍能写」。
 *
 * 本 spec：真实树零重复 + 判据非空转 + 合成夹具（报内联判据、不报原生绑定与注释）。
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { findInlineWriteGuards } from '../../scripts/check-canwrite-usage.mjs'

describe('check:canwrite-usage · 真实树', () => {
  it('**当前零内联重复**（判据只有 canWrite 一份）', () => {
    const { findings } = findInlineWriteGuards()
    expect(findings, `这些位置手写了可写判据：${JSON.stringify(findings, null, 2)}`).toEqual([])
  })

  it('**判据非空转**：扫描覆盖面足够（否则"零发现"是假的）', () => {
    const { scanned, guardLines } = findInlineWriteGuards()
    expect(scanned, '扫描文件过少 → 判据空转').toBeGreaterThan(100)
    expect(guardLines, '一行 disabled/readonly 都没扫到 → 判据空转').toBeGreaterThan(50)
  })
})

describe('check:canwrite-usage · 合成夹具', () => {
  let root = ''
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'canwrite-usage-'))
    mkdirSync(join(root, 'form'), { recursive: true })
    mkdirSync(join(root, '_internal'), { recursive: true })
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const write = (name, text) => writeFileSync(join(root, name), text)

  it('**报**：内联手写 `!props.disabled && !props.readonly`', () => {
    write('form/A.vue', '<script>\nfunction onClear() {\n  if (!props.disabled && !props.readonly) emit("clear")\n}\n</script>\n')
    const { findings } = findInlineWriteGuards({ componentsDir: root })
    expect(findings).toHaveLength(1)
    expect(findings[0].file).toContain('form/A.vue')
  })

  it('**报**：`disabled || readonly` 守卫形状', () => {
    write('form/B.ts', 'const ok = disabled || readonly ? false : true\n')
    expect(findInlineWriteGuards({ componentsDir: root }).findings.length).toBeGreaterThan(0)
  })

  it('**不报**：`:disabled="…"` 原生属性绑定**（视觉/焦点状态，不是写守卫）', () => {
    write('form/C.vue', '<template>\n  <button :disabled="disabled || readonly">x</button>\n</template>\n')
    expect(findInlineWriteGuards({ componentsDir: root }).findings).toEqual([])
  })

  it('**不报**：注释里讨论这个写法（注释不是代码）', () => {
    write('form/D.vue', '<script>\n// 不要用 !disabled && !readonly，请用 canWrite\nconst x = 1\n</script>\n')
    expect(findInlineWriteGuards({ componentsDir: root }).findings).toEqual([])
  })

  it('**不报**：`_internal/writable.ts` 本体（唯一实现，刻意豁免）', () => {
    write('_internal/writable.ts', 'export function canWrite(props) {\n  return !props.disabled && !props.readonly\n}\n')
    write('form/E.ts', 'import { canWrite } from "@/components/_internal/writable"\nexport const ok = canWrite(props)\n')
    expect(findInlineWriteGuards({ componentsDir: root }).findings).toEqual([])
  })

  it('**负向对照**：真实存在的 canonical 文件在扫描中被显式排除（否则判据会红在唯一实现上）', () => {
    const src = readFileSync('src/components/_internal/writable.ts', 'utf8')
    expect(src).toContain('return !props.disabled && !props.readonly')
    const { findings } = findInlineWriteGuards()
    expect(findings.map((f) => f.file)).not.toContain('src/components/_internal/writable.ts')
  })
})
