/**
 * nav-schema —— 用户自建导航配置的**校验契约**（不可信输入的第一道闸）
 *
 * 这是低代码导航愿景里唯一"必须挡住"的地方：导航定义不是源码，是可能由后端下发、
 * 或被用户改过的**数据**。两种失败都不能接受 ——「一个错字整站白屏」与「静默过滤坏项
 * （用户配了没生效还查不出为什么）」。所以本 spec 的重心是：
 *   · 每一项被拒时，**既有可用项、也有可定位的问题**（path + code + 文案）
 *   · 安全面（link/URL）单独成组，逐个把已知走私写法钉死
 *   · 上限（深度/总数）有明确边界值测试，不是"我觉得够用"
 */
import { describe, it, expect, vi } from 'vitest'
import {
  parseNavSchema,
  flattenNavNodes,
  findNavNode,
  firstSelectableNode,
  isSafeNavUrl,
  isExternalNavUrl,
  type NavNode,
} from '@/components/form-builder/lowcode/nav-schema'
import { policyFromOrigins } from '@/components/form-builder/api-url-guard'

const keys = (nodes: readonly NavNode[]) => nodes.map((n) => n.key)
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code)

describe('nav-schema · 根形状', () => {
  it('**接受 { items: [...] } 与裸数组两种写法**（后端下发两种都常见）', () => {
    const a = parseNavSchema({ items: [{ key: 'a', label: 'A', kind: 'custom' }] })
    const b = parseNavSchema([{ key: 'a', label: 'A', kind: 'custom' }])
    expect(keys(a.nodes)).toEqual(['a'])
    expect(keys(b.nodes)).toEqual(['a'])
    expect(a.issues).toEqual([])
  })

  it('**非对象/数组根 → root-shape 且不抛**', () => {
    for (const bad of [null, undefined, 'x', 42, {}, { items: 'x' }, { items: {} }]) {
      const r = parseNavSchema(bad)
      expect(r.nodes).toEqual([])
      expect(codes(r)).toEqual(['root-shape'])
    }
  })
})

describe('nav-schema · key 与 label', () => {
  it('**缺 key 的项被丢弃并记位置**（key 是选中态与路由的稳定锚点）', () => {
    const r = parseNavSchema([{ label: 'A', kind: 'custom' }, { key: '  ', label: 'B', kind: 'custom' }])
    expect(r.nodes).toEqual([])
    expect(codes(r)).toEqual(['missing-key', 'missing-key'])
    expect(r.issues[0]!.path).toBe('items[0]')
    expect(r.issues[1]!.path).toBe('items[1]')
  })

  it('**key 去空白后仍须唯一；重复 key 只留第一个**（否则选中态错乱）', () => {
    const r = parseNavSchema([
      { key: ' a ', label: 'A', kind: 'custom' },
      { key: 'a', label: 'A2', kind: 'custom' },
    ])
    expect(keys(r.nodes)).toEqual(['a'])
    expect(codes(r)).toEqual(['duplicate-key'])
    expect(r.issues[0]!.message).toContain('"a"')
  })

  it('**key 唯一性是全局的（跨分组也算重复）**', () => {
    const r = parseNavSchema([
      { key: 'g', label: 'G', kind: 'group', children: [{ key: 'x', label: 'X', kind: 'custom' }] },
      { key: 'x', label: 'X2', kind: 'custom' },
    ])
    expect(keys(r.nodes)).toEqual(['g'])
    expect(codes(r)).toEqual(['duplicate-key'])
  })

  it('**缺 label → 记问题但保留项，暂用 key 展示**（凑合能用 + 问题可见，比整项消失好）', () => {
    const r = parseNavSchema([{ key: 'a', kind: 'custom' }, { key: 'b', label: '  ', kind: 'custom' }])
    expect(keys(r.nodes)).toEqual(['a', 'b'])
    expect(r.nodes.map((n) => n.label)).toEqual(['a', 'b'])
    expect(codes(r)).toEqual(['missing-label', 'missing-label'])
  })

  it('**label 去空白**', () => {
    const r = parseNavSchema([{ key: 'a', label: '  订单  ', kind: 'custom' }])
    expect(r.nodes[0]!.label).toBe('订单')
  })

  it('**缺 label 的问题代码与缺 key 不同**（宿主能分别提示）', () => {
    expect(codes(parseNavSchema([{ key: 'a', kind: 'custom' }]))).toEqual(['missing-label'])
    expect(codes(parseNavSchema([{ label: 'a', kind: 'custom' }]))).toEqual(['missing-key'])
  })
})

describe('nav-schema · kind 判定', () => {
  it('**五种 kind 全部接受**，未知 kind 丢弃并列出可选值', () => {
    const ok = parseNavSchema([
      { key: 'g', label: 'G', kind: 'group', children: [{ key: 'f', label: 'F', kind: 'form', formId: 'f1' }] },
      { key: 'd', label: 'D', kind: 'data' },
      { key: 'l', label: 'L', kind: 'link', url: '/x' },
      { key: 'c', label: 'C', kind: 'custom' },
    ])
    expect(keys(ok.nodes)).toEqual(['g', 'd', 'l', 'c'])
    expect(ok.issues).toEqual([])

    const bad = parseNavSchema([{ key: 'x', label: 'X', kind: 'table' }])
    expect(bad.nodes).toEqual([])
    expect(codes(bad)).toEqual(['unknown-kind'])
    expect(bad.issues[0]!.message).toContain('group / form / data / link / custom')
  })

  it('**kind 非字符串同样按未知处理**', () => {
    expect(codes(parseNavSchema([{ key: 'x', label: 'X', kind: 7 }]))).toEqual(['unknown-kind'])
    expect(codes(parseNavSchema([{ key: 'x', label: 'X' }]))).toEqual(['unknown-kind'])
  })

  it('**非对象项被跳过（数组里混进 null / 字符串）**', () => {
    const r = parseNavSchema([null, 'x', [], { key: 'ok', label: 'OK', kind: 'custom' }])
    expect(keys(r.nodes)).toEqual(['ok'])
    expect(codes(r)).toEqual(['not-object', 'not-object', 'not-object'])
  })
})

describe('nav-schema · 分组与嵌套上限', () => {
  it('**分组递归解析子项**', () => {
    const r = parseNavSchema([
      {
        key: 'g',
        label: '业务',
        kind: 'group',
        children: [
          { key: 'a', label: 'A', kind: 'custom' },
          { key: 'b', label: 'B', kind: 'custom' },
        ],
      },
    ])
    const g = r.nodes[0] as Extract<NavNode, { kind: 'group' }>
    expect(g.kind).toBe('group')
    expect(keys(g.children)).toEqual(['a', 'b'])
  })

  it('**空分组 / 缺 children / children 非数组 → 丢弃并说明"死菜单"**', () => {
    for (const children of [undefined, [], 'x', {}]) {
      const r = parseNavSchema([{ key: 'g', label: 'G', kind: 'group', children }])
      expect(r.nodes).toEqual([])
      expect(codes(r)).toEqual(['group-empty'])
    }
  })

  it('**默认只允许 2 层；更深的分组被丢弃并记 too-deep**', () => {
    const r = parseNavSchema([
      {
        key: 'g1',
        label: 'G1',
        kind: 'group',
        children: [
          {
            key: 'g2',
            label: 'G2',
            kind: 'group',
            children: [{ key: 'deep', label: 'D', kind: 'custom' }],
          },
        ],
      },
    ])
    const g1 = r.nodes[0] as Extract<NavNode, { kind: 'group' }>
    expect(keys(g1.children)).toEqual([]) // 第二层分组被拒
    expect(codes(r)).toEqual(['too-deep'])
    expect(r.issues[0]!.path).toBe('items[0].children[0]')
  })

  it('**maxDepth 可放宽到 3 层**（边界值，不是"差不多"）', () => {
    const deep = [
      {
        key: 'g1',
        label: 'G1',
        kind: 'group',
        children: [
          {
            key: 'g2',
            label: 'G2',
            kind: 'group',
            children: [{ key: 'leaf', label: 'L', kind: 'custom' }],
          },
        ],
      },
    ]
    const r = parseNavSchema(deep, { maxDepth: 3 })
    expect(r.issues).toEqual([])
    const g1 = r.nodes[0] as Extract<NavNode, { kind: 'group' }>
    const g2 = g1.children[0] as Extract<NavNode, { kind: 'group' }>
    expect(keys(g2.children)).toEqual(['leaf'])
  })
})

describe('nav-schema · 表单页', () => {
  it('**formId 或内联 schema 二者之一即可**', () => {
    const r = parseNavSchema([
      { key: 'a', label: 'A', kind: 'form', formId: 'f1' },
      { key: 'b', label: 'B', kind: 'form', schema: { fields: [] } },
    ])
    expect(r.issues).toEqual([])
    expect(r.nodes[0]).toMatchObject({ kind: 'form', formId: 'f1' })
    expect(r.nodes[1]).toMatchObject({ kind: 'form', schema: { fields: [] } })
  })

  it('**两者都缺 → 丢弃并说明需要 formId 或 schema**', () => {
    const r = parseNavSchema([{ key: 'a', label: 'A', kind: 'form' }])
    expect(r.nodes).toEqual([])
    expect(codes(r)).toEqual(['missing-form-source'])
  })

  it('**schema 非纯对象（数组/字符串/null）按缺失处理**（形状判定，不解释内容）', () => {
    for (const schema of [[], 'x', null, 1]) {
      const r = parseNavSchema([{ key: 'a', label: 'A', kind: 'form', schema }])
      expect(codes(r)).toEqual(['missing-form-source'])
    }
  })

  it('**formId 去空白；空白串按缺失处理**', () => {
    const r = parseNavSchema([{ key: 'a', label: 'A', kind: 'form', formId: '  f9  ' }])
    expect(r.nodes[0]).toMatchObject({ formId: 'f9' })
    expect(codes(parseNavSchema([{ key: 'a', label: 'A', kind: 'form', formId: '   ' }]))).toEqual([
      'missing-form-source',
    ])
  })
})

describe('nav-schema · 数据页与三模式数据源', () => {
  it('**数据页可以没有数据源（空态是合法的）**', () => {
    const r = parseNavSchema([{ key: 'd', label: 'D', kind: 'data' }])
    expect(r.nodes[0]).toEqual({ key: 'd', label: 'D', kind: 'data' })
    expect(r.issues).toEqual([])
  })

  it('**static 模式透传 staticData**', () => {
    const r = parseNavSchema([
      { key: 'd', label: 'D', kind: 'data', display: { kind: 'static', staticData: [{ a: 1 }] } },
    ])
    expect(r.nodes[0]).toMatchObject({ display: { kind: 'static', staticData: [{ a: 1 }] } })
    expect(r.issues).toEqual([])
  })

  it('**field 模式透传 fieldKey（缺 fieldKey 也是合法：展示层给空）**', () => {
    const r = parseNavSchema([
      { key: 'd1', label: 'D1', kind: 'data', display: { kind: 'field', fieldKey: 'items' } },
      { key: 'd2', label: 'D2', kind: 'data', display: { kind: 'field' } },
    ])
    expect(r.nodes[0]).toMatchObject({ display: { kind: 'field', fieldKey: 'items' } })
    expect(r.nodes[1]).toMatchObject({ display: { kind: 'field' } })
    expect(r.issues).toEqual([])
  })

  it('**api 同源 → 通过；跨源默认被拒但仍保留页签**（页签消失比"数据地址被拒"更难查）', () => {
    const same = parseNavSchema([{ key: 'd', label: 'D', kind: 'data', display: { kind: 'api', apiUrl: '/api/x' } }])
    expect(same.issues).toEqual([])

    const cross = parseNavSchema([
      { key: 'd', label: 'D', kind: 'data', display: { kind: 'api', apiUrl: 'https://evil.com/x' } },
    ])
    expect(codes(cross)).toEqual(['display-rejected'])
    expect(cross.nodes, '页签保留').toHaveLength(1)
    expect(cross.nodes[0]).toMatchObject({ display: { kind: 'api', apiUrl: 'https://evil.com/x' } })
    expect(cross.issues[0]!.path).toBe('items[0].display')
  })

  it('**宿主显式放行的来源 → 不再记问题**（策略从宿主来，不硬编码）', () => {
    const r = parseNavSchema(
      [{ key: 'd', label: 'D', kind: 'data', display: { kind: 'api', apiUrl: 'https://api.mycorp.com/x' } }],
      { apiUrlPolicy: policyFromOrigins(['https://api.mycorp.com']) },
    )
    expect(r.issues).toEqual([])
  })

  it('**api 缺 apiUrl → 记问题，数据源仍在**（运行时给"未配置接口地址"）', () => {
    const r = parseNavSchema([{ key: 'd', label: 'D', kind: 'data', display: { kind: 'api' } }])
    expect(codes(r)).toEqual(['display-rejected'])
    expect(r.nodes[0]).toMatchObject({ display: { kind: 'api', apiUrl: '' } })
  })

  it('**display 的 kind 未知 / 非对象 → 丢弃数据源但保留页签**', () => {
    const r = parseNavSchema([
      { key: 'd1', label: 'D1', kind: 'data', display: { kind: 'graphql' } },
      { key: 'd2', label: 'D2', kind: 'data', display: 'x' },
      { key: 'd3', label: 'D3', kind: 'data', display: 3 },
    ])
    expect(keys(r.nodes)).toEqual(['d1', 'd2', 'd3'])
    expect(r.nodes.every((n) => !('display' in n) || n.display === undefined)).toBe(true)
    expect(codes(r)).toEqual(['display-rejected', 'display-rejected', 'display-rejected'])
  })

  it('**display 的 method / body / dataPath 透传（只认已知值）**', () => {
    const r = parseNavSchema([
      {
        key: 'd',
        label: 'D',
        kind: 'data',
        display: { kind: 'api', apiUrl: '/api/x', method: 'POST', body: { q: 1 }, dataPath: 'data.rows' },
      },
      { key: 'e', label: 'E', kind: 'data', display: { kind: 'api', apiUrl: '/api/y', method: 'PUT' } },
    ])
    expect(r.nodes[0]).toMatchObject({ display: { method: 'POST', body: { q: 1 }, dataPath: 'data.rows' } })
    expect((r.nodes[1] as Extract<NavNode, { kind: 'data' }>).display).not.toHaveProperty('method')
  })

  it('**columns 只在是数组时透传**', () => {
    const r = parseNavSchema([
      { key: 'd1', label: 'D1', kind: 'data', columns: [{ key: 'a' }] },
      { key: 'd2', label: 'D2', kind: 'data', columns: 'x' },
    ])
    expect(r.nodes[0]).toMatchObject({ columns: [{ key: 'a' }] })
    expect((r.nodes[1] as Extract<NavNode, { kind: 'data' }>).columns).toBeUndefined()
  })
})

describe('nav-schema · 链接安全（XSS 面，逐个钉死）', () => {
  it('**站内相对路径全部放行**', () => {
    for (const url of ['/orders', '#top', './a', '../a', '/a?b=1#c']) {
      expect(isSafeNavUrl(url), url).toBe(true)
      expect(parseNavSchema([{ key: 'l', label: 'L', kind: 'link', url }]).issues, url).toEqual([])
    }
  })

  it('**http/https 绝对地址放行（含大写协议头）**', () => {
    for (const url of ['https://x.com/a', 'http://x.com', 'HTTPS://X.COM/a']) {
      expect(isSafeNavUrl(url), url).toBe(true)
    }
  })

  it('**javascript: / vbscript: / data: / file: 一律拒绝**', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'vbscript:msgbox',
      'data:text/html,<script>x</script>',
      'file:///etc/passwd',
    ]) {
      expect(isSafeNavUrl(url), url).toBe(false)
      const r = parseNavSchema([{ key: 'l', label: 'L', kind: 'link', url }])
      expect(r.nodes, url).toEqual([])
      expect(codes(r), url).toEqual(['unsafe-url'])
    }
  })

  it('**协议相对 `//host` 被拒**（静默升到别人域的经典走私写法）', () => {
    expect(isSafeNavUrl('//evil.com/x')).toBe(false)
    expect(codes(parseNavSchema([{ key: 'l', label: 'L', kind: 'link', url: '//evil.com/x' }]))).toEqual(['unsafe-url'])
    expect(codes(parseNavSchema([{ key: 'l', label: 'L', kind: 'link', url: '//' }]))).toEqual(['unsafe-url'])
  })

  it('**非 http(s) 的"合法 URL"（mailto / ftp / tel）不得被当成跨源外链**', () => {
    // 这些能通过 new URL()，只靠"解析成功再比 origin"会把 mailto 判成 external → 错；
    // 挡住它的是前置的 http(s) 协议白名单，必须有例钉住（负向对照证实该分支会存活）
    for (const url of ['mailto:a@b.com', 'ftp://x/y', 'tel:+8610', 'blob:https://x/y']) {
      expect(isExternalNavUrl(url, 'https://mine.com'), url).toBe(false)
      expect(isSafeNavUrl(url), url).toBe(false)
    }
  })

  it('**空串 / 全空白 → 不安全（trim 后为空）**', () => {
    expect(isSafeNavUrl('')).toBe(false)
    expect(isSafeNavUrl('   ')).toBe(false)
  })

  it('**能过协议正则、但 URL 解析失败的畸形地址 → 非同源（catch 分支，保守）**', () => {
    // `https://` 满足 /^https?:\/\// 却过不了 new URL() —— 不抛给调用方，保守返回 false
    expect(isExternalNavUrl('https://', 'https://mine.com')).toBe(false)
    expect(isExternalNavUrl('https://mine.com/a', '::不是 URL::')).toBe(false)
  })

  it('**前导空白先 trim 再判定**（` javascript:` 不能绕过）', () => {
    expect(isSafeNavUrl('   javascript:alert(1)')).toBe(false)
    expect(isSafeNavUrl('\n\t/data')).toBe(true)
  })

  it('**缺 url / 空 url → missing-url；不安全 → unsafe-url**（两种代码不混）', () => {
    expect(codes(parseNavSchema([{ key: 'l', label: 'L', kind: 'link' }]))).toEqual(['missing-url'])
    expect(codes(parseNavSchema([{ key: 'l', label: 'L', kind: 'link', url: '  ' }]))).toEqual(['missing-url'])
    expect(codes(parseNavSchema([{ key: 'l', label: 'L', kind: 'link', url: 'ftp://x/y' }]))).toEqual(['unsafe-url'])
  })

  it('**url 去空白后透传**', () => {
    const r = parseNavSchema([{ key: 'l', label: 'L', kind: 'link', url: '  /orders  ' }])
    expect(r.nodes[0]).toMatchObject({ url: '/orders' })
  })

  it('**isExternalNavUrl：跨源为真、同源与相对为假、拿不到 base 时不妄断**', () => {
    expect(isExternalNavUrl('https://other.com/a', 'https://mine.com')).toBe(true)
    expect(isExternalNavUrl('https://mine.com/a', 'https://mine.com')).toBe(false)
    expect(isExternalNavUrl('/a', 'https://mine.com')).toBe(false)
    // 不传 base 时回落 location.origin（测试环境有 location，所以能判真）
    expect(isExternalNavUrl('https://other.com/a')).toBe(true)
    // 既没 base 也没有 location（SSR/Node）→ 保守返回 false，交渲染层按保守策略处理
    vi.stubGlobal('location', undefined)
    expect(isExternalNavUrl('https://other.com/a')).toBe(false)
  })
})

describe('nav-schema · 自定义页与公共字段', () => {
  it('**custom 透传 payload；没有 payload 时不留 undefined 键**', () => {
    const r = parseNavSchema([
      { key: 'c1', label: 'C1', kind: 'custom', payload: { widget: 'chart' } },
      { key: 'c2', label: 'C2', kind: 'custom' },
    ])
    expect(r.nodes[0]).toMatchObject({ payload: { widget: 'chart' } })
    expect(Object.keys(r.nodes[1]!)).not.toContain('payload')
  })

  it('**icon / requiredPermission / badge 只在非空字符串时透传**', () => {
    const r = parseNavSchema([
      { key: 'a', label: 'A', kind: 'custom', icon: 'home', requiredPermission: 'p1', badge: '新' },
      { key: 'b', label: 'B', kind: 'custom', icon: '', requiredPermission: '', badge: '' },
      { key: 'c', label: 'C', kind: 'custom', icon: 3 },
    ])
    expect(r.nodes[0]).toMatchObject({ icon: 'home', requiredPermission: 'p1', badge: '新' })
    expect(Object.keys(r.nodes[1]!)).toEqual(['key', 'label', 'kind'])
    expect(Object.keys(r.nodes[2]!)).toEqual(['key', 'label', 'kind'])
  })
})

describe('nav-schema · 数量上限与检索工具', () => {
  it('**maxNodes 截断并记 too-many（默认 200）**', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, label: `K${i}`, kind: 'custom' }))
    const r = parseNavSchema(many, { maxNodes: 3 })
    expect(keys(r.nodes)).toEqual(['k0', 'k1', 'k2'])
    expect(codes(r)).toEqual(['too-many'])
    expect(parseNavSchema(many).nodes).toHaveLength(6)
  })

  it('**flattenNavNodes 前序展开且不含分组**', () => {
    const r = parseNavSchema([
      { key: 'g', label: 'G', kind: 'group', children: [{ key: 'a', label: 'A', kind: 'custom' }] },
      { key: 'b', label: 'B', kind: 'custom' },
    ])
    expect(flattenNavNodes(r.nodes).map((n) => n.key)).toEqual(['a', 'b'])
  })

  it('**findNavNode 找到嵌套项，找不到返回 null**', () => {
    const r = parseNavSchema([
      { key: 'g', label: 'G', kind: 'group', children: [{ key: 'a', label: 'A', kind: 'custom' }] },
    ])
    expect(findNavNode(r.nodes, 'a')?.label).toBe('A')
    expect(findNavNode(r.nodes, 'g')?.kind).toBe('group')
    expect(findNavNode(r.nodes, 'nope')).toBeNull()
  })

  it('**firstSelectableNode：跳过分组取第一个叶子；只有分组/空导航时返回 null**', () => {
    const onlyGroup = parseNavSchema([
      { key: 'g', label: 'G', kind: 'group', children: [{ key: 'a', label: 'A', kind: 'custom' }] },
    ])
    expect(firstSelectableNode(onlyGroup.nodes)?.key).toBe('a')
    expect(firstSelectableNode([])).toBeNull()
    expect(firstSelectableNode([{ key: 'g', label: 'G', kind: 'group', children: [] } as NavNode])).toBeNull()
  })
})

/* ═══════════ 被拒项不得占用 key / 数量名额（第 185 轮） ═══════════
 *
 * `seen.add(key)` 与 `count++` 原先写在 kind 校验**之前**，而 form/link/group
 * 的校验失败会 `continue` 丢掉该项 —— 于是"被丢弃的项"仍占着 key 与 maxNodes 名额：
 *   · 坏项 + 同 key 好项 → 好项被误判 duplicate-key 丢弃（配了却不出现，还提示"重复"）；
 *   · 一堆空分组 → 吃掉 maxNodes 预算，后面的正常项被 too-many 截断。
 * 宿主拿到的配置可能来自自己的数据库，坏项与好项混排是很常见的形态。
 */
describe('nav-schema · 被拒项不占名额', () => {
  it('**坏项被拒后，同 key 的好项仍应保留**（不是 duplicate-key）', () => {
    const r = parseNavSchema([
      { key: 'a', kind: 'link', url: '' }, // 被拒：missing-url
      { key: 'a', label: 'A', kind: 'form', formId: 'f1' }, // 同 key，本应合法
    ])
    expect(keys(r.nodes), '好项不该因为前面有坏项而消失').toEqual(['a'])
    expect(codes(r), '不该报重复').not.toContain('duplicate-key')
    expect(codes(r), '坏项原因仍要可见').toContain('missing-url')
  })

  it('**被拒项不吃 maxNodes 预算**（空分组不应把后面的正常项截断）', () => {
    const r = parseNavSchema(
      [
        { key: 'g1', kind: 'group', children: [] }, // 被拒：group-empty
        { key: 'g2', kind: 'group', children: [] }, // 被拒
        { key: 'f1', label: 'F1', kind: 'form', formId: 'x' },
        { key: 'f2', label: 'F2', kind: 'form', formId: 'y' },
      ],
      { maxNodes: 2 },
    )
    expect(keys(r.nodes), '两个正常项都应保留').toEqual(['f1', 'f2'])
    expect(codes(r), '不该报超限').not.toContain('too-many')
  })

  it('**被拒的分组也不占 key**（同 key 的合法叶子仍能出现）', () => {
    const r = parseNavSchema([
      { key: 'x', kind: 'group', children: [] }, // 被拒
      { key: 'x', label: 'X', kind: 'custom' }, // 同 key 合法
    ])
    expect(keys(r.nodes)).toEqual(['x'])
    expect(codes(r)).not.toContain('duplicate-key')
  })

  it('**正常重复 key 仍然只留第一个**（回归：别把去重一起改坏；逐个 kind 都要占位）', () => {
    // 每种 kind 的"接收"分支都必须在接收时登记 key，否则同 key 的第二个会溜进来
    const valid: Record<string, Record<string, unknown>> = {
      custom: { key: 'a', label: 'A', kind: 'custom' },
      form: { key: 'a', label: 'A', kind: 'form', formId: 'f1' },
      link: { key: 'a', label: 'A', kind: 'link', url: '/x' },
      data: { key: 'a', label: 'A', kind: 'data' },
      group: { key: 'a', label: 'A', kind: 'group', children: [{ key: 'a-c', label: 'C', kind: 'custom' }] },
    }
    for (const [kind, first] of Object.entries(valid)) {
      const r = parseNavSchema([first, { ...first, label: 'A2' }])
      expect(keys(r.nodes), `${kind}：重复项应被丢弃`).toEqual(['a'])
      expect(codes(r), `${kind}：应报 duplicate-key`).toContain('duplicate-key')
    }
  })
})