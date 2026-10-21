/**
 * gen-console-noise-baseline —— 生成「未静默 console.warn/error」的类别计数基线
 *
 * 背景见 tests/unit/setup.ts 顶部注释。简单说：打印出来的噪音不等于被看见，
 * 把当前状态固化成基线后，**新增类别**或**某类计数上升**就会让单测非零退出。
 *
 * 用法：npm run test:noise:baseline
 *
 * 注意：这个脚本跑的是**全量单测**（基线必须是全量口径，只跑部分文件会漏类别）。
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

console.log('▶ 跑全量单测以采集 console 噪音类别…（基线必须是全量口径）\n')

try {
  execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--reporter=dot'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, VCL_WRITE_NOISE_BASELINE: '1' },
  })
} catch {
  // 单测本身失败时也要让基线写入（exit 钩子已执行），但要把失败说清楚
  console.error('\n⚠ 单测运行有失败，基线仍按实际采集到的噪音写入；请先修好单测再复核基线')
}
