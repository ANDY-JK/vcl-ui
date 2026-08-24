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
          return undefined
        },
      },
    },
    // 清空 dist
    emptyOutDir: true,
  },
})
