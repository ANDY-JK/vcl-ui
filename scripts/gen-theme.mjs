#!/usr/bin/env node
/**
 * 主题定制工具（token 覆盖 → 产物 CSS）—「主题定制工具化」的 token→产物 段。
 * 纯函数在 scripts/theme-pure.mjs（CLI 与 demo 可视化配置层共用），本文件只管 CLI 接线。
 *
 * 背景：vcl-ui 主题 = CSS 变量（src/components/tokens.css 的 :root / :root[data-theme='dark']
 * 双块）+ useTheme() 运行时切换。定制主题的正确姿势是「覆盖令牌」而不是改库 CSS——
 * 手写覆盖时两个坑：① 令牌名打错 → var() 静默失效（check:css-tokens 只查库内不查宿主）；
 * ② 暗色块忘写 → 切暗色后定制色被库的暗色值盖回。本工具把两件事锁死：
 *   - 令牌名必须 ∈ tokens.css 声明集（打错直接报错并给近似候选）
 *   - 配置分 light/dark 双块，产物同时出 :root 与 :root[data-theme='dark'] 两段覆盖
 *
 * 用法：
 *   node scripts/gen-theme.mjs [config.json] [out.css]   # 默认 theme.config.json → dist/theme.css
 *   node scripts/gen-theme.mjs --init                    # 生成 theme.config.json 模板
 *
 * 配置格式（JSON，全量键；空对象 = 该主题块不出产物段）：
 *   {
 *     "light": { "--vcl-color-primary": "#0f766e", "--vcl-space-4": "12px" },
 *     "dark":  { "--vcl-color-primary": "#14b8a6" }
 *   }
 *
 * 宿主引入顺序（产物追加在库 CSS 之后才覆盖得动）：
 *   import 'vcl-ui/dist/vcl-ui.css'
 *   import 'vcl-ui/dist/theme.css'
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import process from 'process'
import { parseTokenNames, validateThemeConfig, renderThemeCss } from './theme-pure.mjs'

const ROOT = resolve(process.cwd())

// 转发纯函数：既有消费方（单测）继续从本模块 import 不破坏
export { parseTokenNames, suggestTokens, validateThemeConfig, renderThemeCss } from './theme-pure.mjs'

function readTokenNames() {
  const tokensCss = readFileSync(join(ROOT, 'src/components/tokens.css'), 'utf8')
  return parseTokenNames(tokensCss)
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--init')) {
    const tpl = {
      light: {
        // 示例（取消注释启用）：换主色只需覆盖 4 个联动令牌，暗色块记得给暗色版
        // "--vcl-color-primary": "#0f766e",
        // "--vcl-color-primary-rgb": "15, 118, 110",
        // "--vcl-color-primary-hover": "#0d5f55",
        // "--vcl-color-primary-light": "#ecfdf5",
      },
      dark: {},
    }
    const cfgPath = join(ROOT, 'theme.config.json')
    writeFileSync(cfgPath, JSON.stringify(tpl, null, 2) + '\n')
    console.log(`✅ 已生成 ${cfgPath}（填入覆盖令牌后运行 node scripts/gen-theme.mjs）`)
    return
  }
  const cfgPath = resolve(ROOT, args[0] ?? 'theme.config.json')
  const outPath = resolve(ROOT, args[1] ?? 'dist/theme.css')
  if (!existsSync(cfgPath)) {
    console.error(`❌ 找不到配置 ${cfgPath}（node scripts/gen-theme.mjs --init 生成模板）`)
    process.exit(1)
  }
  let config
  try {
    config = JSON.parse(readFileSync(cfgPath, 'utf8'))
  } catch (e) {
    console.error(`❌ 配置不是合法 JSON：${e.message}`)
    process.exit(1)
  }
  const { errors, normalized } = validateThemeConfig(config, readTokenNames())
  if (errors.length) {
    console.error(`❌ 主题配置校验失败（${errors.length} 处）：`)
    errors.forEach((e) => console.error('  - ' + e))
    process.exit(1)
  }
  const total = Object.keys(normalized.light).length + Object.keys(normalized.dark).length
  if (total === 0) {
    console.log('⚠️ light/dark 均为空对象——仍生成占位产物（宿主可安全引入）')
  }
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, renderThemeCss(normalized))
  console.log(
    `✅ 主题产物 ${outPath}（light ${Object.keys(normalized.light).length} / dark ${Object.keys(normalized.dark).length} 项覆盖）`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}
