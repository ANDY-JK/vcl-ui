/* demo 路由对账：孤立页 / 幽灵路由（#451）
 *
 * facts.md 的「演示页 46」是手工核算口径（50 个 Demo.vue 减外壳、减 3 个并页分段）。
 * 此前没有机械判据守住它：并页后遗留的旧 Demo.vue 仍躺在 src/demos 下，
 * 构建、单测、文档闸口全绿。
 *
 * 本 spec：真实树双向零问题 + 判据非空转 + 合成夹具。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  collectDemoFiles,
  collectReferences,
  reconcileDemoRoutes,
} from '../../scripts/check-demo-routes.mjs'

/** 用注入的 readFile 覆盖部分文件内容，其余读真实树 */
function probe(overrides) {
  const demoFiles = collectDemoFiles()
  const references = collectReferences({
    demoFiles,
    readFile: (p) => {
      if (p in overrides) return overrides[p]
      return readFileSync(join(process.cwd(), p), 'utf8')
    },
  })
  return reconcileDemoRoutes({ demoFiles, references })
}

describe('check:demo-routes real tree', () => {
  it('no orphans and no ghost routes', () => {
    const r = probe({})
    expect(r.ghosts, 'ghost: ' + r.ghosts.join(', ')).toEqual([])
    expect(r.orphans, 'orphan: ' + r.orphans.join(', ')).toEqual([])
  })

  it('scan covers enough demo pages', () => {
    expect(collectDemoFiles().length).toBeGreaterThan(40)
  })
})

describe('check:demo-routes fixtures', () => {
  it('reports an orphan page', () => {
    const r = reconcileDemoRoutes({
      demoFiles: ['src/demos/a/ADemo.vue', 'src/demos/b/BDemo.vue'],
      references: new Set(['src/demos/a/ADemo.vue']),
    })
    expect(r.orphans).toEqual(['src/demos/b/BDemo.vue'])
    expect(r.ghosts).toEqual([])
  })

  it('reports a ghost route to a missing .vue', () => {
    const r = reconcileDemoRoutes({
      demoFiles: ['src/demos/a/ADemo.vue'],
      references: new Set(['src/demos/a/ADemo.vue', 'src/demos/gone/GoneDemo.vue']),
    })
    expect(r.ghosts).toEqual(['src/demos/gone/GoneDemo.vue'])
    expect(r.orphans).toEqual([])
  })

  it('extensionless ts import is not a ghost demo route', () => {
    const r = reconcileDemoRoutes({
      demoFiles: ['src/demos/a/ADemo.vue'],
      references: new Set(['src/demos/a/ADemo.vue', 'src/demos/a/useThing', 'src/demos/a/demo-images']),
    })
    expect(r.ghosts).toEqual([])
  })

  it('counter-protection: a newly referenced page stops being an orphan', () => {
    const before = reconcileDemoRoutes({
      demoFiles: ['src/demos/a/ADemo.vue', 'src/demos/b/BDemo.vue'],
      references: new Set(['src/demos/a/ADemo.vue']),
    })
    expect(before.orphans).toEqual(['src/demos/b/BDemo.vue'])
    const after = reconcileDemoRoutes({
      demoFiles: ['src/demos/a/ADemo.vue', 'src/demos/b/BDemo.vue'],
      references: new Set(['src/demos/a/ADemo.vue', 'src/demos/b/BDemo.vue']),
    })
    expect(after.orphans).toEqual([])
  })
})
