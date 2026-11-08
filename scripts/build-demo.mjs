#!/usr/bin/env node
/**
 * 构建 demo 静态站（`dist-demo/`），供产物模式的 e2e 使用。
 *
 * ## 为什么不直接写 `vite build -c vite.demo.config.ts`
 *
 * Windows 上 esbuild 偶发在收尾删除自己的临时文件时失败：
 *   `[vite:esbuild-transpile] remove C:/Users/USER Access is denied`
 * 这是**系统临时目录被占用/杀软扫到**的竞态，与代码无关（本轮实测 3 次里 1 次）。
 * 处理办法有两条，这里都做了：
 *   1. 把 TMP/TEMP/TMPDIR 指到**仓库内**的 `.tmp-esbuild/`，不和别的进程抢系统临时目录
 *   2. 失败自动重试一次（竞态重试即可，不做无限重试掩盖真错误）
 *
 * 用法：node scripts/build-demo.mjs
 */
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'vite'

const ROOT = resolve(import.meta.dirname, '..')
const LOCAL_TMP = join(ROOT, '.tmp-esbuild')

mkdirSync(LOCAL_TMP, { recursive: true })
process.env.TMP = LOCAL_TMP
process.env.TEMP = LOCAL_TMP
process.env.TMPDIR = LOCAL_TMP

async function runOnce(attempt) {
  try {
    await build({ configFile: join(ROOT, 'vite.demo.config.ts'), root: ROOT })
    return true
  } catch (e) {
    const msg = String(e?.message ?? e)
    const transient = /Access is denied|EPERM|EBUSY/i.test(msg)
    if (attempt === 1 && transient) {
      console.warn('[build-demo] 首次构建失败（临时目录竞态），重试一次：', msg.split('\n')[0])
      return false
    }
    throw e
  }
}

const ok = await runOnce(1)
if (!ok) await runOnce(2)
console.log('[build-demo] dist-demo 构建完成')
