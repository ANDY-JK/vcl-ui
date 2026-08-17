export type ToneType = 'symbol' | 'num' | 'none'
export type PinyinMode = 'normal' | 'surname'
export type SurnameMode = 'all' | 'head' | 'off'

export interface CommonOptions {
  toneType?: ToneType
  pattern?: 'pinyin' | 'initial' | 'final' | 'num' | 'first' | 'finalHead' | 'finalBody' | 'finalTail'
  removeNonZh?: boolean
  nonZh?: 'spaced' | 'consecutive' | 'removed'
  v?: boolean | string
  initialPattern?: 'yw' | 'standard'
  traditional?: boolean
}

export interface BasicOptions extends CommonOptions {
  multiple?: boolean
  mode?: PinyinMode
  surname?: SurnameMode
  toneSandhi?: boolean
  segmentit?: number
}

export interface OptionsReturnString extends BasicOptions {
  type?: 'string'
  separator?: string
}

export interface OptionsReturnArray extends BasicOptions {
  type: 'array'
}

export function pinyin(word: string, options?: OptionsReturnString): string
export function pinyin(word: string, options?: OptionsReturnArray): string[]
export function pinyin(word: string, options?: { type: 'all' } & BasicOptions): any[]

export function match(word: string, pinyinStr: string): string | null
export function customPinyin(dict: Record<string, string>): void
export function polyphonic(word: string, options?: { type?: 'string' | 'array' }): string | string[] | null
export function segment(word: string, options?: BasicOptions): string[]
