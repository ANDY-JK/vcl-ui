#!/usr/bin/env node
/**
 * demo 静态产物服务器（e2e 用）
 *
 * 做两件事：
 *   1. 把 `dist-demo/` 当静态站发出去（SPA 回退到 index.html）
 *   2. `/api/lowcode-demo/store/*` 挂 `examples/lowcode-backend` 的**同一份** handler
 *      —— 与 dev 中间件用的是同一个 `createLowcodeHandler`，不是平行实现
 *
 * 为什么要自己起服务而不是 `vite preview`：dev 里那份 mock API 是 `apply: 'serve'` 的
 * 中间件，`preview` 不会执行它；而低代码演示页依赖它。这里按 Vite 的同名约定
 * 手动把 prefix 指到演示页用的路径即可。
 *
 * 用法：node scripts/serve-demo-dist.mjs [--port 3722]
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { createLowcodeHandler } from '../examples/lowcode-backend/server.mjs'
import {
  DEMO_NAV_PAYLOAD,
  DEMO_ROWS,
  DEMO_STORE_PREFIX,
  DEMO_STORE_TOKEN,
  seedDemoStore,
} from '../examples/lowcode-backend/demo-seed.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const DIST = join(ROOT, 'dist-demo')

const portArg = process.argv.indexOf('--port')
const PORT = Number(portArg > -1 ? process.argv[portArg + 1] : process.env.PORT || 3722)

/**
 * 演示页用的令牌、前缀与**种子数据**都与 vite.config.ts 的 dev 中间件共用同一份
 * （examples/lowcode-backend/demo-seed.mjs）—— 产物模式能不能过 lowcode 那几条 e2e，
 * 取决于种子是否一致；此前这里没种，于是 dev 绿、产物红。
 */
const STORE_PREFIX = DEMO_STORE_PREFIX
const storeHandler = createLowcodeHandler({
  token: DEMO_STORE_TOKEN,
  prefix: STORE_PREFIX,
  seed: seedDemoStore,
})

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
}

/**
 * 演示站凭证的**运行时注入**（关键设计）
 *
 * 库里 `runtimeEnv()` 在生产构建下恒返回 `{}` —— 这是刻意的：**产物不携带任何凭证**
 * （见 src/components/_internal/env-guard.ts 的注释）。于是产物模式下 amap 会报
 * `js-key-missing`。解法不是把 key 烧进 bundle，而是由这个服务器在运行时给出：
 * 页面启动时 GET 一次，再调 `setAmapKey()` 注入。
 */
function readLocalEnv() {
  try {
    const text = readFileSync(join(ROOT, '.env.local'), 'utf8')
    const out = {}
    for (const line of text.split(String.fromCharCode(10))) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
      if (m) out[m[1].replace(/^VITE_/, '').toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = m[2]
    }
    return out
  } catch {
    return {}
  }
}
const DEMO_ENV = readLocalEnv()


const server = createServer((req, res) => {
  void (async () => {
    const url = req.url ?? '/'

    // ① 低代码 REST 仓储：与 dev 中间件同一份 handler
    if (url.startsWith(`${STORE_PREFIX}/`)) {
      void storeHandler(req, res)
      return
    }

    // ② 演示站凭证：产物不携带，运行时由服务器注入（见 readLocalEnv 的说明）
    if (url.startsWith('/api/demo-config')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          amapKey: DEMO_ENV.amapKey ?? '',
          amapSecret: DEMO_ENV.amapSecret ?? '',
          // 存储配置：与 amap 同理 —— 产物不携带，运行时给（env-guard 在生产构建下返回空）
          s3: {
            endpoint: DEMO_ENV.s3Endpoint ?? '',
            region: DEMO_ENV.s3Region ?? '',
            bucket: DEMO_ENV.s3Bucket ?? '',
            accessKeyId: DEMO_ENV.s3AccessKeyId ?? '',
            secretAccessKey: DEMO_ENV.s3SecretAccessKey ?? '',
          },

        }),
      )
      return
    }

    // ③ 演示页用的两张固定数据（与 dev 中间件共用同一份载荷）
    if (url.startsWith('/api/lowcode-demo/rows')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ code: 0, data: { rows: DEMO_ROWS } }))
      return
    }
    if (url.startsWith('/api/lowcode-demo/nav')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(DEMO_NAV_PAYLOAD))
      return
    }

    // ④ 静态文件 + SPA 回退
    const rel = normalize(decodeURIComponent(url.split('?')[0])).replace(/^([/\\])+/, '')
    const filePath = join(DIST, rel)
    if (!filePath.startsWith(DIST)) {
      res.statusCode = 403
      res.end('forbidden')
      return
    }
    try {
      const info = await stat(filePath)
      if (info.isFile()) {
        res.setHeader('Content-Type', MIME[extname(filePath)] ?? 'application/octet-stream')
        res.end(await readFile(filePath))
        return
      }
    } catch {
      // 落到 SPA 回退
    }
    res.setHeader('Content-Type', MIME['.html'])
    res.end(await readFile(join(DIST, 'index.html')))
  })()
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[serve-demo-dist] http://127.0.0.1:${PORT}/  (dist-demo)`)
})
