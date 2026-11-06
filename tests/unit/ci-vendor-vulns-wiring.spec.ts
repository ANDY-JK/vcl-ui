// CI 的 vendor-vulns 热缓存接线（#473，TD-25 收口）
//
// 为什么要有这条 spec：CI 不能在本机跑，所以「TD-25 已收口」这句话必须靠**静态对账**证明。
// 这类接线最容易坏在两处，而且都**不会让 CI 变红**：
//   ① env.VENDOR_VULNS_CACHE 与 actions/cache 的 path 不一致 → 闸口写缓存到一个文件、
//      actions/cache 存的是另一个（永远是空），离线兜底静默失效；
//   ② 忘了 mkdir 父目录 → writeFileSync 抛错被闸口 catch 吞掉（"写不了缓存不影响结论"），
//      于是缓存永远不存在，同样静默失效。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const CI = '.github/workflows/ci.yml'
const GITIGNORE = '.gitignore'

/** 从 workflow 文本里抽出 vendored CVE 步骤的接线事实（不引 YAML 依赖，按行解析） */
export function parseVendorVulnsWiring(text: string) {
  const lines = text.split(/\r?\n/)
  // 找「Check vendored CVEs」这一段：到下一个 step（6 空格缩进的 `- name:`）为止。
  // 不能用「缩进变浅」判结束 —— `run: |` 里的命令有 10 空格，会被误判成新块。
  const step = lines.findIndex((l) => l.includes('- name: Check vendored CVEs'))
  const nextStep = step < 0 ? -1 : lines.findIndex((l, i) => i > step && /^ {6}- name:/.test(l))
  const end = nextStep < 0 ? lines.length : nextStep
  const stepText = step < 0 ? '' : lines.slice(step, end).join('\n')

  const envMatch = /VENDOR_VULNS_CACH[LOCAL_PATH]
  const pathMatch = /^\s+path:\s*(\S+)/m.exec(text)
  const keyMatch = /^\s+key:\s*(.+)$/m.exec(text)
  const hasCacheStep = /uses:\s*actions\/cache@v4/.test(text)
  const hasGateRun = /npm run check:vendor-vulns/.test(stepText)
  const hasMkdir = /mkdir -p/.test(stepText)
  return {
    step,
    envPath: envMatch?.[1] ?? null,
    cachePath: pathMatch?.[1] ?? null,
    key: keyMatch?.[1] ?? null,
    hasCacheStep,
    hasGateRun,
    hasMkdir,
    stepText,
  }
}

/** 返回问题清单；空数组 = 接线自洽 */
export function validateVendorVulnsWiring(text: string, gitignore = '') {
  const w = parseVendorVulnsWiring(text)
  const issues: string[] = []
  if (!w.hasCacheStep) issues.push('缺少 actions/cache@v4 的 restore/save 步骤')
  if (!w.hasGateRun) issues.push('CI 没有跑 npm run check:vendor-vulns')
  if (!w.envPath) issues.push('check 步骤没设 VENDOR_VULNS_CACHE')
  if (!w.cachePath) issues.push('actions/cache 没写 path')
  if (w.envPath && w.cachePath && w.envPath !== w.cachePath) {
    issues.push(`env 路径(${w.envPath}) 与 actions/cache path(${w.cachePath}) 不一致 → 缓存永远存不上`)
  }
  if (!w.key || !w.key.includes('VENDOR.json')) issues.push('缓存键没绑 VENDOR.json（换版会命中旧结论）')
  if (!/xlsx\/VENDOR\.json/.test(w.key ?? '')) issues.push('缓存键缺 xlsx/VENDOR.json')
  if (!/pinyin-pro\/VENDOR\.json/.test(w.key ?? '')) issues.push('缓存键缺 pinyin-pro/VENDOR.json')
  if (!w.hasMkdir) issues.push('check 步骤没 mkdir 父目录 → writeFileSync 失败会被静默吞掉')
  if (w.envPath) {
    const dir = w.envPath.split('/').slice(0, -1).join('/')
    if (dir && !gitignore.includes('/' + dir + '/')) issues.push(`${dir}/ 没进 .gitignore`)
  }
  return issues
}

describe('CI vendor-vulns 接线（TD-25 收口证据）', () => {
  const real = readFileSync(CI, 'utf8')
  const gi = readFileSync(GITIGNORE, 'utf8')

  it('真实 workflow：接线自洽（零问题）', () => {
    expect(validateVendorVulnsWiring(real, gi)).toEqual([])
  })

  it('env 路径与 actions/cache path 完全一致', () => {
    const w = parseVendorVulnsWiring(real)
    expect(w.envPath).toBeTruthy()
    expect(w.cachePath).toBe(w.envPath)
  })

  it('缓存键绑两个 VENDOR.json（换版重搬不命中旧结论）', () => {
    const w = parseVendorVulnsWiring(real)
    expect(w.key).toContain('xlsx/VENDOR.json')
    expect(w.key).toContain('pinyin-pro/VENDOR.json')
  })

  it('父目录已 gitignore（.ci-cache/ 不入库）', () => {
    expect(gi).toContain('/.ci-cache/')
  })

  it('合成夹具：env 与 path 不一致 → 必须报出来（负向对照）', () => {
    const bad = real.replace('VENDOR_VULNS_CACHE: .ci-cache/vendor-vulns-cache.json', 'VENDOR_VULNS_CACHE: .ci-cache/other.json')
    expect(validateVendorVulnsWiring(bad, gi).join('\n')).toContain('不一致')
  })

  it('合成夹具：删掉 mkdir → 必须报出来', () => {
    const bad = real.replace('          mkdir -p .ci-cache\n', '')
    expect(validateVendorVulnsWiring(bad, gi).join('\n')).toContain('mkdir')
  })

  it('合成夹具：缓存键不绑 VENDOR.json → 必须报出来', () => {
    const bad = real.replace(/key: vendor-vulns-\$\{\{ hashFiles\([^\n]+\}\}/, 'key: vendor-vulns-static')
    expect(validateVendorVulnsWiring(bad, gi).join('\n')).toContain('VENDOR.json')
  })

  it('反向保护：workflow 里确实有这两个 step（不是对着空气校验）', () => {
    expect(real).toContain('- name: Restore vendor-vulns cache')
    expect(real).toContain('- name: Check vendored CVEs')
  })
})
