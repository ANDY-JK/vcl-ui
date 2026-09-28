// Flat config format — ESLint 9+
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vuePlugin from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default [
  // 基础 JS 推荐
  js.configs.recommended,

  // TypeScript 推荐
  ...tseslint.configs.recommended,

  // Vue 推荐规则
  ...vuePlugin.configs['flat/recommended'],

  // 通用设置
  {
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 2022,
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      globals: {
        // 浏览器全局
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        indexedDB: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        Event: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLImageElement: 'readonly',
        SVGSVGElement: 'readonly',
        ResizeObserver: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly',
        CustomEvent: 'readonly',
        AbortController: 'readonly',
        FileReader: 'readonly',
        FormData: 'readonly',
        WebSocket: 'readonly',
        Worker: 'readonly',
        crypto: 'readonly',
        history: 'readonly',
        location: 'readonly',
        screen: 'readonly',
        matchMedia: 'readonly',
        // Node.js 全局
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    rules: {
      // 控制台输出：允许 warn/error，禁止 info/debug
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // TS 项目中 no-undef 由编译器处理，关闭
      'no-undef': 'off',
      // 未使用变量交给 TS 检查
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // 允许 any 但给出警告（渐进式收紧）
      '@typescript-eslint/no-explicit-any': 'warn',
      // Vue 特定规则
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'warn',
      'vue/no-deprecated-filter': 'off', // Vue 3 不支持 filter，此规则对模板中 TS 类型断言的 | 误报
      'vue/require-default-prop': 'off',
      'vue/require-explicit-emits': 'warn',
      // 关闭过于严格的 HTML 格式化规则
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/html-self-closing': 'off',
      // 缩进与闭合括号换行同样交给 Prettier 单一权威：这两条开着会产生约 1000 条与
      // Prettier 结果相冲的 warning，且 eslint --fix 会按它们重排全 src（「lint:fix
      // 跑完整片文件变更」的根源）。格式以 Prettier 为准，ESLint 不再插手。
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/attributes-order': 'warn',
      // ⛔ 防复发（error 级，CI 的 --quiet 只保留 error，故必然生效）：
      // Vite 会把 import.meta.env.VITE_* 静态替换为字面量，直接读等于把构建期密钥烧进 dist。
      // 一律走 _internal/env-guard 的 envValue()——它在生产构建下会被摇树消除。
      // 注：import.meta.env.DEV 不含密钥，不在此限制内。
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[property.name=/^VITE_/]',
          message:
            '禁止直接读 import.meta.env.VITE_*（会把密钥内联进 dist）。改用 @/components/_internal/env-guard 的 envValue(key)。',
        },
      ],
    },
  },

  // 测试不进构建产物：s3-real 等真实云端集成用例经 vite 的 loadEnv 在运行时读 .env.local
  // 取真实凭证是设计行为（见 spec 头注释），env-guard 那条「防密钥内联进 dist」的
  // no-restricted-syntax 只对 src（产物来源）生效，tests 侧豁免。
  {
    files: ['tests/**'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // 忽略文件
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/components/_internal/pinyin-pro/**',
      // 仓内 vendor 的上游代码（SheetJS）：不是本库写的，lint/prettier 一律不碰——
      // 一旦被 --fix 改写过，`VENDOR.json` 的逐字节登记就对不上了（check:vendor-data 会红）
      'src/components/_internal/xlsx/**',
      'backup/**',
      'notes/**',
      '.playwright-cli/**',
      'test-overlap2.cjs',
      'vitest.config.ts',
      'vite.config.ts',
    ],
  },
]
