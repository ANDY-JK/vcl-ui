// theme-pure.mjs 的类型声明（浏览器/Node 双端安全纯函数，逻辑在 .mjs，本文件只声明签名）
export function parseTokenNames(cssText: string): Set<string>
export function suggestTokens(name: string, tokenNames: Set<string>, limit?: number): string[]
export interface ThemeConfigShape {
  light: Record<string, string>
  dark: Record<string, string>
}
export function validateThemeConfig(
  config: unknown,
  tokenNames: Set<string>,
): { errors: string[]; normalized: ThemeConfigShape }
export function renderThemeCss(normalized: ThemeConfigShape, header?: string): string
export interface ThemeGroup {
  key: string
  label: string
  match: RegExp | null
  readOnly?: boolean
  tokens: string[]
}
export const THEME_GROUPS: ThemeGroup[]
export function groupTokens(tokenNames: Set<string>): ThemeGroup[]
export function currentTheme(doc?: Document | null): 'light' | 'dark'
export function resolvedTokenValues(tokenNames: Set<string>): Record<string, string>
export function isNativeColorValue(v: string | null | undefined): boolean
