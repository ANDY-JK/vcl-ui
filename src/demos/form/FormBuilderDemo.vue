<script setup lang="ts">
/**
 * 低代码表单 Demo — 设计 → 预览 → 收集 全流程
 *
 * 三标签页：
 * 1. 设计：拖拽设计器，编辑字段属性
 * 2. 预览：实时渲染表单
 * 3. 收集：数据收集 + 记录管理 + Excel 导出
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { FormDesigner, FormCollect, FormBuilder, toFormSchema } from '@/components/form-builder'
import type { DesignerField, DesignerNode, FormMeta, FormSchema } from '@/components/form-builder'
import {
  containerDemoNodes,
  containerDemoMeta,
  storeReportSchema,
  contractCollectionSchema,
} from '@/components/form-builder'
import IconSvg from '@/components/basic/IconSvg.vue'

// ════════════════════════════════════════
// 标签页
// ════════════════════════════════════════
const activeTab = ref<'design' | 'preview' | 'collect'>('design')

const tabs = [
  { key: 'design' as const, label: '设计', icon: 'layout-template' },
  { key: 'preview' as const, label: '预览', icon: 'eye' },
  { key: 'collect' as const, label: '收集', icon: 'database' },
]

/** 能力标签 — 让首次进入者一眼看到这套低代码能做什么 */
const capabilities = ['拖拽设计', '容器嵌套布局', '条件显隐与联动', '草稿自动保存', '分享发布链接', 'JSON 导入导出']

// ════════════════════════════════════════
// 设计数据
// ════════════════════════════════════════
const fields = ref<DesignerField[]>([])
const meta = ref<FormMeta>({
  title: '示例表单',
  description: '这是一个通过拖拽设计器生成的表单',
  submitText: '提交',
})

// 预览数据
const previewData = ref<Record<string, unknown>>({})

// ════════════════════════════════════════
// 设计器高度 — 单屏自适应（不滚动）
// 可用高 = .content-body 可视高 − 固定开销(顶部 28 + 标签栏 66 + 底部 60 + 兜底 3 = 157)
//          − 能力说明头部高 − 工具栏实际高（一行 51 / 换行 83，量取避免估算）
// ════════════════════════════════════════
const bodyClientH = ref(0)
const toolbarH = ref(83)
const headH = ref(0)
let bodyObserver: ResizeObserver | null = null
let toolbarObserver: ResizeObserver | null = null
let headObserver: ResizeObserver | null = null

const measureBody = () => {
  const el = document.querySelector('.content-body')
  if (el) bodyClientH.value = el.clientHeight
}
const measureToolbar = () => {
  const el = document.querySelector('.ld-toolbar')
  if (el) toolbarH.value = el.getBoundingClientRect().height
}
/** 头部高度含下外边距（getBoundingClientRect 不含 margin，需单独取） */
const measureHead = () => {
  const el = document.querySelector('.lc-demo-head') as HTMLElement | null
  if (!el) return
  headH.value = el.offsetHeight + (parseFloat(getComputedStyle(el).marginBottom) || 0)
}

onMounted(() => {
  measureBody()
  bodyObserver = new ResizeObserver(measureBody)
  const body = document.querySelector('.content-body')
  if (body) bodyObserver.observe(body)

  measureToolbar()
  const toolbar = document.querySelector('.ld-toolbar')
  if (toolbar) toolbarObserver = new ResizeObserver(measureToolbar)
  toolbarObserver?.observe(toolbar!)

  measureHead()
  const head = document.querySelector('.lc-demo-head')
  if (head) headObserver = new ResizeObserver(measureHead)
  headObserver?.observe(head!)

  window.addEventListener('resize', measureBody)
})
onUnmounted(() => {
  bodyObserver?.disconnect()
  toolbarObserver?.disconnect()
  headObserver?.disconnect()
  window.removeEventListener('resize', measureBody)
})
const designHeight = computed(() => `${Math.max(bodyClientH.value - 157 - headH.value - toolbarH.value, 355)}px`)

/** 预览用 Schema（从设计数据转换） */
const previewSchema = computed(() => toFormSchema(fields.value, meta.value))

// 预置模板列表：schema 为平铺 FormSchema 工厂，nodes 为含嵌套容器的 DesignerNode 树工厂
// （全部函数化 — 模块求值早于 setLocale，调用时按当前语言翻译）
interface PresetItem {
  key: string
  label: string
  icon: string
  /** 分组标题（模板切换器内分组展示） */
  group: string
  /** 平铺 Schema 工厂（与 nodes 二选一） */
  schema?: () => FormSchema
  /** 含嵌套容器的节点树工厂（与 schema 二选一） */
  nodes?: () => DesignerNode[]
  meta?: () => FormMeta
}

const presets: PresetItem[] = [
  { key: 'store-report', label: '门店提报', icon: 'store', group: '业务模板', schema: storeReportSchema },
  { key: 'contract', label: '合同收集', icon: 'file-text', group: '业务模板', schema: contractCollectionSchema },
  {
    key: 'container',
    label: '容器布局',
    icon: 'layout-template',
    group: '布局示例',
    nodes: containerDemoNodes,
    meta: containerDemoMeta,
  },
]

/** 模板按 group 分组（保持声明顺序） */
const presetGroups = computed(() => {
  const groups: { label: string; items: PresetItem[] }[] = []
  for (const p of presets) {
    let g = groups.find((x) => x.label === p.group)
    if (!g) {
      g = { label: p.group, items: [] }
      groups.push(g)
    }
    g.items.push(p)
  }
  return groups
})

// 当前选中的预置模板
const activePreset = ref<string>('')

// ════════════════════════════════════════
// 模板悬浮预览 — hover 弹出真实渲染，免盲选（所见即所选）
// ════════════════════════════════════════
const previewTemplate = ref<string | null>(null)
let hoverTimer: ReturnType<typeof setTimeout> | null = null

function clearHoverTimer(): void {
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = null
}
/** 移入模板按钮：250ms 后打开预览（快速划过不闪弹） */
function onPresetEnter(key: string): void {
  clearHoverTimer()
  hoverTimer = setTimeout(() => {
    previewTemplate.value = key
  }, 250)
}
/** 移出：留 180ms 缓冲让鼠标滑进预览卡，进卡即取消关闭 */
function schedulePreviewClose(): void {
  clearHoverTimer()
  hoverTimer = setTimeout(() => {
    previewTemplate.value = null
  }, 180)
}
function cancelPreviewClose(): void {
  clearHoverTimer()
}

const previewTemplateLabel = computed(() => presets.find((x) => x.key === previewTemplate.value)?.label ?? '')
const previewTemplateSchema = computed(() => {
  const p = presets.find((x) => x.key === previewTemplate.value)
  if (!p) return null
  // nodes 形态（容器布局模板）→ 转真实 schema 渲染
  if (p.nodes) return toFormSchema(p.nodes(), p.meta?.() ?? {})
  return p.schema?.() ?? null
})

/** 加载预置模板 */
function loadPreset(key: string): void {
  const preset = presets.find((p) => p.key === key)
  if (!preset) return
  activePreset.value = key

  // nodes 形态：直接使用含嵌套容器的节点树
  if (preset.nodes) {
    fields.value = preset.nodes()
    meta.value = { ...(preset.meta?.() ?? {}) }
    return
  }

  const s = preset.schema!()
  // 将 FormSchema 反向映射为 DesignerField[]
  fields.value = s.fields.map((f, i): DesignerField => ({
    id: 'pf' + (i + 1),
    key: f.key,
    label: f.label,
    type: f.type as DesignerField['type'],
    required: f.required,
    placeholder: f.placeholder,
    disabled: f.disabled,
    hint: f.hint,
    span: f.span,
    group: f.group,
    // 选项取 label：设计器 options 语义为「显示文本 = 值」，
    // schema 的 Option[] 可能 value/label 分离（如 gender: value='male' label='男'），
    // 只取 value 会把英文编码当标签显示，取 label 保证画布/预览显示用户可见文案
    options: f.options?.map((o) => o.label ?? String(o.value)),
    defaultValue: f.default,
    min: f.props?.min as number | undefined,
    max: f.props?.max as number | undefined,
    step: f.props?.step as number | undefined,
    maxLength: f.props?.maxlength as number | undefined,
    rows: f.props?.rows as number | undefined,
    rateMax: f.props?.rateMax as number | undefined,
    rateAllowHalf: f.props?.allowHalf as boolean | undefined,
    cascaderOptions: f.cascaderOptions ? JSON.stringify(f.cascaderOptions) : undefined,
    accept: f.props?.accept as string | undefined,
    multiple: f.props?.multiple as boolean | undefined,
    maxSize: f.props?.maxSize as number | undefined,
    visibleWhenField: f.visibleWhen?.field,
    visibleWhenValue: f.visibleWhen?.equals !== undefined ? String(f.visibleWhen.equals) : '',
    visibleWhenNot: f.visibleWhen?.not,
  }))
  meta.value = {
    title: s.title,
    description: s.description,
    submitText: s.submitText,
    resetText: s.resetText,
    layout: s.layout,
    columns: s.columns,
    steps: s.steps,
    hideActions: s.hideActions,
    validateOnChange: s.validateOnChange,
  }
}
</script>

<template>
  <div class="lc-demo">
    <!-- 能力说明头部 — 首次进入先讲清这套低代码能做什么 -->
    <header class="lc-demo-head">
      <div class="lc-demo-head-text">
        <h2 class="lc-demo-title">低代码表单平台</h2>
        <p class="lc-demo-sub">拖拽设计 → 实时预览 → 数据收集，一套 Schema 同时驱动设计器与运行端</p>
      </div>
      <ul class="lc-demo-chips">
        <li v-for="c in capabilities" :key="c" class="lc-demo-chip">{{ c }}</li>
      </ul>
    </header>

    <!-- 标签栏 -->
    <div class="lc-demo-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="lc-demo-tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <IconSvg :type="tab.icon" size="sm" />
        <span>{{ tab.label }}</span>
      </button>
      <div class="lc-demo-tabs-right" @mouseleave="schedulePreviewClose">
        <div v-for="g in presetGroups" :key="g.label" class="lc-demo-preset-group">
          <span class="lc-demo-preset-group-label">{{ g.label }}</span>
          <div class="lc-demo-presets">
            <button
              v-for="p in g.items"
              :key="p.key"
              class="lc-demo-preset-btn"
              :class="{ active: activePreset === p.key }"
              @click="loadPreset(p.key)"
              @mouseenter="onPresetEnter(p.key)"
            >
              <IconSvg :type="p.icon" size="xs" />
              {{ p.label }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 模板悬浮预览：hover 模板按钮后弹出真实渲染（可交互试填） -->
    <Transition name="lc-fade">
      <div
        v-if="previewTemplateSchema"
        class="lc-preset-preview"
        :style="{ top: `${headH + 54}px` }"
        role="dialog"
        :aria-label="`${previewTemplateLabel} 预览`"
        @mouseenter="cancelPreviewClose"
        @mouseleave="schedulePreviewClose"
      >
        <div class="lc-preset-preview-head">
          <span>
            <IconSvg type="eye" size="xs" />
            {{ previewTemplateLabel }} · 预览
          </span>
          <button class="lc-preset-preview-close" aria-label="关闭预览" @click="previewTemplate = null">
            <IconSvg type="x" size="xs" />
          </button>
        </div>
        <div class="lc-preset-preview-body">
          <FormBuilder :schema="previewTemplateSchema" />
        </div>
      </div>
    </Transition>

    <!-- 内容区 -->
    <!-- 设计 -->
    <div v-if="activeTab === 'design'">
      <FormDesigner v-model:fields="fields" v-model:meta="meta" :height="designHeight" />
    </div>

    <!-- 预览 -->
    <div v-else-if="activeTab === 'preview'" class="lc-demo-preview">
      <div v-if="!fields.length" class="lc-demo-placeholder">
        <div class="lc-demo-placeholder-icon">
          <IconSvg type="mouse-pointer-click" size="xl" />
        </div>
        <p>请先在「设计」中添加字段</p>
      </div>
      <FormBuilder v-else v-model="previewData" :schema="previewSchema" readonly @submit="previewData = {}" />
    </div>

    <!-- 收集 -->
    <div v-else-if="activeTab === 'collect'" class="lc-demo-preview">
      <div v-if="!fields.length" class="lc-demo-placeholder">
        <div class="lc-demo-placeholder-icon">
          <IconSvg type="mouse-pointer-click" size="xl" />
        </div>
        <p>请先在「设计」中添加字段</p>
      </div>
      <FormCollect v-else :fields="fields" :meta="meta" />
    </div>
  </div>
</template>

<style scoped>
.lc-demo {
  position: relative;
  padding: 20px;
}

/* ── 能力说明头部 ── */
.lc-demo-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 24px;
  margin-bottom: 16px;
}
.lc-demo-title {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 700;
  color: var(--color-text, #1e293b);
}
.lc-demo-sub {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary, #475569);
}
.lc-demo-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.lc-demo-chip {
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-bg-alt, #f8fafc);
  font-size: 11.5px;
  color: var(--color-text-secondary, #475569);
  white-space: nowrap;
}

/* ── 标签栏 — 对齐原型 ── */
.lc-demo-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px;
  background: var(--color-bg, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  margin-bottom: 20px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.lc-demo-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 20px;
  border: none;
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: var(--color-text-secondary, #475569);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  line-height: 1;
  transition: all 0.18s ease;
}
.lc-demo-tab:hover {
  background: var(--color-bg-alt, #f8fafc);
  color: var(--color-text, #1e293b);
}
.lc-demo-tab.active {
  background: linear-gradient(135deg, #4f6ef7 0%, #3b5de5 100%);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 3px 10px rgba(79, 110, 247, 0.25);
}
.lc-demo-tabs-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 4px;
}

/* 预置模板切换（按「业务模板 / 布局示例」分组） */
.lc-demo-preset-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.lc-demo-preset-group-label {
  font-size: 11px;
  color: var(--color-text-muted, #94a3b8);
  white-space: nowrap;
}
.lc-demo-presets {
  display: inline-flex;
  gap: 4px;
}
.lc-demo-preset-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background: var(--color-bg, #fff);
  color: var(--color-text-secondary, #475569);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.15s ease;
}
.lc-demo-preset-btn:hover {
  border-color: var(--color-primary, #4f6ef7);
  color: var(--color-primary, #4f6ef7);
}
.lc-demo-preset-btn.active {
  background: var(--color-primary-light, #eef1ff);
  border-color: var(--color-primary, #4f6ef7);
  color: var(--color-primary, #4f6ef7);
}

/* ── 内容区 — 满宽，与其它 demo 页一致 ── */
.lc-demo-preview {
  width: 100%;
}
.lc-demo-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 360px;
  gap: 12px;
}
.lc-demo-placeholder-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg, 12px);
  background: var(--color-bg-alt, #f3f4f6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted, #9ca3af);
}
.lc-demo-placeholder p {
  margin: 0;
  font-size: 13.5px;
  color: var(--color-text-secondary, #6b7280);
}

/* ── 模板悬浮预览 ── */
.lc-preset-preview {
  position: absolute;
  right: 16px;
  z-index: 80;
  width: 640px;
  max-width: calc(100vw - 48px);
  max-height: min(72vh, 680px);
  display: flex;
  flex-direction: column;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  box-shadow:
    0 10px 15px -3px rgba(0, 0, 0, 0.08),
    0 4px 6px -4px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}
.lc-preset-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 14px;
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
  background: var(--color-bg-alt, #f8fafc);
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text, #1e293b);
}
.lc-preset-preview-head span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.lc-preset-preview-close {
  display: flex;
  padding: 3px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 4px;
  color: var(--color-text-muted, #9ca3af);
  transition: all 0.12s;
}
.lc-preset-preview-close:hover {
  color: var(--color-text, #1e293b);
  background: var(--color-bg, #f1f5f9);
}
.lc-preset-preview-body {
  overflow-y: auto;
  padding: 18px 20px;
}
/* 悬浮进出场 */
.lc-fade-enter-active,
.lc-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.lc-fade-enter-from,
.lc-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
