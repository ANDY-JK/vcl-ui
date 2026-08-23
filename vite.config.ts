import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'
import { readFileSync } from 'fs'

export default defineConfig({
  plugins: [
    vue(),
    dts({
      // 逐文件生成 .d.ts；显式加载 vite/client 类型以解析 import.meta.env
      tsconfigPath: './tsconfig.json',
      include: ['src/components'],
      exclude: ['src/demos', 'src/App.vue', 'src/main.ts'],
      rollupTypes: false,
      compilerOptions: {
        types: ['vite/client'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3721,
    host: '0.0.0.0',
    allowedHosts: true,
    https: (() => {
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
      name: 'VueComponentLib',
      fileName: 'vue-component-lib',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      // 不打包这些，由使用方提供。zxing-wasm 作为 dependency 由消费方安装
      external: ['vue', 'vue-router', 'pinia', 'echarts', /^echarts\//, '@lucide/vue', '@iconify/vue', 'zxing-wasm', /^zxing-wasm\//],
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
        assetFileNames: 'vue-component-lib.[ext]',
        // 按业务域拆分 chunk — 减少 main bundle 体积
        manualChunks: {
          // login 页面组件（4 个页面级组件，体积大）
          'login-chunk': [
            './src/components/login/login.vue',
            './src/components/login/register.vue',
            './src/components/login/forgot-password.vue',
            './src/components/login/portal_login.vue',
          ],
          // route-planner 业务组件（5 个组件 + composables + utils）
          'route-planner-chunk': [
            './src/components/route-planner/RouteMap.vue',
            './src/components/route-planner/RouteResult.vue',
            './src/components/route-planner/StorePanel.vue',
            './src/components/route-planner/StoreFormModal.vue',
            './src/components/route-planner/ImportProgress.vue',
          ],
        },
      },
    },
    // 清空 dist
    emptyOutDir: true,
  },
})
