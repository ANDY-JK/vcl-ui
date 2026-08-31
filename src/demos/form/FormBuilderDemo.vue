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
import type { DesignerField, DesignerNode, FormMeta } from '@/components/form-builder'
import {
  registrationSchema,
  inspectionSchema,
  contractCollectionSchema,
  containerDemoNodes,
  containerDemoMeta,
  rebateLetterSchema,
  shelfCollectionSchema,
  reviewFormSchema,
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
//          − 工具栏实际高（一行 51 / 换行 83，量取避免估算）
// ════════════════════════════════════════
const bodyClientH = ref(0)
const toolbarH = ref(83)
let bodyObserver: ResizeObserver | null = null
let toolbarObserver: ResizeObserver | null = null

const measureBody = () => {
  const el = document.querySelector('.content-body')
  if (el) bodyClientH.value = el.clientHeight
}
const measureToolbar = () => {
  const el = document.querySelector('.ld-toolbar')
  if (el) toolbarH.value = el.getBoundingClientRect().height
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

  window.addEventListener('resize', measureBody)
})
onUnmounted(() => {
  bodyObserver?.disconnect()
  toolbarObserver?.disconnect()
  window.removeEventListener('resize', measureBody)
})
const designHeight = computed(() => `${Math.max(bodyClientH.value - 157 - toolbarH.value, 355)}px`)

/** 预览用 Schema（从设计数据转换） */
const previewSchema = computed(() => toFormSchema(fields.value, meta.value))

// 预置模板列表（schema 为平铺 FormSchema 工厂；nodes 为含嵌套容器的 DesignerNode 树工厂 — 调用时按当前语言翻译）
const presets = [
  { key: 'registration', label: '用户登记', icon: 'user', schema: registrationSchema },
  { key: 'inspection', label: '设备巡检', icon: 'clipboard-check', schema: inspectionSchema },
  { key: 'contract', label: '合同收集', icon: 'file-text', schema: contractCollectionSchema },
  { key: 'rebate', label: '返利函收集', icon: 'file-text', schema: rebateLetterSchema },
  { key: 'shelf', label: '陈列收集', icon: 'image', schema: shelfCollectionSchema },
  { key: 'review', label: '审批流程', icon: 'clipboard-check', schema: reviewFormSchema },
  { key: 'container', label: '容器布局', icon: 'layout-template', nodes: containerDemoNodes, meta: containerDemoMeta },
] as const

// 当前选中的预置模板
const activePreset = ref<string>('')

/** 加载预置模板 */
function loadPreset(key: string): void {
  const preset = presets.find((p) => p.key === key)
  if (!preset) return
  activePreset.value = key

  // nodes 形态：直接使用含嵌套容器的节点树（presets 已函数化，调用时取值）
  if ('nodes' in preset && preset.nodes) {
    fields.value = preset.nodes() as DesignerNode[]
    meta.value = { ...(preset.meta() as FormMeta) }
    return
  }

  const s = (preset as { schema: typeof registrationSchema }).schema()
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
      <div class="lc-demo-tabs-right">
        <button v-if="!fields.length" class="lc-demo-sample-btn" @click="loadPreset('registration')">
          <IconSvg type="sparkles" size="xs" />
          加载示例
        </button>
        <div v-else class="lc-demo-presets">
          <button
            v-for="p in presets"
            :key="p.key"
            class="lc-demo-preset-btn"
            :class="{ active: activePreset === p.key }"
            @click="loadPreset(p.key)"
          >
            <IconSvg :type="p.icon" size="xs" />
            {{ p.label }}
          </button>
        </div>
      </div>
    </div>

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
  padding: 20px;
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
  gap: 6px;
  padding-right: 4px;
}
.lc-demo-sample-btn {
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
.lc-demo-sample-btn:hover {
  border-color: var(--color-primary, #4f6ef7);
  color: var(--color-primary, #4f6ef7);
}
.lc-demo-sample-btn.active {
  background: var(--color-primary-light, #eef1ff);
  border-color: var(--color-primary, #4f6ef7);
  color: var(--color-primary, #4f6ef7);
}

/* 预置模板切换 */
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
</style>
