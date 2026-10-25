import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'
import { readFileSync } from 'fs'
import { thirdPartyEvidencePlugin } from './scripts/third-party-evidence.mjs'
// 演示站的"表单仓储后端"**不是另写一份**，而是直接复用 `examples/lowcode-backend` 里
// 宿主真要部署的那份实现（同一契约只能有一份代码 —— 否则 e2e 验的和交付的是两套东西）
import { createLowcodeHandler } from './examples/lowcode-backend/server.mjs'

/**
 * 声明按最低承诺版本生成时，vue 被解析到构建别名 vue34，
 * 于是 import 类型会带上别名路径（如 import('../../../node_modules/vue34')）。
 * 这里改写回 'vue'，让消费者按自己安装的版本解析。
 */
function normalizeVueSpecifier(filePath: string, content: string): string {
  // 形态有两种：import('…/node_modules/vue34') 类型引用、from '…/node_modules/vue34' 静态导入
  const out = content.replace(/(['"])[^'"]*node_modules\/vue34\1/g, "'vue'")
  if (out.includes('vue34')) {
    throw new Error(`[dts] ${filePath} 仍残留构建别名 vue34，声明不可发布`)
  }
  return out
}

// ==================== 多入口构建（Q3） ====================
// 主入口 + 13 个域 barrel 各自独立成包：消费方 `import { Button } from 'vcl-ui/basic'`
// 只加载 basic 与共享 core-chunk，不再整包引入（此前所有 ./<domain> 子路径都指向
// 同一个 vcl-ui.js，运行时零隔离）。
// 注意两个多入口特有的坑：
// ① 域 barrel 头部的 tokens.css 引入必须保留：当前 CSS 仍是单文件（vcl-ui.css），
//    该引入本期不改变产物；但它是「域 CSS 自包含」的前置契约——将来开 cssCodeSplit
//    时没有它，域的 CSS 会静默丢掉 var(--color-*)/--z-* 令牌（var() 断档不会报错，
//    只是暗色下悬空）。manualChunks 里另有根级 CSS → core-chunk 的显式归类兜底。
// ② 主入口体积预算 15KB：多入口后它是 re-export 薄壳，壳膨胀即说明域隔离被破坏。
const DOMAINS = [
  'basic',
  'data',
  'form',
  'feedback',
  'nav',
  'layout',
  'chart',
  'login',
  'storage',
  'wc',
  'form-builder',
  'amap',
  'route-planner',
] as const

const ENTRY: Record<string, string> = { main: resolve(__dirname, 'src/components/index.ts') }
for (const d of DOMAINS) ENTRY[d] = resolve(__dirname, `src/components/${d}/index.ts`)

/**
 * 开发期演示接口（**仅 dev server 生效**，不进构建产物）。
 *
 * 用途：低代码展示类的 `api` 数据源需要一个真实的 HTTP 往返才能验证——
 * 「真实网络 → 同源守卫放行 → JSON 解析 → dataPath 取值 → 表格渲染」这条链
 * 在单测里只能用 stub fetch 模拟，链路是否真的通必须真跑一次。
 *
 * 走的是 `/api/` 前缀 → 同源 → 默认策略放行；用来验证跨域拦截时把地址换成外部域即可。
 */
function lowcodeDemoApiPlugin() {
  const rows = [
    { sku: 'SP-1001', name: '门店 A · 冷藏柜', qty: 12, amount: 3840, updatedAt: '2026-10-18 09:12' },
    { sku: 'SP-1002', name: '门店 B · 收银台', qty: 3, amount: 1290, updatedAt: '2026-10-18 10:05' },
    { sku: 'SP-1003', name: '门店 C · 货架区', qty: 27, amount: 8650, updatedAt: '2026-10-18 11:40' },
  ]
  return {
    name: 'vcl-lowcode-demo-api',
    apply: 'serve' as const,
    configureServer(server: { middlewares: { use: (p: string, h: (req: unknown, res: { setHeader: (k: string, v: string) => void; end: (b: string) => void }) => void) => void } }) {
      server.middlewares.use('/api/lowcode-demo/rows', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ code: 0, data: { rows } }))
      })
      /**
       * 后端下发的**导航定义**（低代码导航外壳的 api 来源）。
       *
       * 故意混进一个 `javascript:` 链接与一个未知 kind：真实后端一定会下发脏数据，
       * 演示页要能让人**亲眼看到**"合规项照常渲染、坏项不渲染且问题可查"，
       * 而不是只在单测里断言。
       */
      server.middlewares.use('/api/lowcode-demo/nav', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            code: 0,
            data: {
              items: [
                { key: 'group-biz', label: '业务台账', kind: 'group', children: [
                  { key: 'form-customers', label: '客户台账', kind: 'form', formId: 'demo-customers', icon: 'clipboard' },
                  { key: 'form-tickets', label: '工单', kind: 'form', formId: 'demo-tickets' },
                ] },
                { key: 'link-doc', label: '帮助文档', kind: 'link', url: 'https://example.com/help' },
                { key: 'bad-js', label: '脏数据（会被拒）', kind: 'link', url: 'javascript:alert(1)' },
                { key: 'bad-kind', label: '未知类型（会被丢弃）', kind: 'mystery' },
              ],
            },
          }),
        )
      })

      /**
/**
       * **自托管后端的参考实现**（低代码的 REST 仓储）：`createRestFormStore` 约定的 9 条路由。
       *
       * 第 106 轮之前这里是**一份 ~170 行的平行实现**：同一契约两份代码，而演示站 e2e 验的是
       * 这个中间件、**不是宿主真要部署的那一份** —— 验证与交付脱节，契约一漂移两边就分叉。
       * 现在这里只做两件事：把前缀指到演示页用的路径、把"服务端才有的表单"种进去；
       * 路由/鉴权/错误语义（401/403/400/413、裸载荷）全部来自 `createLowcodeHandler`，
       * 与 `LOWCODE_TOKEN=… node examples/lowcode-backend/server.mjs` 跑的是**同一份代码**。
       *
       * 令牌写死在这里并被**服务端强制校验**：缺令牌一律 401，
       * 于是"演示页有没有把 headers 接对"是**可观测的**，而不是"看着能跑"。
       */
      const STORE_PREFIX = '/api/lowcode-demo/store'
      const storeHandler = createLowcodeHandler({
        token: 'demo-token-r105',
        prefix: STORE_PREFIX,
        seed: async (store) => {
          // 预置一份"服务端才有的表单"（名字带「服务端：」前缀）：切到 REST 仓储后，
          // 导航项若从「客户台账 / 工单」变成「服务端：客户台账」，
          // 就证明确实是**从 HTTP 取的**，而不是复用内存里那两份。
          await store.saveForm(
            'rest-customers',
            {
              schemaVersion: 3,
              meta: { title: '服务端：客户台账', submitText: '提交' },
              nodes: [
                { id: 's1', type: 'text', label: '服务端字段·客户名称', key: 'name', required: true },
                { id: 's2', type: 'textarea', label: '服务端字段·备注', key: 'note' },
              ],
            },
            '服务端：客户台账',
          )
        },
      })
      server.middlewares.use((req, res, next) => {
        if (!(req.url ?? '').startsWith(STORE_PREFIX + '/')) {
          next()
          return
        }
        void storeHandler(req, res)
      })
    },
  }
}

export default defineConfig({
  plugins: [
    vue(),
    lowcodeDemoApiPlugin(),
    // 许可清单的证据来源：产物实际含哪些第三方模块（es/cjs 两次输出并集写
    // dist/third-party-modules.json），由 scripts/gen-third-party-licenses.mjs 消费
    thirdPartyEvidencePlugin({ outDir: 'dist', root: __dirname }),
    dts({
      // 逐文件生成 .d.ts；显式加载 vite/client 类型以解析 import.meta.env
      // tsconfig.dts.json = 主配置 + vueCompilerOptions.target 3.4（该 program 的 vue 被别名到 3.4）
      tsconfigPath: './tsconfig.dts.json',
      // include 会覆盖 tsconfig 的 include：根目录 env.d.ts 里有 qrcode/lib/browser.js 的
      // 环境声明与 vite/client 引用，不带上的话该子路径会被推成 any（TS7016）
      include: ['src/components', 'env.d.ts'],
      exclude: [
        'src/demos',
        'src/App.vue',
        'src/main.ts',
        // JSON 是数据体不是 API：vite-plugin-dts 会为它推断**整份字面量类型**并 emit 成 .d.ts，
        // 实测 morphicons 570 KB + solar 236 KB = **806 KB 纯浪费**（消费者永远不会 import 数据文件的类型；
        // 两处都在 `(dataMod as { default?: unknown }).default as Record<...>` 处显式收窄）。
        // 2026-10-21 审查 6.3 第 2 项「分发体积治理」。
        '**/*.json',
      ],
      rollupTypes: false,
      // 声明必须按最低承诺版本（peer: vue ^3.4.0）生成：vue 3.5 的 DefineComponent
      // 在前 13 个参数之后多出 7 个（LC/Directives/Exposed/Provide/...），
      // 用 3.5 生成会让 3.4 消费者在 skipLibCheck:false 下报 73 条 TS2707。
      // vue34 是 npm 别名（devDependency，仅构建期用），前 13 个参数两版完全一致。
      beforeWriteFile: (filePath, content) => ({ content: normalizeVueSpecifier(filePath, content) }),
      compilerOptions: {
        types: ['vite/client'],
        paths: {
          '@/*': [resolve(__dirname, 'src/*')],
          vue: [resolve(__dirname, 'node_modules/vue34')],
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    // qrcode 为纯 CJS：显式预构建为 ESM，dev 下 import 才能被 vite 解析（含浏览器端子路径）
    include: ['qrcode', 'qrcode/lib/browser.js'],
  },
  // demo 专用静态资源（`scripts/gen-demo-assets.mjs` 生成的无扩展名 PNG）。
  // 不叫默认的 public/ 是刻意的：那两个名字太容易被当成「站点资源」而顺手放东西，
  // 且下一条 copyPublicDir:false 的用意也需要一个显式名字来提示「这是 demo 的，不是库的」。
  publicDir: 'demo-public',
  server: {
    port: 3721,
    // 默认只监听本机。原先是 '0.0.0.0' + allowedHosts:true（为真机调试方便），
    // 但本机 .env.local 里放着真实云端凭证，而 envValue() 在 DEV 下会把 VITE_* 注入模块图——
    // 同网段任何主机都能拉 dev chunk 读到（第五轮审查 R5-C5）。
    // 需要真机调试时显式开：VITE_DEV_LAN=1 npm run dev（此时才绑 0.0.0.0）。
    host: process.env.VITE_DEV_LAN === '1' ? '0.0.0.0' : '127.0.0.1',
    allowedHosts: process.env.VITE_DEV_LAN === '1' ? true : ['localhost', '127.0.0.1'],
    // reports/ 是测试/覆盖率生成物，跑测试时整目录重写；监听它会在文件消失的瞬间抛 lstat 未捕获异常打死 dev server
    watch: { ignored: ['**/reports/**'] },
    https:
      process.env.VITE_NO_HTTPS === '1'
        ? false // e2e 专用：Playwright 探活/访问固定走明文 HTTP（自签证书会让它连不上）
        : (() => {
            try {
              return {
                key: readFileSync(resolve(__dirname, 'key.pem')),
                cert: readFileSync(resolve(__dirname, 'cert.pem')),
              }
            } catch {
              // HTTPS 证书不可用时回退 HTTP，生产部署应确保证书存在
              console.warn('[vite] HTTPS 证书未找到，回退到 HTTP')
              return false
            }
          })(),
  },
  build: {
    // demo-public/ 是演示站点的图片素材，绝不能拷进 dist——
    // 那是要发布到 npm 的库产物，塞进 demo 资源只会白涨包体积与许可清单。
    copyPublicDir: false,
    lib: {
      entry: ENTRY,
      name: 'VclUi',
      // main → vcl-ui.js（兼容旧路径）；域 → <domain>/index.js（与 d.ts 落点同目录）
      fileName: (format, entryName) =>
        entryName === 'main' ? `vcl-ui.${format === 'es' ? 'js' : 'cjs'}` : `${entryName}/index.${format === 'es' ? 'js' : 'cjs'}`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      // 不打包这些，由使用方提供。zxing-wasm 作为 dependency 由消费方安装
      // morphicons 为可选 provider（形变动画），子路径 import 也必须整包 external
      external: [
        'vue',
        'vue-router',
        'echarts',
        /^echarts\//,
        'echarts-wordcloud',
        '@lucide/vue',
        '@iconify/vue',
        'zxing-wasm',
        /^zxing-wasm\//,
        'morphicons',
        /^morphicons\//,
      ],
      output: {
        globals: {
          vue: 'Vue',
          'vue-router': 'VueRouter',
          pinia: 'Pinia',
          echarts: 'echarts',
          'lucide-vue-next': 'LucideVueNext',
          '@lucide/vue': 'LucideVueNext',
          '@iconify/vue': 'IconifyVue',
          morphicons: 'Morphicons',
        },
        // CSS 单独提取：按入口 chunk 名分文件 —— main 仍是全量 vcl-ui.css，
        // 各域 entry 出自带域的 <domain>.css（含共享 core 样式，自包含，消费方按需引）
        assetFileNames: (info) => (info.names?.length ? `${info.names[0].replace(/\.css$/, '')}.[ext]` : 'vcl-ui.[ext]'),
        // 按业务域拆分 chunk — 减小主 bundle，让按需加载/摇树更有效
        manualChunks(id) {
          // 根级共享 CSS（tokens.css 等）显式归 core-chunk：manualChunks 对 CSS 模块
          // （.vue?vue&type=style 虚拟模块与 .css 实体）同样生效，而 rollup 的默认块分配会
          // 把多入口共用的 tokens.css park 到某个域 chunk——所有入口随即对该域产生依赖边，
          // 与真实跨域边（storage→form→data）合成 chunk 环（2026-09-20 多入口改造实测）。
          // 判据取「src/components/ 直属 .css」= 全库共享的根级样式。
          if (/\/src\/components\/[^/]+\.css$/.test(id)) return 'core-chunk'
          // 仓内 vendor 的 SheetJS（2026-09-28 起不再从 node_modules 走）：路径里没有 node_modules，
          // 不显式点名就会被下面的 /_internal/ 规则收进 core-chunk，1MB 的表格读写库随主链加载
          if (id.includes('/_internal/xlsx/')) return 'vendor-heavy'
          // 依赖库（echarts 等已 external，这里是剩余的重型依赖）
          if (id.includes('node_modules')) {
            // 把 xlsx/zxing-wasm 等重型动态依赖拆出主链
            if (id.includes('xlsx') || id.includes('zxing-wasm')) return 'vendor-heavy'
            return undefined
          }
          // 业务域（相对 src 的模块路径）
          if (!id.includes('/src/components/')) return undefined
          if (id.includes('/form-builder/')) return 'form-builder-chunk'
          if (id.includes('/route-planner/')) return 'route-planner-chunk'
          if (id.includes('/login/')) return 'login-chunk'
          if (id.includes('/amap/')) return 'amap-chunk'
          if (id.includes('/chart/')) return 'chart-chunk'
          if (id.includes('/storage/')) return 'storage-chunk'
          if (id.includes('/data/')) return 'data-chunk'
          // 基础层与剩余目录必须显式归类：manualChunks 未命中的模块会被 rollup 归到
          // 「先引用它」的业务 chunk 里。曾把 form/Input.vue 塞进 login-chunk，而
          // login/_shared.ts 又引 storage，于是 login-chunk ↔ storage-chunk 成环。
          if (id.includes('/form/')) return 'form-chunk'
          if (id.includes('/nav/')) return 'nav-chunk'
          if (id.includes('/wc/')) return 'wc-chunk'
          // 图标数据是 registry 里动态 import 的懒加载资源，收进 core-chunk 会被拉进主链
          if (id.includes('/solar-icons-data')) return undefined
          if (id.includes('/morphicons-icons-data')) return undefined
          // 随包的扫码解码 wasm（base64）同理：只在打开扫码时动态 import，不显式放行就会被
          // 下面的 /_internal/ 规则收进 core-chunk（1.2MB 级会拖进主链，所有人一起下载）
          if (id.includes('/zxing-wasm-data')) return undefined
          if (
            id.includes('/_internal/') ||
            id.includes('/basic/') ||
            id.includes('/feedback/') ||
            id.includes('/layout/') ||
            id.includes('/shared/')
          ) {
            return 'core-chunk'
          }
          return undefined
        },
      },
    },
    // 域级 CSS（M7）：lib 模式默认强制 cssCodeSplit=false（源码 cssCodeSplit: !raw.lib，
    // mergeWithDefaults 允许显式 true 覆盖）。开启后按 chunk 出 CSS——各域入口的样式
    // 落到自己的 chunk CSS 里，tokens.css 等根级共享样式仍归 core-chunk（见 manualChunks）。
    cssCodeSplit: true,
    // 清空 dist
    emptyOutDir: true,
  },
})
