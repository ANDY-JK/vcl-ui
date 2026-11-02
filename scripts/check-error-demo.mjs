/**
 * 质量链闸口：error/invalid 演示覆盖（#382）
 *
 * ## 背景
 *
 * #378~#381 手工补了 Input/Select/Upload/Group 的 error/invalid 交互演示；
 * 本闸口把"新组件加 error/invalid prop → 演示页必须有绑定"变成机械检查，
 * 防止同类盲区再次静默出现。
 *
 * ## 口径
 *
 * · 源码里 `error?:` / `invalid?:` 的组件 → 全部演示页里必须有 `:error=` / `:invalid=` 绑定
 * · 豁免清单双向对账（同 #372）：代码删了 prop，豁免理由就过期 → 红
 */
import { readdirSync } from 'node:fs'
import { join, dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanErrorishComponents, scanDemoBindings, findDemoGaps } from './error-demo-coverage.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolvePath(HERE, '..')
const EXEMPT = {
  // <组件名>: <为什么不需要演示页绑定 error/invalid>
  // —— renderer/* 八个子渲染器：错误文案由 FormRenderer 统一收集渲染（FieldError），子渲染器不单独演示；
  //    FormRenderer 自身的注入路径已在 FormRendererDemo 演示（#382）
  RendererAddress: '错误由 FormRenderer 统一渲染',
  RendererIdcard: '错误由 FormRenderer 统一渲染',
  RendererMapPicker: '错误由 FormRenderer 统一渲染',
  RendererMatrix: '错误由 FormRenderer 统一渲染',
  RendererRichtext: '错误由 FormRenderer 统一渲染',
  RendererSignature: '错误由 FormRenderer 统一渲染',
  RendererSubform: '错误由 FormRenderer 统一渲染',
  RendererToggleList: '错误由 FormRenderer 统一渲染',
  // —— login 四页：页面级组件，error 是业务态（服务端登录失败），非表单字段注入；表单字段的
  //    注入形态已由 InputDemo/SelectDemo/UploadDemo/GroupDemo/FormRendererDemo 覆盖
  login: '页面级组件，error 为业务态注入（登录失败），非表单字段演示范畴',
  register: '同 login',
  'forgot-password': '同 login（文件名含脱敏串，见本仓命名约定）',
  portal_login: '同 login',
  // —— CaptureFallback 两块：error 是面板内提示（识别失败原因），面板本身不是表单字段；
  //    注入形态已被表单字段四件套覆盖
  CaptureFallbackPanel: 'error 为面板内状态提示，非表单字段注入',
  CaptureFallbackSheet: '同 CaptureFallbackPanel',
}
const MIN_COMPONENTS = 3 // 防扫描器坏掉后空集判绿

const comps = scanErrorishComponents(join(ROOT, 'src', 'components'))
const demos = scanDemoBindings(join(ROOT, 'src', 'demos'))

if (comps.length < MIN_COMPONENTS) {
  console.error(`✗ 扫到的 error/invalid 组件只有 ${comps.length} 个（下限 ${MIN_COMPONENTS}）—— 先怀疑扫描器坏了`)
  process.exit(1)
}

const { gaps, staleExempt } = findDemoGaps(comps, demos, EXEMPT)

let fail = false
if (gaps.length) {
  fail = true
  console.error(`✗ ${gaps.length} 个组件声明了 error/invalid prop，但演示页没有对应绑定（用户发现不了这个能力）：`)
  for (const g of gaps) console.error(`  · ${g.path} —— 在演示页加 :error= / :invalid= 交互示例，或在 scripts/check-error-demo.mjs 的 EXEMPT 登记理由`)
}
if (staleExempt.length) {
  fail = true
  console.error(`✗ 豁免清单过期（组件已不再声明 error/invalid prop，理由应删除）：`)
  for (const s of staleExempt) console.error(`  · ${s}`)
}

if (fail) process.exit(1)
console.log(`✅ check:error-demo 通过 — ${comps.length} 个含 error/invalid prop 的组件都有演示页绑定（豁免 ${Object.keys(EXEMPT).length} 条）`)
void readdirSync
