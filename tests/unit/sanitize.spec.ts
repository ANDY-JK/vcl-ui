import { describe, it, expect, vi } from 'vitest'
import { sanitizeHTML } from '@/components/_internal/sanitize'

describe('sanitizeHTML · HTML 白名单消毒', () => {
  it('保留安全标签', () => {
    expect(sanitizeHTML('<b>加粗</b> <i>斜体</i>')).toBe('<b>加粗</b> <i>斜体</i>')
    expect(sanitizeHTML('<p>段落</p>')).toBe('<p>段落</p>')
    expect(sanitizeHTML('<h4>标题</h4>')).toBe('<h4>标题</h4>')
  })

  it('剥离 script/style 危险标签（含内容）', () => {
    expect(sanitizeHTML('<script>alert(1)</script>')).toBe('')
    expect(sanitizeHTML('<style>body{}</style>')).toBe('')
    expect(sanitizeHTML('文本<script>alert(1)</script>尾')).toBe('文本尾')
  })

  it('剥离事件属性', () => {
    // x.png 不是白名单协议，src 也会被剥离，仅验证 onerror 被去除（img 保留）
    expect(sanitizeHTML('<img src="x.png" onerror="alert(1)">')).toBe('<img>')
    expect(sanitizeHTML('<a href="#" onclick="evil()">链接</a>')).toBe('<a href="#">链接</a>')
  })

  it('剥离 javascript: 链接', () => {
    expect(sanitizeHTML('<a href="javascript:alert(1)">点我</a>')).toBe('<a>点我</a>')
    expect(sanitizeHTML('<img src="javascript:alert(1)">')).toBe('<img>')
  })

  it('保留安全链接', () => {
    expect(sanitizeHTML('<a href="https://example.com">官网</a>')).toBe('<a href="https://example.com">官网</a>')
    expect(sanitizeHTML('<a href="mailto:a@b.com">邮件</a>')).toBe('<a href="mailto:a@b.com">邮件</a>')
    expect(sanitizeHTML('<a href="#anchor">锚点</a>')).toBe('<a href="#anchor">锚点</a>')
  })

  it('剥离危险 CSS（expression/javascript:/@import）', () => {
    expect(sanitizeHTML('<div style="background: expression(alert(1))">x</div>')).toBe('<div>x</div>')
    expect(sanitizeHTML('<div style="background: url(javascript:alert(1))">x</div>')).toBe('<div>x</div>')
  })

  it('拦截 CSS 外链资源（绝对地址/协议相对地址）', () => {
    expect(sanitizeHTML('<div style="background: url(https://evil.com/track.png)">x</div>')).toBe('<div>x</div>')
    expect(sanitizeHTML('<div style="background: url(&quot;https://evil.com/x.png&quot;)">x</div>')).toBe(
      '<div>x</div>',
    )
    expect(sanitizeHTML('<div style="background: url(//evil.com/track.png)">x</div>')).toBe('<div>x</div>')
    expect(sanitizeHTML('<div style="list-style: url(http://evil.com/b.gif)">x</div>')).toBe('<div>x</div>')
  })

  it('保留 CSS 相对路径与 data:image 资源', () => {
    expect(sanitizeHTML('<div style="background: url(img/bg.png)">x</div>')).toBe(
      '<div style="background: url(img/bg.png)">x</div>',
    )
    expect(sanitizeHTML('<div style="background: url(data:image/png;base64,iVBOR)">x</div>')).toBe(
      '<div style="background: url(data:image/png;base64,iVBOR)">x</div>',
    )
  })

  it('带 target 的链接强制补 rel=noopener（防 reverse tabnabbing）', () => {
    expect(sanitizeHTML('<a href="https://example.com" target="_blank">新窗口</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">新窗口</a>',
    )
    // 无 target 不加 rel；攻击者自带 rel 也会被覆写为安全值
    expect(sanitizeHTML('<a href="https://example.com" rel="opener" target="_blank">覆写</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">覆写</a>',
    )
    expect(sanitizeHTML('<a href="https://example.com">普通链接</a>')).toBe(
      '<a href="https://example.com">普通链接</a>',
    )
  })

  it('保留安全 style', () => {
    expect(sanitizeHTML('<span style="color: red">红</span>')).toBe('<span style="color: red">红</span>')
  })

  it('非白名单标签剥离但保留文本内容', () => {
    expect(sanitizeHTML('<custom-tag>保留文本</custom-tag>')).toBe('保留文本')
  })

  it('危险标签整体移除（含嵌套内容）', () => {
    expect(sanitizeHTML('<iframe src="evil"></iframe>')).toBe('')
    expect(sanitizeHTML('<object><script>x</script></object>')).toBe('')
  })

  it('处理空串与无 document 环境', () => {
    expect(sanitizeHTML('')).toBe('')
  })
})

describe('sanitizeHTML · SSR（无 DOM 环境）', () => {
  it('无 document 时返回转义纯文本而非原样 HTML，并告警', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('document', undefined)
    try {
      const out = sanitizeHTML('<img src=x onerror=alert(1)>')
      // 关键：绝不能把未消毒的 HTML 原样吐回（否则 SSR 渲染即 XSS 注入点）
      expect(out).not.toContain('<img')
      expect(out).toBe('&lt;img src=x onerror=alert(1)&gt;')
      expect(warnSpy).toHaveBeenCalled()
      expect(String(warnSpy.mock.calls[0][0])).toContain('SSR')
    } finally {
      vi.unstubAllGlobals()
      warnSpy.mockRestore()
    }
  })

  it('SSR 下空串仍返回空串', () => {
    vi.stubGlobal('document', undefined)
    try {
      expect(sanitizeHTML('')).toBe('')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('sanitizeHTML · 对抗性回归（M10：攻击向量冻结）', () => {
  /**
   * 安全不变式按「消费端真实行为」判定：v-html 会把产物重新解析成 DOM，
   * 所以对消毒产物做一次再解析，断言再解析后的树里不存在可执行面。
   * 字符串正则做不到这点——被转义成文本的 `<script`（&lt;script）是安全的，
   * 字符串包含却会误报，再解析则天然正确。
   */
  const reparseInvariants = (out: string) => {
    const probe = document.createElement('div')
    probe.innerHTML = out
    expect(probe.querySelector('script, iframe, object, embed, base, form, meta, link')).toBeNull()
    probe.querySelectorAll('*').forEach((node) => {
      for (const attr of node.getAttributeNames()) {
        expect(attr.startsWith('on'), `残留事件属性 ${attr}`).toBe(false)
        if (attr === 'href' || attr === 'src') {
          const v = (node.getAttribute(attr) || '').toLowerCase().replace(/\s+/g, '')
          expect(v, `危险协议 ${attr}=${v}`).not.toMatch(/^(javascript|vbscript|data:text\/html)/)
        }
      }
    })
  }

  // 每条载荷断言「消毒产物再解析后无执行面」，而非具体输出形状——
  // 锁的是安全性质不是实现细节，实现重构时不必逐条改断言。
  const PAYLOADS = [
    // 事件属性：大小写混淆 / 未加引号
    '<img src=x ONERROR=alert(1)>',
    '<img src=x OnErRoR=alert(1)>',
    '<a href="#" ONCLICK="evil()">x</a>',
    // javascript: 变体：大小写 / 实体编码 / 控制字符穿插 / &colon; / 前导空白
    '<a href="JaVaScRiPt:alert(1)">x</a>',
    '<a href="&#106;avascript:alert(1)">x</a>',
    '<a href="jav&#x09;ascript:alert(1)">x</a>',
    '<a href="javascript&colon;alert(1)">x</a>',
    '<a href=" \tjavascript:alert(1)">x</a>',
    '<img src="jav&#x0A;ascript:alert(1)">',
    // data: 协议边界：href 不放行任何 data:，src 仅放行 data:image/
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    '<a href="data:image/png;base64,iVBOR">x</a>',
    '<img src="data:text/html;base64,PHNjcmlwdD4=">',
    // 危险标签整体移除（含 base/meta/link 这类无内容注入面）
    '<form action="javascript:alert(1)"><input type=submit></form>',
    '<button onclick="alert(1)">x</button>',
    '<input onfocus=alert(1) autofocus>',
    '<base href="https://evil.com/">',
    '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
    '<link rel="stylesheet" href="https://evil.com/x.css">',
    // 嵌套/畸形：解析器归一后必须仍能消毒
    '<scr<script>ipt>alert(1)</scr</script>ipt>',
    '<img src="x" onerror="alert(1)"',
    '<<script>alert(1)//<</script>',
    // SVG/MathML 外来内容：命名空间内标签为小写、不匹配大写白名单 → 解包为纯文本
    '<svg><script>alert(1)</script></svg>',
    '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
    '<math><mtext><script>alert(1)</script></mtext></math>',
    // template 内容挂在 content fragment 上、不进 childNodes → 整体丢弃
    '<template><img src=x onerror=alert(1)></template>',
    // 经典 mXSS 载荷（DOMPurify 历史漏洞同型）：解析→消毒→序列化→再解析不得复活
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>"></svg>',
    '<p title="&lt;img src=x onerror=alert(1)&gt;">双编码进属性值</p>',
    // style 危险值：注释混淆变体（对应 sanitize.ts 的剥注释预检）
    '<div style="background:url(/*x*/ javascript:alert(1))">x</div>',
    '<div style="width:expression/*x*/(alert(1))">x</div>',
    '<div style="background:url(&quot;javascript:alert(1)&quot;)">x</div>',
    '<div style="behavior:url(evil.htc)">x</div>',
    '<div style="-moz-binding:url(evil.xml)">x</div>',
    '<div style="background:url(vbscript:alert(1))">x</div>',
  ]

  it.each(PAYLOADS)('不复活可执行标记：%s', (payload) => {
    reparseInvariants(sanitizeHTML(payload))
  })

  it('合成大载荷（向量叠加）也不复活', () => {
    const combo = [
      '<b>正常<b>加粗</b></b>',
      '<a href="https://ok.com" target="_blank">外链</a>',
      '<svg><script>alert(1)</script></svg>',
      '<img src=x ONERROR=alert(1)>',
      '<style>body{}</style>',
      '<template><iframe src=evil></iframe></template>',
    ].join('')
    reparseInvariants(sanitizeHTML(combo))
    // 正常内容同时必须存活（消毒不能误杀成空串）
    const out = sanitizeHTML(combo)
    expect(out).toContain('加粗')
    expect(out).toContain('外链')
  })

  it('良性复杂 HTML 原样保留（防误杀回归）', () => {
    const good =
      '<table><thead><tr><th>列</th></tr></thead><tbody><tr><td><b>粗</b><img src="https://a.com/b.png" alt="图"></td></tr></tbody></table>'
    expect(sanitizeHTML(good)).toBe(good)
  })
})
/* ════════════════════════════════════════
 * 覆盖式钓鱼（#281）
 *
 * 本库展示的是**表单收集来的用户数据**。允许 `style` 时，一段固定定位的样式就能
 * 盖住整个应用伪造登录框骗取密码 —— 这不是"样式跑偏"，是可利用的攻击面。
 * 定位与层级属性对"展示一段文本"没有必要性，一律拦掉。
 * ════════════════════════════════════════ */
describe('拦截覆盖式钓鱼样式', () => {
  it('**全屏覆盖层被剥离 style**（position:fixed + inset + z-index 组合）', () => {
    const evil =
      '<span style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:#fff;z-index:9999">登录已过期，请重新输入密码</span>'
    const out = sanitizeHTML(evil)
    expect(out, '不得保留定位/层级').not.toMatch(/position\s*:/i)
    expect(out).not.toMatch(/z-index\s*:/i)
    expect(out, '文本内容保留（只剥样式）').toContain('登录已过期')
  })

  it.each([
    ['position:fixed', '<div style="position:fixed">x</div>'],
    ['position:absolute', '<div style="position:absolute">x</div>'],
    ['position:sticky', '<div style="position:sticky">x</div>'],
    ['inset:0', '<div style="inset:0">x</div>'],
    ['z-index:9999', '<div style="z-index:9999">x</div>'],
  ])('%s 被剥离', (_label, html) => {
    expect(sanitizeHTML(html)).not.toMatch(/style=/i)
  })

  // #396：CSS 支持转义，`z-\69 ndex` 在浏览器里就是 `z-index`。裸正则只看到转义后的字面量，
  // 于是 #281 挡住的「覆盖式钓鱼」（position:fixed + inset:0 + z-index）能用转义原样复发。
  it.each([
    ['十六进制转义 z-index', '<div style="z-\\69 ndex:9999">x</div>'],
    ['十六进制转义 inset', '<div style="in\\73 et:0">x</div>'],
    ['十六进制转义 position', '<div style="pos\\69 tion:fixed">x</div>'],
    ['转义冒号', '<div style="position\\3a fixed">x</div>'],
    ['转义 url/javascript', '<div style="backgr\\6f und:url(javascript:alert(1))">x</div>'],
  ])('**CSS 转义变体被识别**：%s', (_label, html) => {
    expect(sanitizeHTML(html), '转义后仍必须剥掉 style').not.toMatch(/style=/i)
  })

  it('注释拆词同样被识别（浏览器先剥注释再分词）', () => {
    const out = sanitizeHTML('<div style="pos/**/ition:fixed">x</div>')
    expect(out).not.toMatch(/style=/i)
  })

  it('覆盖式钓鱼的三个属性**全部转义**时也拦得住（完整攻击载荷）', () => {
    const evil = '<div style="pos\\69 tion\\3a fixed;in\\73 et\\3a 0;z-\\69 ndex\\3a 9999;background:#fff">登录已过期</div>'
    const out = sanitizeHTML(evil)
    expect(out).not.toMatch(/style=/i)
    expect(out, '文本仍保留（只剥样式）').toContain('登录已过期')
  })
  it('**正常展示样式照旧保留**（不能把功能一起关掉）', () => {
    const out = sanitizeHTML('<span style="color:#f00;font-weight:bold">红字</span>')
    expect(out).toContain('color:#f00')
    expect(out).toContain('font-weight:bold')
  })
})

describe('sanitizeHTML · 属性归一化与 data: URI 编码（#411）', () => {
  it('**首尾空白不该让链接消失**：` https://…` 归一后照常保留', () => {
    const out = sanitizeHTML('<a href="  https://example.com/x  ">链接</a>')
    expect(out, '带空白的合法链接被整条丢弃 = 功能损失，不是安全').toContain('href="https://example.com/x"')
    expect(out).not.toContain('  https')
  })

  it('图片 src 同样归一（粘贴来的 data URL 常带空白）', () => {
    const out = sanitizeHTML('<img src="  data:image/png;base64,AAA  ">')
    expect(out).toContain('src="data:image/png;base64,AAA"')
  })

  it('**未编码的 data: URI 一律剥离**：字面量 `<` 说明里面是一段标记', () => {
    const out = sanitizeHTML('<img src="data:image/svg+xml,<svg onload=alert(1)>">')
    expect(out, '可执行标记被原样存进业务数据，宿主一旦换上下文就是 XSS').not.toContain('src')
  })

  it('反回归：**已编码**的 data:image 仍放行（本库 mapMarkerIcon 就是这种形态）', () => {
    expect(sanitizeHTML('<img src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E">')).toContain('src="data:image/svg+xml,%3Csvg')
    expect(sanitizeHTML('<img src="data:image/png;base64,iVBORw0KGgo=">')).toContain('src="data:image/png;base64,')
  })

  it('反回归：危险协议与事件属性照旧被剥（#411 没有放宽任何判据）', () => {
    expect(sanitizeHTML('<a href="javascript:alert(1)">x</a>')).not.toContain('href')
    expect(sanitizeHTML('<a href=" //evil.example">x</a>')).not.toContain('href')
    expect(sanitizeHTML('<img src=x onerror=alert(1)>')).toBe('<img>')
    expect(sanitizeHTML('<p title="a&quot; onmouseover=&quot;alert(1)">t</p>')).toContain('&quot;')
  })
})