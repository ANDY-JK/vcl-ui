// 语言包消息编译守卫
// 背景：消息里的「字面花括号」必须写成 {'{'} / {'}'}。写成裸 {xxx} 会出两类事故：
//   1) 占位符名含非 ASCII 或非法字符（如 {文件名}、{"label":"一级"}）→ vue-i18n 编译报错（控制台红字），
//      并回退成原文渲染；
//   2) 占位符名是合法 ASCII 但调用点从不传参（如 {appleId}-{file}）→ 静默渲染成空串，文案丢字（最难发现）。
// 本守卫覆盖第 1 类（编译报错可自动捕获）；第 2 类无编译信号，需人工在改动文案时留意。
import { describe, it, expect, vi, afterEach } from 'vitest'
import zhCN from '@/components/_internal/locales/zh-CN'
import enUS from '@/components/_internal/locales/en-US'
import { i18n } from '@/components/_internal/i18n'

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') out.push(...flatKeys(v as Record<string, unknown>, key))
    else if (typeof v === 'string') out.push(key)
  }
  return out
}

afterEach(() => vi.restoreAllMocks())

for (const [locale, messages] of [
  ['zh-CN', zhCN],
  ['en-US', enUS],
] as const) {
  describe(`语言包消息编译守卫 · ${locale}`, () => {
    it('全部消息翻译时无编译报错（字面花括号已转义）', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const keys = flatKeys(messages as Record<string, unknown>)
      expect(keys.length).toBeGreaterThan(0)

      for (const k of keys) i18n.global.t(k, {}, { locale })

      const log = errSpy.mock.calls.map((c) => c.join(' ')).join('\n')
      expect(log, `存在消息编译报错（裸花括号需写成 {'{'} / {'}'}）：\n${log}`).not.toContain(
        'Message compilation error',
      )
    })
  })
}

// 守卫有效性自检：注入一条裸非 ASCII 占位符消息，确认本守卫的检测信号确实能触发
// （避免「守卫永远绿」——即信号源根本没接上的假安全）
describe('语言包消息编译守卫 · 自检', () => {
  it('裸 {文件名} 占位符会被检测到编译报错', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    i18n.global.mergeLocaleMessage('zh-CN', {
      __guardProbe: { bad: '对象名 {appleId}-{文件名}' },
    })
    i18n.global.t('__guardProbe.bad', {}, { locale: 'zh-CN' })

    const log = errSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(log).toContain('Message compilation error')
  })
})
