// @vitest-environment node
/**
 * 静态探针：**立即执行 watcher 里摸 DOM** 是本仓反复出现的 SSR 崩溃形态。
 * ReadOnlyOverlay 的 `document.activeElement`（#506）就藏在 `immediate: true` 的
 * watch 回调里 —— setup 阶段同步执行，SSR 无 document 时抛 ReferenceError。
 *
 * 本 spec 把这个形态变成可机械复查的清单：列出所有 `immediate: true` 的 watcher，
 * 断言**当前已知安全**（无裸 document/window/localStorage）或已在 ssr-smoke 清单里。
 * 新加的 immediate watcher 若摸了 DOM 又没进冒烟，这里会红 —— 补冒烟或加守卫即绿。
 *
 * ⚠️ 头部那个环境指令必须**放在文件第一行注释块**（本仓既有约定），
 * 且**散文里不能再出现这个指令的字面形状** —— 否则 Vitest 会把散文当指令读
 * （§9.5x 的踩坑记录）。
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** 这些组件已在 ssr-smoke.spec.ts 的清单里（真实 SSR 渲染过，实证安全） */
const SMOKE_COVERED = new Set([
  'ModalShell',
  'ReadOnlyOverlay',
  'StorageConfigPanel',
  'DataTable',
  'Chart',
  'FormShareView',
  'FormDesigner',
  'FormCollect',
])

/** 已知安全：watcher 体内无裸 DOM / 存储 API（人工核过） */
const KNOWN_SAFE = new Set(['InputOTP', 'Pagination', 'Drawer'])

const files = []
function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.vue')) files.push(p)
  }
}
walk('src/components')

describe('SSR · immediate watcher 的 DOM 访问静态判据（#506）', () => {
  it('每个 immediate watcher：要么体内无裸 DOM/存储 API，要么组件已进 SSR 冒烟清单', () => {
    const offenders = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      const name = f.split(/[\\/]/).pop().replace('.vue', '')
      const scriptEnd = src.indexOf('</script>')
      const script = scriptEnd > 0 ? src.slice(0, scriptEnd) : ''
      // 取每个 `immediate: true` 之前的一段窗口当作"这个 watcher 的上下文"。
      //
      // ⚠️ 早先用 `/watch\([^]*?\{ immediate: true[^]*?\}\)/` 匹配 —— **一条都没匹配上**
      // （`immediate: true` 后面通常还隔着 `},\n)`），于是判据是个**假绿灯**：
      // 用例全绿，却什么都没查。本文件第一版就踩了这个坑，已改成窗口法并加了自检。
      const re = /immediate: true/g
      let m
      while ((m = re.exec(script))) {
        const body = script.slice(Math.max(0, m.index - 2000), m.index)
        const touches =
          /\bdocument\./.test(body) || /\bwindow\./.test(body) || /\blocalStorage\b/.test(body) || /\bsessionStorage\b/.test(body)
        if (touches && !SMOKE_COVERED.has(name) && !KNOWN_SAFE.has(name)) {
          offenders.push(`${name} (${f})`)
        }
      }
    }
    expect(
      offenders,
      `immediate watcher 摸 DOM 但组件未进 SSR 冒烟、也未登记为已知安全：\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })

  it('**判据自检：窗口法必须真的能命中 immediate watcher**（防假绿灯）', () => {
    const src = readFileSync('src/components/feedback/ReadOnlyOverlay.vue', 'utf8')
    const script = src.slice(0, src.indexOf('</script>'))
    const hits = [...script.matchAll(/immediate: true/g)]
    expect(hits.length, 'ReadOnlyOverlay 里至少有一个 immediate watcher').toBeGreaterThan(0)
    const body = script.slice(Math.max(0, hits[0].index - 2000), hits[0].index)
    expect(body, '窗口必须覆盖到 watcher 体内的 document 访问').toMatch(/document\./)
  })

  it('判据自检：清单里的组件若被删出冒烟名单，本文件要同步（防止签名漂移）', () => {
    // 读 ssr-smoke.spec.ts，确认 SMOKE_COVERED 里的组件真的还在冒烟清单
    const smoke = readFileSync('tests/unit/ssr-smoke.spec.ts', 'utf8')
    for (const name of SMOKE_COVERED) {
      expect(smoke.includes(name), `${name} 应仍在 ssr-smoke 清单里`).toBe(true)
    }
  })
})
