// gen-theme / 主题可视化配置层 纯函数行为锁定测试（声明集解析 / 配置校验 / CSS 渲染 / 编辑器分组）
// 纯函数在 scripts/theme-pure.mjs（浏览器+Node 双端共用），CLI 只是接线
import { describe, it, expect } from 'vitest'
import {
  parseTokenNames,
  suggestTokens,
  validateThemeConfig,
  renderThemeCss,
  groupTokens,
  isNativeColorValue,
  currentTheme,
} from '../../scripts/theme-pure.mjs'

const CSS_SAMPLE = `
:root {
  --color-primary: #4f6ef7;
  --space-4: clamp(10px, 2vw, 16px);
}
:root[data-theme='dark'] {
  --color-primary: #6d87ff;
}
@media (max-width: 767px) {
  :root { --bp-lg: 1024px; }
}
`

describe('parseTokenNames', () => {
  it('任意位置（含缩进/嵌套块）的 --name: 声明全收，var() 引用不算声明', () => {
    const names = parseTokenNames(CSS_SAMPLE)
    expect([...names].sort()).toEqual(['--bp-lg', '--color-primary', '--space-4'])
    // var(--x) 引用没有冒号，不会误收
    expect(parseTokenNames('color: var(--nope); --real: 1')).toEqual(new Set(['--real']))
  })
})

describe('suggestTokens', () => {
  const toks = new Set(['--color-primary', '--color-primary-hover', '--space-4'])
  it('转位/单字符级拼错给候选（距离 ≤2）；差距远的给空', () => {
    expect(suggestTokens('--color-priamry', toks)).toEqual(['--color-primary'])
    expect(suggestTokens('--spce-4', toks)).toEqual(['--space-4'])
    expect(suggestTokens('--radius-99', toks)).toEqual([])
  })

  it('多候选按距离升序 + 字典序，limit 截断', () => {
    expect(suggestTokens('--color-primary-hover-x', toks, 1)).toEqual(['--color-primary-hover'])
  })
})

describe('validateThemeConfig', () => {
  const toks = new Set(['--color-primary', '--space-4'])

  it('合法配置：值 trim 归一，未声明块视为空', () => {
    const { errors, normalized } = validateThemeConfig({ light: { '--color-primary': '  #111  ' } }, toks)
    expect(errors).toEqual([])
    expect(normalized.light).toEqual({ '--color-primary': '#111' })
    expect(normalized.dark).toEqual({})
  })

  it('未声明令牌 → 报错并附近似候选（拼错即静默失效，必须拦）', () => {
    const { errors } = validateThemeConfig({ light: { '--color-priamry': '#000' } }, toks)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('--color-priamry')
    expect(errors[0]).toContain('--color-primary')
  })

  it('键不是 --kebab-case / 值空 / 值含注入字符 / 结构非法 —— 各自报错', () => {
    const cases = [
      [{ light: { Color: '#000' } }, '不是合法令牌名'],
      [{ light: { '--space-4': '  ' } }, '非空字符串'],
      [{ light: { '--space-4': '8px; --x:1' } }, '注入字符'],
      ['not-object', '配置根必须是对象'],
      [{ light: ['--space-4'] }, 'light 块必须是'],
    ]
    for (const [cfg, msgPart] of cases) {
      const { errors } = validateThemeConfig(cfg, toks)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors.join(' ')).toContain(msgPart)
    }
  })
})

describe('renderThemeCss', () => {
  it('light → :root、dark → :root[data-theme=dark]，空块不出现', () => {
    const css = renderThemeCss({ light: { '--color-primary': '#111' }, dark: { '--space-4': '8px' } })
    expect(css).toContain(':root {\n  --color-primary: #111;\n}')
    expect(css).toContain(":root[data-theme='dark'] {\n  --space-4: 8px;\n}")
    // 头部防手改提示（前缀稳定，生成方字样随调用方变）
    expect(css.startsWith('/* vcl-ui theme override')).toBe(true)
  })

  it('只配 light 时不出暗色段；全空出占位注释（宿主引入安全）', () => {
    const css = renderThemeCss({ light: { '--color-primary': '#111' }, dark: {} })
    expect(css).not.toContain("data-theme='dark'")
    expect(renderThemeCss({ light: {}, dark: {} })).toContain('/* 空主题')
  })
})

describe('编辑器分组与取值判定', () => {
  it('groupTokens：命中组归位、只读组标记、未命中进 other（未来新增令牌不失踪）', () => {
    const names = new Set(['--color-primary', '--color-danger', '--space-4', '--bp-lg', '--z-modal', '--brand-new-token'])
    const groups = groupTokens(names)
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g]))
    expect(byKey.primary.tokens).toEqual(['--color-primary'])
    expect(byKey.status.tokens).toEqual(['--color-danger'])
    expect(byKey.space.tokens).toEqual(['--space-4'])
    expect(byKey.readonly.readOnly).toBe(true)
    expect(byKey.readonly.tokens).toEqual(['--bp-lg', '--z-modal'])
    expect(byKey.other.tokens).toEqual(['--brand-new-token']) // 未命中任何组
    // 空组不出现（只留有令牌的组 + other 有内容才出现）
    expect(groups.find((g) => g.key === 'radius')).toBeUndefined()
  })

  it('isNativeColorValue：#rrggbb / #rgb 可喂原生取色器，其余记法走文本框', () => {
    expect(isNativeColorValue('#4f6ef7')).toBe(true)
    expect(isNativeColorValue('#abc')).toBe(true)
    expect(isNativeColorValue('#4F6EF7')).toBe(true) // 大小写 hex 亦可
    expect(isNativeColorValue('rgb(79, 110, 247)')).toBe(false)
    expect(isNativeColorValue('var(--color-primary)')).toBe(false)
    expect(isNativeColorValue('')).toBe(false)
    expect(isNativeColorValue('#4f6ef7ff')).toBe(false) // 8 位原生 input 不收
  })

  it('currentTheme：html[data-theme=dark] = 暗色；无属性/其它值 = 亮色（与 tokens.css 切换契约一致）', () => {
    const mkDoc = (v) => {
      const el = document.createElement('html')
      if (v === null) el.removeAttribute('data-theme')
      else el.setAttribute('data-theme', v)
      return { documentElement: el }
    }
    expect(currentTheme(mkDoc('dark'))).toBe('dark')
    expect(currentTheme(mkDoc('light'))).toBe('light')
    expect(currentTheme(mkDoc(null))).toBe('light')
    expect(currentTheme(null)).toBe('light') // 无 document（SSR/Node）回落亮色
  })
})
