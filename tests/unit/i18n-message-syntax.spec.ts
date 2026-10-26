/**
 * 语言包文案里**不能出现 vue-i18n 的裸语法字符**（第 129 轮）。
 *
 * 与既有 `locale-message-compile.spec.ts` 的分工（互补，不是重复）：
 *   · 那个守**花括号**：`{xxx}` 会编译报错（或静默丢字）
 *   · 本文件守**竖线与 @**：`|` 是**复数分隔符**、`@` 是 linked 语法，二者**都不会报错**，
 *     只会让 `t()` 输出的文案悄悄变短
 *
 * 起因（实测）：给 `PropsAdvancedFields.vue` 补测时发现子表单的"列定义"标签在界面上只显示 `key`、
 * 占位符只显示 `name` —— 而占位符正是**教用户填写格式**的唯一提示，坏掉之后那个字段基本没法用。
 * 根因：`'列定义（…格式：标签|key|类型）'` 被 vue-i18n 拆成 3 段，`t()` 无 count 时只取其中一段。
 * 修法：字面竖线写成 `{'|'}`。
 */
import { describe, it, expect } from 'vitest'
import zhCN from '@/components/_internal/locales/zh-CN'
import enUS from '@/components/_internal/locales/en-US'
import { useT, setLocale } from '@/components/_internal/i18n'

function flatMessages(obj: Record<string, unknown>, prefix = ''): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') out.push(...flatMessages(v as Record<string, unknown>, key))
    else if (typeof v === 'string') out.push({ key, value: v })
  }
  return out
}

const LOCALES: Array<[string, Array<{ key: string; value: string }>]> = [
  ['zh-CN', flatMessages(zhCN as Record<string, unknown>)],
  ['en-US', flatMessages(enUS as Record<string, unknown>)],
]

/** 剥掉合法的字面转义 `{'|'}` `{'@'}` `{'{'}` 等，剩下的才是"裸语法字符" */
const stripEscapes = (v: string) => v.replace(/\{'([|@{}])'\}/g, '')

describe.each(LOCALES)('语言包守门 · %s', (_locale, msgs) => {
  it('前提：确实取到了足够多的文案', () => {
    expect(msgs.length).toBeGreaterThan(800)
  })

  it('**不许有裸 `|`**（被当复数分隔符 → t() 只输出其中一段，不报错）', () => {
    const bad = msgs.filter((m) => stripEscapes(m.value).includes('|'))
    expect(
      bad.map((m) => `${m.key} = ${JSON.stringify(m.value)}`),
      "字面竖线要写成 {'|'}",
    ).toEqual([])
  })

  it('不许有裸 `@`（linked 语法；真要用写成 {\'@\'}）', () => {
    const bad = msgs.filter((m) => /(^|[^@])@/.test(stripEscapes(m.value)))
    expect(bad.map((m) => `${m.key} = ${JSON.stringify(m.value)}`)).toEqual([])
  })
})

describe('回归：子表单列定义与占位符（曾被管道符吃掉）', () => {
  it('zh-CN：标签与占位符都完整（此前只显示 “key” / “name”）', () => {
    const t = useT()
    setLocale('zh-CN')
    expect(t('fbp.subformColumns')).toBe('列定义（每行一个，格式：标签|key|类型）')
    expect(t('fbp.subformColumnsPh')).toBe('姓名|name|text\n电话|phone|number')
  })

  it('en-US：同样完整', () => {
    const t = useT()
    setLocale('en-US')
    expect(t('fbp.subformColumns')).toBe('Column definitions (one per line, format: label|key|type)')
    expect(t('fbp.subformColumnsPh')).toBe('Name|name|text\nPhone|phone|number')
    setLocale('zh-CN')
  })

  it('**字面竖线真的输出了 2 个**（防止"改了但没生效"的假绿）', () => {
    const t = useT()
    const out = t('fbp.subformColumns')
    expect(out.split('|').length, '应有 2 个竖线 → 3 段').toBe(3)
    expect(out, '不能被截成单独一段').not.toBe('key')
  })
})