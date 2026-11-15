/**
 * demo 静态站构建配置（**只给 e2e 用，不影响库产物**）
 *
 * ## 为什么需要它
 *
 * 默认 `vite.config.ts` 是**库构建**（`build.lib` 多入口），它不产出能直接打开的 `index.html`；
 * 而 e2e 一直跑在 dev server 上，代价是：每访问一条新路由，Vite 都要**现编译那页的模块图** ——
 * 于是有了「首访要 15s 超时」和 `net::ERR_INSUFFICIENT_RESOURCES` 那类环境 flake
 * （机理：dev server 按路由现编译模块图）。
 *
 * 这份配置把演示站按**普通 SPA** 打出来（`dist-demo/`），e2e 用静态产物跑，
 * 就不再依赖 dev server 的按需编译。
 *
 * ## 刻意不引入的东西
 *
 * - `vite-plugin-dts`：e2e 不需要类型声明（只白白慢一倍）
 * - `thirdPartyEvidencePlugin`：那是给库产物做许可清单的
 * - 低代码 mock API：`apply: 'serve'`，本来就不该进产物；静态站由
 *   `scripts/serve-demo-dist.mjs` 在服务端挂同一份 `createLowcodeHandler`
 *
 * ## 与库产物的隔离
 *
 * `outDir: dist-demo`、`copyPublicDir: true`（demo 的图片素材是页面的一部分）。
 * `dist-demo/` 已在 .gitignore 里，不会污染提交。
 */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  publicDir: 'demo-public',
  build: {
    outDir: 'dist-demo',
    // 关键：把库模式关掉，走默认的 index.html SPA 构建
    lib: false,
    copyPublicDir: true,
    // e2e 不关心体积，但关心"源码定位清晰"（失败时线索指向源文件而不是压缩后的列）
    minify: false,
    sourcemap: false,
    chunkSizeWarningLimit: 4096,
  },
  // 产物里不再有 dev server 的 HMR，tag 一下便于在 DevTools/e2e 里区分
  define: {
    __VCL_DEMO_PROD__: 'true',
  },
})
