<script setup lang="ts">
/**
 * 低代码表单 Demo — 设计 → 预览 → 收集 全流程
 *
 * 三标签页：
 * 1. 设计：拖拽设计器，编辑字段属性
 * 2. 预览：实时渲染表单
 * 3. 收集：数据收集 + 记录管理 + Excel 导出
 */
import { ref, computed } from 'vue'
import { FormDesigner, FormCollect, FormBuilder, toFormSchema } from '@/components/form-builder'
import type { DesignerField, FormMeta } from '@/components/form-builder'
import { registrationSchema, inspectionSchema, contractCollectionSchema } from '@/components/form-builder'
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

/** 预览用 Schema（从设计数据转换） */
const previewSchema = computed(() => toFormSchema(fields.value, meta.value))

// 预置模板列表
const presets = [
  { key: 'registration', label: '用户登记', icon: 'user', schema: registrationSchema },
  { key: 'inspection', label: '设备巡检', icon: 'clipboard-check', schema: inspectionSchema },
  { key: 'contract', label: '合同收集', icon: 'file-text', schema: contractCollectionSchema },
] as const

// 当前选中的预置模板
const activePreset = ref<string>('')

/** 加载预置模板 */
function loadPreset(key: string): void {
  const preset = presets.find(p => p.key === key)
  if (!preset) return
  activePreset.value = key
  const s = preset.schema
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
    options: f.options?.map(o => String(o.value)),
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
    <!-- 顶部标题区 -->
    <div class="lc-demo-hero">
      <div class="lc-demo-hero-icon">
        <IconSvg type="layout-template" size="xl" />
      </div>
      <div>
        <h2 class="lc-demo-title">低代码表单平台</h2>
        <p class="lc-demo-subtitle">拖拽设计 → 实时预览 → 数据收集，一站式表单解决方案</p>
      </div>
      <div class="lc-demo-badge">
        <span class="lc-demo-badge-dot" />
        <span>原型 v2.0</span>
      </div>
    </div>

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
      <FormDesigner
        v-model:fields="fields"
        v-model:meta="meta"
        height="620px"
      />
    </div>

    <!-- 预览 -->
    <div v-else-if="activeTab === 'preview'" class="lc-demo-preview">
      <div v-if="!fields.length" class="lc-demo-placeholder">
        <div class="lc-demo-placeholder-icon">
          <IconSvg type="mouse-pointer-click" size="xl" />
        </div>
        <p>请先在「设计」中添加字段</p>
      </div>
      <FormBuilder
        v-else
        v-model="previewData"
        :schema="previewSchema"
        readonly
        @submit="previewData = {}"
      />
    </div>

    <!-- 收集 -->
    <div v-else-if="activeTab === 'collect'" class="lc-demo-preview">
      <div v-if="!fields.length" class="lc-demo-placeholder">
        <div class="lc-demo-placeholder-icon">
          <IconSvg type="mouse-pointer-click" size="xl" />
        </div>
        <p>请先在「设计」中添加字段</p>
      </div>
      <FormCollect
        v-else
        :fields="fields"
        :meta="meta"
      />
    </div>
  </div>
</template>

<style scoped>
.lc-demo {
  padding: 20px;
  max-width: 1480px;
  margin: 0 auto;
}

/* ── 顶部标题区 — 对齐原型 ── */
.lc-demo-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
.lc-demo-hero-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, #667eea 0%, #4f6ef7 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 6px 16px rgba(79,110,247,0.3);
}
.lc-demo-title {
  margin: 0 0 2px;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.3px;
  color: #1a202c;
}
.lc-demo-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary, #475569);
}
.lc-demo-badge {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: var(--color-bg, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary, #4f6ef7);
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.lc-demo-badge-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-success, #10b981);
  animation: lc-pulse-dot 2s ease-in-out infinite;
}
@keyframes lc-pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
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
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
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
  box-shadow: 0 3px 10px rgba(79,110,247,0.25);
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

/* ── 内容区 ── */
.lc-demo-preview {
  max-width: 640px;
  margin: 0 auto;
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
