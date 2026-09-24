import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'
import { readFileSync } from 'fs'

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

export default defineConfig({
  plugins: [
    vue(),
    dts({
      // 逐文件生成 .d.ts；显式加载 vite/client 类型以解析 import.meta.env
      // tsconfig.dts.json = 主配置 + vueCompilerOptions.target 3.4（该 program 的 vue 被别名到 3.4）
      tsconfigPath: './tsconfig.dts.json',
      // include 会覆盖 tsconfig 的 include：根目录 env.d.ts 里有 qrcode/lib/browser.js 的
      // 环境声明与 vite/client 引用，不带上的话该子路径会被推成 any（TS7016）
      include: ['src/components', 'env.d.ts'],
      exclude: ['src/demos', 'src/App.vue', 'src/main.ts'],
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
  server: {
    port: 3721,
    host: '0.0.0.0',
    allowedHosts: true,
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
    // 清空 dist
    emptyOutDir: true,
  },
})
