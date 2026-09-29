/**
 * check-offline —— 运行期零取件闸口
 *
 * 规则：库与 demo **运行时**不得请求外部资源。第三方图床/字体/CDN 随时会改版、限流、
 * 下线（本仓已经历过：高德主题图钉 404、IconPicker 依赖 Iconify CDN、zxing 解码 wasm
 * 从 jsdelivr 取件），资源一消失页面就破图或功能直接失效；离线与内网环境更是完全不可用。
 *
 * 判定：扫 src 下 .vue/.ts/.css，找**会真的发请求**的形态：
 *   - 运行期属性赋值：`src=` / `href=` 后跟 http(s) 字面量
 *   - 动态插入：createElement('script'|'link'|'img') 附近的 http(s)
 *   - CSS 取件：`url(http…)`、`@import 'http…'`
 *   - JS 取件：fetch/import 后跟 http(s) 字符串
 * 白名单（登记制，每条都要写出为什么）：
 *   - 地图 SDK：活服务，必须在线（配置项换 key 即换数据源，非「资源」）
 *   - 保留/示例域名：.invalid / .example / placeholder / 文档注释里的地址
 *   - SVG 命名空间、XML schema URI：不是网络请求
 *   - **不扫 data:/blob:/本地相对路径**：它们本就无网络依赖
 *
 * 用法：node scripts/check-offline.mjs [--list]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIRS = ['src']
const LIST = process.argv.includes('--list')

/** 域名级白名单：命中即放行（每条都点名来源） */
const ALLOWED_HOSTS = [
  { re: /^https?:\/\/(?:[\w-]+\.)*webapi\.amap\.com\//, why: '高德 JS SDK 本体（活服务，配置项换 key 即换数据源）' },
  { re: /^https?:\/\/(?:[\w-]+\.)*restapi\.amap\.com\//, why: '高德 REST 服务（路线/地理编码，同上）' },
  { re: /^https?:\/\/uri\.amap\.com\//, why: '高德 URI 导航协议（跳转链接，非取件）' },
  { re: /^https?:\/\/(?:[\w-]+\.)*amap\.com\//, why: '高德其余子域（瓦片/服务）' },
  { re: /^https?:\/\/www\.w3\.org\//, why: 'SVG/XML 命名空间，非网络请求' },
  {
    re: /^https?:\/\/(?:schemas\.openxmlformats\.org|schemas\.microsoft\.com|purl\.org|purl\.oclc\.org|openoffice\.org|docs\.oasis-open\.org|sheetjs\.com|sheetjs\.openxmlformats\.org)\//,
    why: 'OXML/OPF 文档 schema 命名空间（xlsx 导出用，非请求）',
  },
  { re: /^https?:\/\/[^/]*\.invalid(?:\/|$)/, why: '保留域名：刻意的坏链接演示（永不解析）' },
  { re: /^https?:\/\/(?:api|www)\.example\.com\//, why: '示例域名：placeholder 文案' },
  { re: /^https?:\/\/example\.com\//, why: '示例域名：placeholder 文案' },
  { re: /^https?:\/\/xxxx\.supabase\.co\//, why: '存储配置面板的 placeholder' },
  { re: /^https?:\/\/my-main-oss-2026\.s3\.bitiful\.net\//, why: 'S3 配置 placeholder / 注释里的示例' },
  {
    re: /^https?:\/\/(?:api\.iconify\.design|docs\.sheetjs\.com|vue-i18n\.intlify\.dev)\//,
    why: '注释/类型声明里的数据来源与文档地址',
  },
  { re: /^https?:\/\/www\.baidu\.com\//, why: '通知演示的跳转目标（用户点击才跳，非页面取件）' },
  { re: /^https?:\/\/(?:m\.)?gushici\.com\//, why: 'pinyin 词库的来源注释' },
  { re: /^https?:\/\/tinyurl\.com\//, why: '注释里的示例短链' },
  { re: /^https?:\/\/localhost[:/]/, why: '本地开发地址' },
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      walk(p, out)
      continue
    }
    if (/\.(vue|ts|css)$/.test(name)) out.push(p.replaceAll('\\', '/'))
  }
  return out
}

/** 会真发请求的形态（按特征抓，再逐条核） */
const PATTERNS = [
  { re: /\b(?:src|href)\s*=\s*["'`]?(https?:\/\/[^"'`\s)>]+)/g, why: '运行期属性赋值' },
  { re: /url\(\s*["']?(https?:\/\/[^"'`)\s]+)/g, why: 'CSS url() 取件' },
  { re: /@import\s+["'](https?:\/\/[^"'`\s]+)/g, why: 'CSS @import 外链' },
  { re: /(?:fetch|import|importScripts)\s*\(\s*["'`](https?:\/\/[^"'`\s)]+)/g, why: 'JS 取件调用' },
]

const hits = []
let scanned = 0

for (const file of SRC_DIRS.flatMap((d) => walk(d))) {
  scanned++
  const text = readFileSync(file, 'utf8')
  for (const { re, why } of PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text)) !== null) {
      const url = m[1]
      if (ALLOWED_HOSTS.some((a) => a.re.test(url))) continue
      const line = text.slice(0, m.index).split('\n').length
      hits.push({ file, line, url, why })
    }
  }
}

if (hits.length > 0) {
  console.error(`❌ check:offline 失败 — ${hits.length} 处运行期外链取件：`)
  for (const h of hits.slice(0, LIST ? hits.length : 30)) {
    console.error(`  ${h.file}:${h.line}  [${h.why}]  ${h.url.slice(0, 96)}`)
  }
  if (!LIST && hits.length > 30) console.error(`  …还有 ${hits.length - 30} 处（--list 看全量）`)
  console.error(
    '第三方资源一律本地化：静态文件放仓内、数据改为随包生成物（参考 zxing-wasm-data / solar-icons-data / demo-images）。',
  )
  console.error('确需外链（如地图 SDK 这类活服务）请加进本脚本 ALLOWED_HOSTS 并写明理由。')
  process.exit(1)
}
console.log(`✅ check:offline 通过 — ${scanned} 个文件无未登记的运行期外链取件`)
