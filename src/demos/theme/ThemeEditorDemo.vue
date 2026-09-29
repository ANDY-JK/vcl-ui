<script setup lang="ts">
// 主题可视化配置层 — 路线图第 15 项「令牌 → 可视化配置 → 产物 CSS」的宿主侧落地：
// 分组令牌面板（颜色走原生取色器 / 其余文本框）→ 按当前主题记录覆盖 → 实时预览（动态 style 标签）
// → 一键导出 theme.config.json / theme.css（导出走 scripts/theme-pure.mjs 的同一套校验，与 CLI 同口径）
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from '@/components/basic/Button.vue'
import Tag from '@/components/basic/Tag.vue'
import Input from '@/components/form/Input.vue'
import tokensCss from '@/components/tokens.css?raw'
import {
  parseTokenNames,
  groupTokens,
  validateThemeConfig,
  renderThemeCss,
  currentTheme,
  resolvedTokenValues,
  isNativeColorValue,
  type ThemeConfigShape,
  type ThemeGroup,
} from '../../../scripts/theme-pure.mjs'

const tokenNames = parseTokenNames(tokensCss)
const groups: ThemeGroup[] = groupTokens(tokenNames)
const initialValues = resolvedTokenValues(tokenNames)

type Overrides = ThemeConfigShape
const STORAGE_KEY = 'vcl-theme-editor-overrides'

function loadDraft(): Overrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { light: {}, dark: {} }
    const parsed = JSON.parse(raw) as Overrides
    return { light: parsed?.light ?? {}, dark: parsed?.dark ?? {} }
  } catch {
    return { light: {}, dark: {} }
  }
}

const overrides = ref<Overrides>(loadDraft())
const theme = ref<'light' | 'dark'>(currentTheme())

/** 编辑对象 = 当前主题块；切主题（html[data-theme]）自动换记录面 */
const activeBlock = computed(() => overrides.value[theme.value])

function setToken(name: string, value: string | null) {
  const block = activeBlock.value
  if (value === null || value === '') {
    delete block[name]
  } else {
    block[name] = value
  }
}
function resetThemeBlock() {
  overrides.value[theme.value] = {}
}
function resetAll() {
  overrides.value = { light: {}, dark: {} }
}

// ---- 实时预览：overrides 渲染成 :root / :root[data-theme='dark'] 两段动态 style（库令牌之上的覆盖） ----
const previewCss = computed(() => renderThemeCss(overrides.value, '/* vcl-ui theme editor 实时预览（草稿，未落盘） */'))
let styleEl: HTMLStyleElement | null = null
let themeObserver: MutationObserver | null = null
watch(
  previewCss,
  (css) => {
    if (styleEl) styleEl.textContent = css
  },
  { immediate: false },
)
onMounted(() => {
  styleEl = document.createElement('style')
  styleEl.id = 'vcl-theme-live-preview'
  styleEl.textContent = previewCss.value
  document.head.appendChild(styleEl)
  // 库的 useTheme/暗色切换改的是 html[data-theme]——监听它跟随（编辑器自身切换也走这里）
  themeObserver = new MutationObserver(() => {
    theme.value = currentTheme()
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
})
onBeforeUnmount(() => {
  styleEl?.remove()
  themeObserver?.disconnect()
})

function setTheme(next: 'light' | 'dark') {
  if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme') // 无属性 = 跟随系统/亮色（与 tokens.css 契约一致）
  theme.value = next
}

// ---- 导出（与 CLI 同一套校验：令牌名 ∈ 声明集 + 值无注入字符） ----
const exportConfig = computed(() => JSON.stringify(overrides.value, null, 2))
const exportCss = computed(() => renderThemeCss(overrides.value))
const exportErrors = computed(() => validateThemeConfig(overrides.value, tokenNames).errors)
const dirty = computed(() => Object.keys(overrides.value.light).length + Object.keys(overrides.value.dark).length > 0)
// 预览区输入框（Input 的 modelValue 必填）
const previewInput = ref('')

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copyState.value = 'ok'
  } catch {
    // 剪贴板 API 不可用（文档失焦/权限拒绝）——降级 execCommand，再失败只提示不抛
    // （此前裸调 writeText 异常上抛进 ErrorBoundary，切 tab 后回来点复制即崩）
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      copyState.value = document.execCommand('copy') ? 'ok' : 'fail'
    } catch {
      copyState.value = 'fail'
    }
    ta.remove()
  }
  setTimeout(() => (copyState.value = ''), 2000)
}

// 复制结果反馈（成功/失败 2 秒后自动消失）
const copyState = ref<'' | 'ok' | 'fail'>('')

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides.value))
}
watch(overrides, persist, { deep: true })
</script>

<template>
  <div class="theme-editor">
    <section class="te-panel">
      <header class="te-head">
        <h2>主题定制</h2>
        <div class="te-theme-switch" role="group" aria-label="主题切换">
          <Button size="sm" :variant="theme === 'light' ? 'primary' : 'secondary'" @click="setTheme('light')"
            >亮色</Button
          >
          <Button size="sm" :variant="theme === 'dark' ? 'primary' : 'secondary'" @click="setTheme('dark')"
            >暗色</Button
          >
        </div>
      </header>
      <p class="te-hint">
        修改记录在<strong>当前主题</strong>（{{
          theme === 'dark' ? '暗色' : '亮色'
        }}）块；切主题后各自独立。覆盖即时作用于整站（实时预览）， 导出配置后在宿主跑
        <code>npm run gen:theme</code> 即落 <code>dist/theme.css</code>。草稿自动存 localStorage。
      </p>

      <div v-for="g in groups" :key="g.key" class="te-group">
        <div class="te-group-head">
          <span class="te-group-label">{{ g.label }}（{{ g.tokens.length }}）</span>
          <span v-if="g.readOnly" class="te-readonly">只读</span>
        </div>
        <div v-for="t in g.tokens" :key="t" class="te-row">
          <code class="te-name" :title="t">{{ t }}</code>
          <!-- 长值（rgba/clamp/shadow）列内截断，悬停 title 看全值 -->
          <span class="te-current" :title="initialValues[t] || '—'">{{ initialValues[t] || '—' }}</span>
          <span v-if="activeBlock[t]" class="te-override">已覆盖</span>
          <div class="te-inputs">
            <input
              v-if="!g.readOnly && isNativeColorValue(initialValues[t])"
              type="color"
              class="te-color"
              :value="activeBlock[t] || initialValues[t]"
              @input="setToken(t, ($event.target as HTMLInputElement).value)"
            />
            <input
              v-if="!g.readOnly"
              type="text"
              class="te-text"
              :placeholder="initialValues[t] || '自定义'"
              :title="`当前：${initialValues[t] || '—'}`"
              :value="activeBlock[t] ?? ''"
              @input="setToken(t, ($event.target as HTMLInputElement).value || null)"
            />
            <span v-if="g.readOnly" class="te-ro-note">断点/z 索引改动有连锁反应，不开放覆盖</span>
          </div>
        </div>
      </div>

      <footer class="te-export">
        <div class="te-export-actions">
          <Button size="sm" @click="resetThemeBlock">重置{{ theme === 'dark' ? '暗色' : '亮色' }}块</Button>
          <Button size="sm" variant="danger" @click="resetAll">重置全部</Button>
          <span v-if="!dirty" class="te-clean">无覆盖（产物为空主题）</span>
        </div>
        <p v-for="err in exportErrors" :key="err" class="te-error">{{ err }}</p>
        <div class="te-out">
          <div>
            <div class="te-out-head">
              theme.config.json
              <Button size="sm" variant="ghost" @click="copy(exportConfig)">复制</Button>
              <span v-if="copyState" class="te-copy-state" :class="copyState">{{
                copyState === 'ok' ? '已复制 ✓' : '复制失败，请手动选择文本复制'
              }}</span>
            </div>
            <textarea :value="exportConfig" readonly rows="6" class="te-cfg" aria-label="theme.config.json 内容" />
          </div>
          <div>
            <div class="te-out-head">
              theme.css
              <Button size="sm" variant="ghost" @click="copy(exportCss)">复制</Button>
              <span v-if="copyState" class="te-copy-state" :class="copyState">{{
                copyState === 'ok' ? '已复制 ✓' : '复制失败，请手动选择文本复制'
              }}</span>
            </div>
            <pre class="te-css">{{ exportCss }}</pre>
          </div>
        </div>
        <p class="te-tip">
          宿主引入：先 <code>vcl-ui/dist/vcl-ui.css</code>，再
          <code>vcl-ui/dist/theme.css</code>（产物在后才覆盖得动）。
        </p>
      </footer>
    </section>

    <aside class="te-preview">
      <h3>实时预览</h3>
      <div class="pv-card">
        <div class="pv-row">
          <Button variant="primary">主按钮</Button>
          <Button variant="secondary">默认</Button>
          <Tag variant="primary">主色</Tag>
          <Tag variant="danger">危险</Tag>
        </div>
        <div class="pv-row">
          <Input v-model="previewInput" placeholder="输入框随主题" />
        </div>
        <div class="pv-note">色块/卡片/控件全部走令牌——改面板左侧，此区即时变化。</div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.theme-editor {
  display: grid;
  grid-template-columns: minmax(420px, 1.1fr) minmax(300px, 0.9fr);
  gap: var(--space-6);
  padding: var(--space-6);
}
@container demo (max-width: 1023px) {
  .theme-editor {
    grid-template-columns: 1fr;
  }
}
.te-panel,
.te-preview {
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  padding: var(--space-5);
}
.te-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.te-hint {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}
.te-group {
  margin-top: var(--space-4);
}
.te-group-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 600;
  font-size: 13px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--color-border-light);
}
.te-readonly {
  font-size: 11px;
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0 4px;
}
.te-row {
  display: grid;
  grid-template-columns: 190px 1fr 52px minmax(120px, 220px);
  gap: var(--space-2);
  align-items: center;
  padding: 3px 0;
  font-size: 12px;
}
.te-name {
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.te-current {
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, monospace;
}
.te-override {
  color: var(--color-primary);
  font-size: 11px;
}
.te-inputs {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
.te-color {
  width: 30px;
  height: 26px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 1px;
  background: var(--color-surface);
}
.te-text {
  /* basis auto（非 0）让 field-sizing: content 的内容尺寸参与分配——
     短值框由 min-width 兜底等宽，rgba/clamp/shadow 长值框自动放宽（≤220px）；
     不支持 field-sizing 的浏览器 basis auto = size 属性宽度，min-width 兜底 */
  flex: 1 1 auto;
  min-width: 80px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
  background: var(--color-surface);
  color: var(--color-text);
  field-sizing: content;
  max-width: 220px;
}
.te-copy-state {
  font-size: 11px;
  margin-left: var(--space-2);
}
.te-copy-state.ok {
  color: var(--color-success-text, #16a34a);
}
.te-copy-state.fail {
  color: var(--color-danger-text, #dc2626);
}
.te-ro-note {
  font-size: 11px;
  color: var(--color-text-muted);
}
.te-export {
  margin-top: var(--space-5);
  border-top: 1px dashed var(--color-border);
  padding-top: var(--space-4);
}
.te-export-actions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-wrap: wrap;
}
.te-clean {
  font-size: 12px;
  color: var(--color-text-muted);
}
.te-error {
  color: var(--color-danger);
  font-size: 12px;
}
.te-out {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin-top: var(--space-3);
}
.te-out-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}
.te-cfg,
.te-css {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  background: var(--color-bg);
  color: var(--color-text);
  padding: var(--space-2);
  white-space: pre;
  overflow: auto;
}
.te-css {
  min-height: 100px;
}
.te-tip {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: var(--space-3);
}
.pv-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: var(--space-4);
  background: var(--color-surface);
}
.pv-row {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-top: var(--space-3);
}
.pv-note {
  margin-top: var(--space-3);
  font-size: 12px;
  color: var(--color-text-muted);
}
</style>
