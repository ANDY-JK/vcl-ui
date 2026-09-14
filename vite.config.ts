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
      entry: resolve(__dirname, 'src/components/index.ts'),
      name: 'VclUi',
      fileName: 'vcl-ui',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      // 不打包这些，由使用方提供。zxing-wasm 作为 dependency 由消费方安装
      external: ['vue', 'vue-router', 'pinia', 'echarts', /^echarts\//, 'echarts-wordcloud', '@lucide/vue', '@iconify/vue', 'zxing-wasm', /^zxing-wasm\//],
      output: {
        globals: {
          vue: 'Vue',
          'vue-router': 'VueRouter',
          pinia: 'Pinia',
          echarts: 'echarts',
          'lucide-vue-next': 'LucideVueNext',
          '@lucide/vue': 'LucideVueNext',
          '@iconify/vue': 'IconifyVue',
        },
        // CSS 单独提取
        assetFileNames: 'vcl-ui.[ext]',
        // 按业务域拆分 chunk — 减小主 bundle，让按需加载/摇树更有效
        manualChunks(id) {
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
