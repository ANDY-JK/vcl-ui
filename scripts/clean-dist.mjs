/**
 * 构建前清空 dist —— 不能用 fs.rmSync，也不能依赖 vite 的 emptyOutDir。
 *
 * 实测本机（Windows + I: 盘）：`fs.rmSync(dir,{recursive:true})` 静默返回、目录仍在，
 * 既不抛错也不删（试过 force / maxRetries / retryDelay 三种参数组合，全部无效）。
 * vite 的 emptyOutDir 走的同一套删除接口，因此在这块盘上形同虚设 ——
 * 后果是 dist 里堆历史 chunk：同一版本跨 6 天累积 690 文件 / 62MB，而入口只引用 11 个，
 * `files:["dist"]` 会让 npm publish 把 55MB 旧代码一起发出去。
 *
 * 这里改成逐文件 unlinkSync + 自底向上 rmdirSync，实测可删。
 */
import { readdirSync, rmdirSync, unlinkSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const target = process.argv[2] ?? 'dist'

function deepRemove(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) deepRemove(p)
    else unlinkSync(p)
  }
  rmdirSync(dir)
}

if (!existsSync(target)) {
  console.log(`[clean] ${target} 不存在，跳过`)
} else {
  const before = statSync(target).isDirectory() ? countFiles(target) : 0
  deepRemove(target)
  if (existsSync(target)) {
    console.error(`❌ [clean] ${target} 删除后仍存在，构建会叠加历史产物 —— 请人工检查磁盘/权限`)
    process.exit(1)
  }
  console.log(`[clean] 已清空 ${target}（${before} 个文件）`)
}

function countFiles(dir) {
  let n = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(join(dir, e.name))
    else n++
  }
  return n
}
