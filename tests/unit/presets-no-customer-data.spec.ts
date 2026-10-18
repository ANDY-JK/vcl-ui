// 预置模板与示例数据「去客户化」守护
//
// 立案背景（第五轮全量审查）：
//   R5-C1（P0）—— 预置 schema 里带着单一客户的真实公司名、真人姓名与一个明文口令 default，
//                  且该 schema 是公开导出、随 dist/form-builder 分发；
//   R5-X7        —— 两个 demo 的数据集含 57 条真实门店记录（含 41 个真实手机号与真实 Apple ID）。
//
// 本测试是这两条缺陷的回归锁：任何一次「把真实数据拷回模板/示例」都会在这里红。
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { storeReportSchema } from '@/components/form-builder/presets/store-report'
import { contractCollectionSchema } from '@/components/form-builder/presets/contract-collection'

/** 已清除的客户标识（不得再次出现；来源见报告 R5-C1 / R5-X7） */
const REMOVED_CUSTOMER_TOKENS = [
  '天津汇荣达科技有限公司',
  '汇荣达',
  '立炎卓',
  '姚献忠',
  '金巧巧',
  '陈翠玲',
  '吴亦英',
  '杨万全',
  '刘汝',
  '王雷雷',
  'Htd20251',
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|vue)$/.test(name)) out.push(p.replaceAll('\\', '/'))
  }
  return out
}

describe('预置模板去客户化：schema 内不得有客户真实数据', () => {
  const schemas = { storeReportSchema: storeReportSchema(), contractCollectionSchema: contractCollectionSchema() }

  it('口令类字段不得预置任何默认值（口令只能由填写人输入）', () => {
    for (const [name, schema] of Object.entries(schemas)) {
      const pwdFields = schema.fields.filter((f) => f.type === 'password')
      for (const f of pwdFields) {
        expect(f.default, `${name} 的字段 ${f.key} 不应带 default`).toBeFalsy()
        expect(f.hint, `${name} 的字段 ${f.key} 应提示由填写人输入`).toBeTruthy()
      }
    }
  })

  it('预置模板不得出现 11 位手机号字面量', () => {
    for (const file of walk('src/components/form-builder/presets')) {
      const text = readFileSync(file, 'utf8')
      const phones = text.match(/\b1[3-9]\d{9}\b/g) ?? []
      expect(phones, `${file} 出现了疑似手机号`).toEqual([])
    }
  })

  it('预置模板不得出现已清除的客户标识串', () => {
    for (const file of walk('src/components/form-builder/presets')) {
      const text = readFileSync(file, 'utf8')
      for (const token of REMOVED_CUSTOMER_TOKENS) {
        expect(text.includes(token), `${file} 出现了已清除的客户标识「${token}」`).toBe(false)
      }
    }
  })
})

describe('示例数据去客户化：demo 数据集必须是合成数据', () => {
  const demoFiles = ['src/demos/map/ContractCollectionDemo.vue', 'src/demos/map/ContractTargetCollectDemo.vue']

  it('demo 若出现 phone 字面量，必须落在合成段 138xxxxxxxx', () => {
    for (const file of demoFiles) {
      const text = readFileSync(file, 'utf8')
      const phones = [...text.matchAll(/phone:\s*'([^']*)'/g)].map((m) => m[1])
      if (!phones.length) continue
      for (const p of phones) {
        expect(p, `${file} 的 phone「${p}」不是合成号段`).toMatch(/^138\d{8}$/)
      }
    }
  })

  it('demo 不得出现已清除的客户标识串', () => {
    for (const file of demoFiles) {
      const text = readFileSync(file, 'utf8')
      for (const token of REMOVED_CUSTOMER_TOKENS) {
        expect(text.includes(token), `${file} 出现了已清除的客户标识「${token}」`).toBe(false)
      }
    }
  })

  it('门店名与地址只保留行政结构，不得内嵌人名（用「示例」前缀约束）', () => {
    for (const file of demoFiles) {
      const text = readFileSync(file, 'utf8')
      const names = [...text.matchAll(/name:\s*'([^']*)'/g)].map((m) => m[1])
      for (const n of names) {
        expect(n, `${file} 的门店名「${n}」应使用示例数据`).toMatch(/^示例通讯/)
      }
    }
  })
})
