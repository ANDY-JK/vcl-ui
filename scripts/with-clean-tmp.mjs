// with-clean-tmp —— 在一个**干净的仓库内临时目录**里跑子命令（#466）
//
// 背景：VitePress/Vite 构建会调 esbuild，esbuild 在 `os.tmpdir()` 下建临时目录。
// Windows 上 %TEMP% 常被杀软/其它进程锁住，esbuild 清理时报
// `remove C:/Users/USER Access is denied`，构建**假红**——
// 与代码无关，却会让整链随机断在第 47 步（docs:build）。
//
// 做法：把 TMP/TEMP/TMPDIR 指到仓库内的 `.build-tmp/`（先清空），
// 跑完再删。子进程 stdio 直通，退出码原样传递。
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const TMP = join(ROOT, '.build-tmp')

const args = process.argv.slice(2)
if (!args.length) {
  console.error('用法: node scripts/with-clean-tmp.mjs <命令> [参数...]')
  process.exit(2)
}

rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })

const r = spawnSync(args.join(' '), {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, TMP, TEMP: TMP, TMPDIR: TMP },
})

try {
  rmSync(TMP, { recursive: true, force: true })
} catch {
  // 清不掉不影响结论（下次跑会再清）
}

if (r.error) {
  console.error('✖ with-clean-tmp 启动失败：', r.error.message)
  process.exit(1)
}
process.exit(r.status ?? 1)
