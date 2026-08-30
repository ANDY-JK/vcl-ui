<script setup lang="ts">
/**
 * 属性面板 — 设计器右栏 (v3)
 *
 * v3 变化：
 * - 分页属性面板：基本 / 校验 / 样式 / 事件 / 数据
 * - 基本属性页：原有属性 + 前缀图标 + 后缀文字 + 只读
 * - 校验页：必填提示语 + 内置校验规则列表 + 自定义正则 + 唯一校验 + 实时校验
 * - 样式页：标签宽度/位置 + 控件宽度/尺寸/圆角 + 颜色定制 + 自定义 CSS
 * - 事件页：onChange/onFocus/onBlur 事件配置 + 字段联动
 * - 数据页：默认值类型 + 远程数据源 + 数据联动 + 持久化
 */
import { computed, ref } from 'vue'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import IconPicker from '@/components/form/IconPicker.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useT } from '@/components/_internal/i18n'
import {
  getTypeLabel,
  getTypeIcon,
  parseCascaderOptions,
  isContainerNode,
  flattenNodes,
  type DesignerNode,
} from './types'
import { getFieldDefaults, getComponentCategory } from '../fieldRegistry'

const t = useT()

const props = defineProps<{
  node: DesignerNode
  /** 全部节点列表（用于条件显示的可选字段下拉） */
  allNodes?: DesignerNode[]
}>()

const emit = defineEmits<{
  update: [patch: Partial<DesignerNode>]
  'name-change': [label: string]
}>()

// ════════════════════════════════════════
// 属性页切换
// ════════════════════════════════════════

type PropTab = 'basic' | 'validation' | 'style' | 'event' | 'data'
const activeTab = ref<PropTab>('basic')

/** 属性分页 tab（computed：语言切换时重算） */
const tabs = computed<{ id: PropTab; label: string }[]>(() => [
  { id: 'basic', label: t('fbp.tabBasic') },
  { id: 'validation', label: t('fbp.tabValidation') },
  { id: 'style', label: t('fbp.tabStyle') },
  { id: 'event', label: t('fbp.tabEvent') },
  { id: 'data', label: t('fbp.tabData') },
])

/** 容器节点只显示基本属性页 */
const availableTabs = computed(() => {
  if (isContainerNode(props.node)) return [{ id: 'basic' as PropTab, label: t('fbp.tabBasic') }]
  return tabs.value
})

// ════════════════════════════════════════
// 通用工具
// ════════════════════════════════════════

const isContainer = computed(() => isContainerNode(props.node))

/** span 下拉选项（computed：语言切换时重算） */
const spanOptions = computed(() => [
  { value: 24, label: t('fbp.spanFull') },
  { value: 12, label: t('fbp.spanHalf') },
  { value: 8, label: t('fbp.spanThird') },
  { value: 6, label: t('fbp.spanQuarter') },
])

/** Input 值转换 */
function onInputEmit(key: keyof DesignerNode, v: unknown): void {
  const val = v === null ? '' : String(v)
  emit('update', { [key]: val } as Partial<DesignerNode>)
}

/** 标签名称输入：同步 update + name-change（命名函数替代模板内联多语句，prettier 安全） */
function onLabelInput(v: unknown): void {
  onInputEmit('label', v)
  emit('name-change', String(v ?? ''))
}

/** Group 值转换 */
function onGroupEmit(key: keyof DesignerNode, v: unknown): void {
  emit('update', { [key]: !!v } as Partial<DesignerNode>)
}

/** Number 值转换 */
function onNumberEmit(key: keyof DesignerNode, v: unknown): void {
  const num = Number(v)
  emit('update', { [key]: isNaN(num) ? 0 : num } as Partial<DesignerNode>)
}

/** 可选的触发字段列表（含容器内字段，供条件显示/事件目标字段选择） */
const visibleWhenFieldOptions = computed(() => {
  const all = flattenNodes(props.allNodes ?? [])
  const myKey = props.node.key
  return all
    .filter((n) => n.id !== props.node.id && !isContainerNode(n))
    .filter((n) => n.key && n.key !== myKey)
    .map((n) => ({ value: n.key!, label: `${n.label} (${n.key})` }))
})

/** 内置校验规则列表 */
const builtinValidations = computed(() => {
  const v = props.node.validation
  return [
    { name: t('fbp.valMinLen'), value: v?.minLength, key: 'minLength', type: 'number' },
    { name: t('fbp.valMaxLen'), value: v?.maxLength, key: 'maxLength', type: 'number' },
    { name: t('fbp.valPattern'), value: v?.pattern, key: 'pattern', type: 'text' },
    {
      name: t('fbp.valPhone'),
      value: v?.builtinType === 'phone',
      key: 'builtinType',
      type: 'toggle',
      toggleValue: 'phone',
    },
    {
      name: t('fbp.valEmail'),
      value: v?.builtinType === 'email',
      key: 'builtinType',
      type: 'toggle',
      toggleValue: 'email',
    },
    {
      name: t('fbp.valIdcard'),
      value: v?.builtinType === 'idcard',
      key: 'builtinType',
      type: 'toggle',
      toggleValue: 'idcard',
    },
    { name: t('fbp.valUrl'), value: v?.builtinType === 'url', key: 'builtinType', type: 'toggle', toggleValue: 'url' },
  ]
})

/** 判断字段类型是否需要显示选项编辑（注册表 defaults 含 options 即需要） */
const hasOptions = computed(() => 'options' in getFieldDefaults(props.node.type))

/** 判断字段类型是否支持某通用属性（注册表 defaults 含对应 key 即支持） */
function hasProp(key: string): boolean {
  return key in getFieldDefaults(props.node.type)
}

/** 判断字段类型是否支持提示文字（input/select/upload 类字段） */
const hasHint = computed(() => ['input', 'select', 'upload'].includes(getComponentCategory(props.node.type)))

/** 判断字段类型是否支持前缀图标/后缀文字（Input 文本输入分支，不含 textarea） */
const isTextInput = computed(() => getComponentCategory(props.node.type) === 'input' && props.node.type !== 'textarea')

/** 联动公式的 placeholder 文本 */
const linkageFormulaPlaceholder = computed(() => {
  const lt = props.node.eventConfig?.linkageType
  if (lt === 'followValue') return t('fbp.formulaHintValue')
  if (lt === 'showHide') return t('fbp.formulaHintShowHide')
  if (lt === 'followOptions') return t('fbp.formulaHintOptions')
  return ''
})

/** 联动帮助提示文本 */
const linkageHelpText = computed(() => {
  const lt = props.node.eventConfig?.linkageType
  if (lt === 'followValue') return t('fbp.linkageHelpValue')
  if (lt === 'showHide') return t('fbp.linkageHelpShowHide')
  if (lt === 'followOptions') return t('fbp.linkageHelpOptions')
  return ''
})
</script>

<template>
  <aside class="ldp-props">
    <div v-if="node" class="ldp-props-body">
      <!-- 字段头部 -->
      <div class="ldp-props-header">
        <IconSvg :type="isContainer ? 'layout-template' : 'settings-2'" size="sm" />
        <span>{{ t('fbp.propsConfig') }}</span>
        <span class="ldp-props-type-badge">{{ getTypeLabel(node.type) }}</span>
      </div>

      <!-- 属性分页 tab -->
      <div class="ldp-prop-tabs" role="tablist">
        <div
          v-for="tab in availableTabs"
          :key="tab.id"
          class="ldp-prop-tab"
          :class="{ active: activeTab === tab.id }"
          role="tab"
          :aria-selected="activeTab === tab.id"
          tabindex="0"
          @click="activeTab = tab.id"
          @keydown.enter.prevent="activeTab = tab.id"
          @keydown.space.prevent="activeTab = tab.id"
        >
          {{ tab.label }}
        </div>
      </div>

      <!-- ═══ 基本属性页 ═══ -->
      <div v-show="activeTab === 'basic'" class="ldp-prop-page">
        <div class="ldp-section-title">{{ t('fbp.sectionBasic') }}</div>

        <div class="ldp-prop">
          <label>{{ t('fbp.labelName') }}</label>
          <!-- paragraph：说明文字为多行内容，用 textarea 编辑 label -->
          <textarea
            v-if="node.type === 'paragraph'"
            class="ldp-options-editor"
            :value="node.label"
            rows="3"
            :placeholder="t('fbp.paragraphPh')"
            @input="onLabelInput(($event.target as HTMLTextAreaElement).value)"
          />
          <Input
            v-else
            :model-value="node.label"
            :placeholder="t('fbp.labelNamePh')"
            @update:model-value="onLabelInput"
          />
        </div>

        <!-- 容器节点专属 -->
        <template v-if="isContainer">
          <div class="ldp-prop">
            <label>{{ t('fbp.containerType') }}</label>
            <div class="ldp-type-readonly">
              <IconSvg type="layout-template" size="xs" />
              {{ getTypeLabel(node.type) }}
            </div>
          </div>

          <!-- grid 容器：列数 -->
          <template v-if="node.type === 'grid'">
            <div class="ldp-section-title">{{ t('fbp.sectionGrid') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.columns') }}</label>
              <Select
                :model-value="node.containerConfig?.columns ?? 2"
                :options="[
                  { value: 2, label: t('fbp.col2') },
                  { value: 3, label: t('fbp.col3') },
                  { value: 4, label: t('fbp.col4') },
                ]"
                @update:model-value="
                  emit('update', { containerConfig: { ...node.containerConfig, columns: Number($event) } })
                "
              />
            </div>
          </template>

          <!-- flex 容器：间距/换行/对齐 -->
          <template v-if="node.type === 'flex'">
            <div class="ldp-section-title">{{ t('fbp.sectionFlex') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.flexGap') }}</label>
              <Select
                :model-value="node.containerConfig?.gap ?? 12"
                :options="[
                  { value: 4, label: '4px' },
                  { value: 8, label: '8px' },
                  { value: 12, label: '12px' },
                  { value: 16, label: '16px' },
                  { value: 24, label: '24px' },
                ]"
                @update:model-value="
                  emit('update', { containerConfig: { ...node.containerConfig, gap: Number($event) } })
                "
              />
            </div>
            <div class="ldp-prop ldp-prop-switch">
              <label>{{ t('fbp.flexWrap') }}</label>
              <Group
                type="switch"
                :model-value="node.containerConfig?.wrap !== false"
                @update:model-value="emit('update', { containerConfig: { ...node.containerConfig, wrap: !!$event } })"
              />
            </div>
            <div class="ldp-prop">
              <label>{{ t('fbp.flexJustify') }}</label>
              <Select
                :model-value="node.containerConfig?.justify ?? 'start'"
                :options="[
                  { value: 'start', label: t('fbp.justifyStart') },
                  { value: 'center', label: t('fbp.justifyCenter') },
                  { value: 'space-between', label: t('fbp.justifyBetween') },
                ]"
                @update:model-value="
                  emit('update', {
                    containerConfig: {
                      ...node.containerConfig,
                      justify: String($event) as 'start' | 'center' | 'space-between',
                    },
                  })
                "
              />
            </div>
          </template>

          <!-- tabs 容器：标签页列表 -->
          <template v-if="node.type === 'tabs'">
            <div class="ldp-section-title">{{ t('fbp.sectionTabs') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.tabsList') }}</label>
              <textarea
                class="ldp-options-editor"
                :value="(node.containerConfig?.tabs ?? []).map((t) => t.label).join('\n')"
                :placeholder="t('fbp.tabsPh')"
                rows="4"
                @input="
                  emit('update', {
                    containerConfig: {
                      ...node.containerConfig,
                      tabs: ($event.target as HTMLTextAreaElement).value
                        .split('\n')
                        .filter(Boolean)
                        .map((label, i) => ({ label, name: 'tab' + (i + 1) })),
                    },
                  })
                "
              />
            </div>
          </template>

          <!-- collapse 容器：折叠项列表 -->
          <template v-if="node.type === 'collapse'">
            <div class="ldp-section-title">{{ t('fbp.sectionCollapse') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.collapseList') }}</label>
              <textarea
                class="ldp-options-editor"
                :value="(node.containerConfig?.collapseItems ?? []).map((c) => c.title).join('\n')"
                :placeholder="t('fbp.collapsePh')"
                rows="4"
                @input="
                  emit('update', {
                    containerConfig: {
                      ...node.containerConfig,
                      collapseItems: ($event.target as HTMLTextAreaElement).value
                        .split('\n')
                        .filter(Boolean)
                        .map((title) => ({ title, expanded: true })),
                    },
                  })
                "
              />
            </div>
          </template>

          <!-- steps 容器：步骤列表 -->
          <template v-if="node.type === 'steps'">
            <div class="ldp-section-title">{{ t('fbp.sectionSteps') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.stepsList') }}</label>
              <textarea
                class="ldp-options-editor"
                :value="(node.containerConfig?.steps ?? []).map((s) => s.title).join('\n')"
                :placeholder="t('fbp.stepsPh')"
                rows="4"
                @input="
                  emit('update', {
                    containerConfig: {
                      ...node.containerConfig,
                      steps: ($event.target as HTMLTextAreaElement).value
                        .split('\n')
                        .filter(Boolean)
                        .map((title) => ({ title })),
                    },
                  })
                "
              />
            </div>
          </template>
        </template>

        <!-- 字段节点专属属性 -->
        <template v-else>
          <div class="ldp-prop">
            <label>{{ t('fbp.fieldKey') }}</label>
            <Input
              :model-value="node.key ?? ''"
              :placeholder="t('fbp.fieldKeyPh')"
              @update:model-value="emit('update', { key: $event === null ? '' : String($event) })"
            />
          </div>

          <div class="ldp-prop ldp-prop-readonly">
            <label>{{ t('fbp.fieldType') }}</label>
            <div class="ldp-type-readonly">
              <IconSvg :type="getTypeIcon(node.type)" size="xs" />
              {{ getTypeLabel(node.type) }}
            </div>
          </div>

          <div class="ldp-prop">
            <label>{{ t('fbp.spanWidth') }}</label>
            <Select
              :model-value="node.span ?? 24"
              :options="spanOptions"
              @update:model-value="emit('update', { span: Number($event) })"
            />
          </div>

          <div class="ldp-prop ldp-prop-switch">
            <label>{{ t('fbp.required') }}</label>
            <Group
              type="switch"
              :model-value="!!node.required"
              @update:model-value="emit('update', { required: !!$event })"
            />
          </div>

          <div class="ldp-prop ldp-prop-switch">
            <label>{{ t('fbp.disabled') }}</label>
            <Group
              type="switch"
              :model-value="!!node.disabled"
              @update:model-value="emit('update', { disabled: !!$event })"
            />
          </div>

          <div class="ldp-prop ldp-prop-switch">
            <label>{{ t('fbp.readonly') }}</label>
            <Group
              type="switch"
              :model-value="!!node.readonly"
              @update:model-value="emit('update', { readonly: !!$event })"
            />
          </div>

          <!-- 占位符 -->
          <template v-if="hasProp('placeholder')">
            <div class="ldp-section-title">{{ t('fbp.sectionDisplay') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.placeholder') }}</label>
              <Input
                :model-value="node.placeholder ?? ''"
                :placeholder="t('fbp.placeholderPh')"
                @update:model-value="onInputEmit('placeholder', $event)"
              />
            </div>
            <!-- 前缀图标 / 后缀文字（文本输入类字段） -->
            <template v-if="isTextInput">
              <div class="ldp-prop">
                <label>{{ t('fbp.prefixIcon') }}</label>
                <div class="ldp-prop-inline">
                  <IconPicker
                    :model-value="node.icon ?? ''"
                    :placeholder="t('fbp.prefixIconPh')"
                    @update:model-value="emit('update', { icon: String($event ?? '') })"
                  />
                  <button
                    v-if="node.icon"
                    type="button"
                    class="ldp-icon-clear"
                    :title="t('fbp.clearIcon')"
                    @click="emit('update', { icon: '' })"
                  >
                    <IconSvg type="x" size="xs" />
                  </button>
                </div>
              </div>
              <div class="ldp-prop">
                <label>{{ t('fbp.suffixText') }}</label>
                <Input
                  :model-value="node.suffixText ?? ''"
                  :placeholder="t('fbp.suffixTextPh')"
                  @update:model-value="onInputEmit('suffixText', $event)"
                />
              </div>
            </template>
          </template>

          <!-- 提示文字 -->
          <template v-if="hasHint">
            <div class="ldp-prop">
              <label>{{ t('fbp.hint') }}</label>
              <Input
                :model-value="node.hint ?? ''"
                :placeholder="t('fbp.hintPh')"
                @update:model-value="onInputEmit('hint', $event)"
              />
            </div>
          </template>

          <!-- 默认值 -->
          <template v-if="['text', 'textarea'].includes(node.type)">
            <div class="ldp-section-title">{{ t('fbp.defaultValue') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.defaultValue') }}</label>
              <Input
                :model-value="(node.defaultValue as string) ?? ''"
                @update:model-value="onInputEmit('defaultValue', $event)"
              />
            </div>
          </template>

          <template v-if="node.type === 'number'">
            <div class="ldp-section-title">{{ t('fbp.defaultValue') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.defaultValue') }}</label>
              <Input
                type="number"
                :model-value="(node.defaultValue as number) ?? 0"
                @update:model-value="onNumberEmit('defaultValue', $event)"
              />
            </div>
          </template>

          <template v-if="node.type === 'switch'">
            <div class="ldp-section-title">{{ t('fbp.defaultValue') }}</div>
            <div class="ldp-prop ldp-prop-switch">
              <label>{{ t('fbp.defaultOn') }}</label>
              <Group
                type="switch"
                :model-value="!!node.defaultValue"
                @update:model-value="onGroupEmit('defaultValue', $event)"
              />
            </div>
          </template>

          <!-- 选项编辑 -->
          <template v-if="hasOptions">
            <div class="ldp-section-title">{{ t('fbp.sectionOptions') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.optionsList') }}</label>
              <textarea
                class="ldp-options-editor"
                :value="(node.options || []).join('\n')"
                :placeholder="t('fbp.optionsPh')"
                rows="5"
                @input="
                  emit('update', { options: ($event.target as HTMLTextAreaElement).value.split('\n').filter(Boolean) })
                "
              />
              <span class="ldp-option-count">{{ t('fbp.optionCount', { n: (node.options || []).length }) }}</span>
            </div>
          </template>

          <!-- 数字属性 -->
          <template v-if="['number', 'slider'].includes(node.type)">
            <div class="ldp-section-title">{{ t('fbp.sectionRange') }}</div>
            <div class="ldp-prop-row">
              <div class="ldp-prop">
                <label>{{ t('fbp.min') }}</label>
                <Input type="number" :model-value="node.min ?? 0" @update:model-value="onNumberEmit('min', $event)" />
              </div>
              <div class="ldp-prop">
                <label>{{ t('fbp.max') }}</label>
                <Input type="number" :model-value="node.max ?? 100" @update:model-value="onNumberEmit('max', $event)" />
              </div>
            </div>
            <div class="ldp-prop">
              <label>{{ t('fbp.step') }}</label>
              <Input type="number" :model-value="node.step ?? 1" @update:model-value="onNumberEmit('step', $event)" />
            </div>
          </template>

          <!-- 最大长度（text） -->
          <template v-if="node.type === 'text'">
            <div class="ldp-section-title">{{ t('fbp.sectionLimit') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.valMaxLen') }}</label>
              <Input
                type="number"
                :model-value="node.maxLength ?? 0"
                :placeholder="t('fbp.maxLengthPh')"
                @update:model-value="onNumberEmit('maxLength', $event)"
              />
            </div>
          </template>

          <!-- textarea 行数 -->
          <template v-if="node.type === 'textarea'">
            <div class="ldp-section-title">{{ t('fbp.sectionTextarea') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.rows') }}</label>
              <Input type="number" :model-value="node.rows ?? 3" @update:model-value="onNumberEmit('rows', $event)" />
            </div>
          </template>

          <!-- 评分属性 -->
          <template v-if="node.type === 'rate'">
            <div class="ldp-section-title">{{ t('fbp.sectionRate') }}</div>
            <div class="ldp-prop-row">
              <div class="ldp-prop">
                <label>{{ t('fbp.stars') }}</label>
                <Input
                  type="number"
                  :model-value="node.rateMax ?? 5"
                  @update:model-value="onNumberEmit('rateMax', $event)"
                />
              </div>
              <div class="ldp-prop ldp-prop-switch">
                <label>{{ t('fbp.allowHalf') }}</label>
                <Group
                  type="switch"
                  :model-value="!!node.rateAllowHalf"
                  @update:model-value="onGroupEmit('rateAllowHalf', $event)"
                />
              </div>
            </div>
          </template>

          <!-- 级联选项 -->
          <template v-if="node.type === 'cascader'">
            <div class="ldp-section-title">{{ t('fbp.sectionCascader') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.cascaderOptions') }}</label>
              <textarea
                class="ldp-options-editor"
                :value="node.cascaderOptions"
                :placeholder="t('fbp.cascaderPh')"
                rows="6"
                @input="emit('update', { cascaderOptions: ($event.target as HTMLTextAreaElement).value })"
              />
              <span class="ldp-prop-hint" :class="{ 'ldp-prop-ok': !!parseCascaderOptions(node.cascaderOptions) }">
                <IconSvg
                  :type="!!parseCascaderOptions(node.cascaderOptions) ? 'circle-check' : 'alert-circle'"
                  size="xs"
                />
                {{ parseCascaderOptions(node.cascaderOptions) ? t('fbp.jsonOk') : t('fbp.jsonBad') }}
              </span>
            </div>
          </template>

          <!-- 上传属性 -->
          <template v-if="node.type === 'upload'">
            <div class="ldp-section-title">{{ t('fbp.sectionUpload') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.accept') }}</label>
              <Input
                :model-value="node.accept ?? 'image/*'"
                :placeholder="t('fbp.acceptPh')"
                @update:model-value="onInputEmit('accept', $event)"
              />
            </div>
            <div class="ldp-prop ldp-prop-switch">
              <label>{{ t('fbp.multiple') }}</label>
              <Group
                type="switch"
                :model-value="node.multiple !== false"
                @update:model-value="onGroupEmit('multiple', $event)"
              />
            </div>
            <div class="ldp-prop">
              <label>{{ t('fbp.maxSize') }}</label>
              <Input
                type="number"
                :model-value="node.maxSize ?? 10"
                @update:model-value="onNumberEmit('maxSize', $event)"
              />
            </div>
          </template>

          <!-- ═══ v3 高级字段专属属性 ═══ -->
          <!-- 子表单：列定义 -->
          <template v-if="node.type === 'subform'">
            <div class="ldp-section-title">{{ t('fbp.sectionSubform') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.subformColumns') }}</label>
              <textarea
                class="ldp-options-editor"
                :value="node.subformColumns ?? ''"
                :placeholder="t('fbp.subformColumnsPh')"
                rows="4"
                @input="emit('update', { subformColumns: ($event.target as HTMLTextAreaElement).value })"
              />
              <span class="ldp-prop-hint">{{ t('fbp.subformTypeHint') }}</span>
            </div>
          </template>

          <!-- 关联选择：实体类型 -->
          <template v-if="node.type === 'relate'">
            <div class="ldp-section-title">{{ t('fbp.sectionRelate') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.relateEntity') }}</label>
              <Select
                :model-value="node.relateEntityType ?? 'user'"
                :options="[
                  { value: 'user', label: t('fbp.entityUser') },
                  { value: 'dept', label: t('fbp.entityDept') },
                  { value: 'role', label: t('fbp.entityRole') },
                  { value: 'custom', label: t('fbp.entityCustom') },
                ]"
                @update:model-value="
                  emit('update', { relateEntityType: $event as 'user' | 'dept' | 'role' | 'custom' })
                "
              />
            </div>
          </template>

          <!-- 富文本：工具栏模式 -->
          <template v-if="node.type === 'richtext'">
            <div class="ldp-section-title">{{ t('fbp.sectionRichtext') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.toolbarMode') }}</label>
              <Select
                :model-value="node.richtextToolbar ?? 'simple'"
                :options="[
                  { value: 'simple', label: t('fbp.toolbarSimple') },
                  { value: 'full', label: t('fbp.toolbarFull') },
                ]"
                @update:model-value="emit('update', { richtextToolbar: $event as 'simple' | 'full' })"
              />
            </div>
          </template>

          <!-- 地址选择：详细地址 -->
          <template v-if="node.type === 'address'">
            <div class="ldp-section-title">{{ t('fbp.sectionAddress') }}</div>
            <div class="ldp-prop ldp-prop-switch">
              <label>{{ t('fbp.addressDetail') }}</label>
              <Group
                type="switch"
                :model-value="!!node.addressDetail"
                @update:model-value="emit('update', { addressDetail: !!$event })"
              />
            </div>
          </template>

          <!-- 证件号码：类型列表 -->
          <template v-if="node.type === 'idcard'">
            <div class="ldp-section-title">{{ t('fbp.sectionIdcard') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.idcardTypes') }}</label>
              <textarea
                class="ldp-options-editor"
                :value="node.idcardTypes ?? t('fb.idType1')"
                :placeholder="t('fbp.idcardTypesPh')"
                rows="4"
                @input="emit('update', { idcardTypes: ($event.target as HTMLTextAreaElement).value })"
              />
              <span class="ldp-prop-hint">{{ t('fbp.idcardHint') }}</span>
            </div>
          </template>

          <!-- 评分矩阵：行/列标题 -->
          <template v-if="node.type === 'matrix'">
            <div class="ldp-section-title">{{ t('fbp.sectionMatrix') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.matrixRows') }}</label>
              <textarea
                class="ldp-options-editor"
                :value="node.matrixRows ?? ''"
                :placeholder="t('fbp.matrixRowsPh')"
                rows="4"
                @input="emit('update', { matrixRows: ($event.target as HTMLTextAreaElement).value })"
              />
            </div>
            <div class="ldp-prop">
              <label>{{ t('fbp.matrixCols') }}</label>
              <textarea
                class="ldp-options-editor"
                :value="node.matrixCols ?? ''"
                :placeholder="t('fbp.matrixColsPh')"
                rows="4"
                @input="emit('update', { matrixCols: ($event.target as HTMLTextAreaElement).value })"
              />
            </div>
          </template>

          <!-- 流水号：前缀/日期格式 -->
          <template v-if="node.type === 'serial'">
            <div class="ldp-section-title">{{ t('fbp.sectionSerial') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.prefix') }}</label>
              <Input
                :model-value="node.serialPrefix ?? ''"
                :placeholder="t('fbp.serialPrefixPh')"
                @update:model-value="emit('update', { serialPrefix: String($event ?? '') })"
              />
            </div>
            <div class="ldp-prop">
              <label>{{ t('fbp.dateFormat') }}</label>
              <Select
                :model-value="node.serialDateFormat ?? 'YYYYMMDD'"
                :options="[
                  { value: 'YYYYMMDD', label: t('fbp.dateYMD') },
                  { value: 'YYYY', label: t('fbp.dateY') },
                  { value: 'YYYYMM', label: t('fbp.dateYM') },
                  { value: 'NONE', label: t('fbp.dateNone') },
                ]"
                @update:model-value="emit('update', { serialDateFormat: String($event ?? 'YYYYMMDD') })"
              />
            </div>
          </template>

          <!-- 条件显示 -->
          <template v-if="node.type !== 'divider' && node.type !== 'title'">
            <div class="ldp-section-title">{{ t('fbp.sectionVisible') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.triggerField') }}</label>
              <Select
                :model-value="node.visibleWhenField ?? ''"
                :options="visibleWhenFieldOptions"
                :placeholder="t('fbp.triggerFieldPh')"
                @update:model-value="
                  emit('update', { visibleWhenField: $event === null ? '' : String($event) || undefined })
                "
              />
            </div>
            <template v-if="node.visibleWhenField">
              <div class="ldp-prop">
                <label>{{ t('fbp.matchValue') }}</label>
                <Input
                  :model-value="node.visibleWhenValue ?? ''"
                  :placeholder="t('fbp.matchValuePh')"
                  @update:model-value="onInputEmit('visibleWhenValue', $event)"
                />
              </div>
              <div class="ldp-prop ldp-prop-switch">
                <label>{{ t('fbp.notMatch') }}</label>
                <Group
                  type="switch"
                  :model-value="!!node.visibleWhenNot"
                  @update:model-value="onGroupEmit('visibleWhenNot', $event)"
                />
              </div>
            </template>
          </template>
        </template>
      </div>

      <!-- ═══ 校验规则页 ═══ -->
      <div v-show="activeTab === 'validation' && !isContainer" class="ldp-prop-page">
        <div class="ldp-section-title">{{ t('fbp.sectionRequired') }}</div>
        <div class="ldp-prop ldp-prop-switch">
          <label>{{ t('fbp.requiredField') }}</label>
          <Group
            type="switch"
            :model-value="!!node.required"
            @update:model-value="emit('update', { required: !!$event })"
          />
        </div>
        <div class="ldp-prop">
          <label>{{ t('fbp.requiredMessage') }}</label>
          <Input
            :model-value="node.validation?.requiredMessage ?? ''"
            :placeholder="t('fbp.requiredMessagePh')"
            @update:model-value="
              emit('update', { validation: { ...node.validation, requiredMessage: String($event ?? '') } })
            "
          />
        </div>

        <div class="ldp-section-title">{{ t('fbp.sectionBuiltin') }}</div>
        <div v-for="rule in builtinValidations" :key="rule.key" class="ldp-validation-rule">
          <span class="ldp-rule-icon" :class="{ on: !!rule.value }">
            <IconSvg :type="rule.value ? 'circle-check' : 'circle'" size="xs" />
          </span>
          <span class="ldp-rule-name">{{ rule.name }}</span>
          <span class="ldp-rule-status" :class="rule.value ? 'on' : 'off'">
            {{ rule.value ? t('fbp.enabled') : t('fbp.disabledState') }}
          </span>
        </div>

        <div class="ldp-section-title">{{ t('fbp.sectionCustom') }}</div>
        <div class="ldp-prop">
          <label>{{ t('fbp.valPattern') }}</label>
          <Input
            :model-value="node.validation?.pattern ?? ''"
            :placeholder="t('fbp.patternPh')"
            @update:model-value="emit('update', { validation: { ...node.validation, pattern: String($event ?? '') } })"
          />
        </div>
        <div class="ldp-prop">
          <label>{{ t('fbp.patternMessage') }}</label>
          <Input
            :model-value="node.validation?.patternMessage ?? ''"
            :placeholder="t('fbp.patternMessagePh')"
            @update:model-value="
              emit('update', { validation: { ...node.validation, patternMessage: String($event ?? '') } })
            "
          />
        </div>
        <div class="ldp-prop ldp-prop-switch">
          <label>{{ t('fbp.trim') }}</label>
          <Group
            type="switch"
            :model-value="!!node.validation?.trim"
            @update:model-value="emit('update', { validation: { ...node.validation, trim: !!$event } })"
          />
        </div>
        <div class="ldp-prop ldp-prop-switch">
          <label>{{ t('fbp.unique') }}</label>
          <Group
            type="switch"
            :model-value="!!node.validation?.unique"
            @update:model-value="emit('update', { validation: { ...node.validation, unique: !!$event } })"
          />
        </div>
        <div class="ldp-prop ldp-prop-switch">
          <label>{{ t('fbp.realtime') }}</label>
          <Group
            type="switch"
            :model-value="!!node.validation?.realtime"
            @update:model-value="emit('update', { validation: { ...node.validation, realtime: !!$event } })"
          />
        </div>
      </div>

      <!-- ═══ 样式设置页 ═══ -->
      <div v-show="activeTab === 'style' && !isContainer" class="ldp-prop-page">
        <div class="ldp-section-title">{{ t('fbp.sectionLabel') }}</div>
        <div class="ldp-prop">
          <label>{{ t('fbp.labelWidth') }}</label>
          <Select
            :model-value="node.styleConfig?.labelWidth ?? 'default'"
            :options="[
              { value: 'default', label: t('fbp.labelWidthDefault') },
              { value: '80px', label: '80px' },
              { value: '120px', label: '120px' },
              { value: 'auto', label: t('fbp.auto') },
            ]"
            @update:model-value="emit('update', { styleConfig: { ...node.styleConfig, labelWidth: $event as any } })"
          />
        </div>
        <div class="ldp-prop">
          <label>{{ t('fbp.labelPosition') }}</label>
          <Select
            :model-value="node.styleConfig?.labelPosition ?? 'left'"
            :options="[
              { value: 'left', label: t('fbp.posLeft') },
              { value: 'top', label: t('fbp.posTop') },
              { value: 'hidden', label: t('fbp.posHidden') },
            ]"
            @update:model-value="emit('update', { styleConfig: { ...node.styleConfig, labelPosition: $event as any } })"
          />
        </div>

        <div class="ldp-section-title">{{ t('fbp.sectionControl') }}</div>
        <div class="ldp-prop">
          <label>{{ t('fbp.controlWidth') }}</label>
          <Select
            :model-value="node.styleConfig?.controlWidth ?? '100%'"
            :options="[
              { value: '100%', label: '100%' },
              { value: '50%', label: '50%' },
              { value: 'auto', label: t('fbp.fit') },
            ]"
            @update:model-value="emit('update', { styleConfig: { ...node.styleConfig, controlWidth: $event as any } })"
          />
        </div>
        <div class="ldp-prop">
          <label>{{ t('fbp.controlSize') }}</label>
          <Select
            :model-value="node.styleConfig?.size ?? 'default'"
            :options="[
              { value: 'small', label: t('fbp.sizeSmall') },
              { value: 'default', label: t('fbp.sizeDefault') },
              { value: 'large', label: t('fbp.sizeLarge') },
            ]"
            @update:model-value="emit('update', { styleConfig: { ...node.styleConfig, size: $event as any } })"
          />
        </div>
        <div class="ldp-prop">
          <label>{{ t('fbp.radius') }}</label>
          <Select
            :model-value="node.styleConfig?.radius ?? 'default'"
            :options="[
              { value: 'default', label: t('fbp.radiusDefault') },
              { value: '0px', label: t('fbp.radius0') },
              { value: '12px', label: t('fbp.radius12') },
              { value: '20px', label: t('fbp.radius20') },
            ]"
            @update:model-value="emit('update', { styleConfig: { ...node.styleConfig, radius: $event as any } })"
          />
        </div>

        <div class="ldp-section-title">{{ t('fbp.sectionColor') }}</div>
        <div class="ldp-prop">
          <label>{{ t('fbp.borderColor') }}</label>
          <div class="ldp-color-row">
            <input
              type="color"
              class="ldp-color-picker"
              :value="node.styleConfig?.borderColor ?? '#e2e8f0'"
              @input="
                emit('update', {
                  styleConfig: { ...node.styleConfig, borderColor: ($event.target as HTMLInputElement).value },
                })
              "
            />
            <Input
              :model-value="node.styleConfig?.borderColor ?? '#e2e8f0'"
              placeholder="#e2e8f0"
              @update:model-value="
                emit('update', { styleConfig: { ...node.styleConfig, borderColor: String($event ?? '') } })
              "
            />
          </div>
        </div>
        <div class="ldp-prop">
          <label>{{ t('fbp.focusBorderColor') }}</label>
          <div class="ldp-color-row">
            <input
              type="color"
              class="ldp-color-picker"
              :value="node.styleConfig?.focusBorderColor ?? '#4f6ef7'"
              @input="
                emit('update', {
                  styleConfig: { ...node.styleConfig, focusBorderColor: ($event.target as HTMLInputElement).value },
                })
              "
            />
            <Input
              :model-value="node.styleConfig?.focusBorderColor ?? '#4f6ef7'"
              placeholder="#4f6ef7"
              @update:model-value="
                emit('update', { styleConfig: { ...node.styleConfig, focusBorderColor: String($event ?? '') } })
              "
            />
          </div>
        </div>

        <div class="ldp-section-title">{{ t('fbp.sectionCustomStyle') }}</div>
        <div class="ldp-prop">
          <label>{{ t('fbp.customClass') }}</label>
          <Input
            :model-value="node.styleConfig?.customClass ?? ''"
            :placeholder="t('fbp.customClassPh')"
            @update:model-value="
              emit('update', { styleConfig: { ...node.styleConfig, customClass: String($event ?? '') } })
            "
          />
        </div>
        <div class="ldp-prop">
          <label>{{ t('fbp.customCss') }}</label>
          <textarea
            class="ldp-options-editor"
            :value="node.styleConfig?.customCss ?? ''"
            :placeholder="t('fbp.customCssPh')"
            rows="3"
            @input="
              emit('update', {
                styleConfig: { ...node.styleConfig, customCss: ($event.target as HTMLTextAreaElement).value },
              })
            "
          />
        </div>
      </div>

      <!-- ═══ 事件配置页 ═══ -->
      <div v-show="activeTab === 'event' && !isContainer" class="ldp-prop-page">
        <div class="ldp-section-title">{{ t('fbp.sectionEvent') }}</div>

        <!-- onChange -->
        <div class="ldp-event-card">
          <div class="ldp-event-head">
            <IconSvg type="square-pen" size="xs" class="ldp-event-icon" />
            <span class="ldp-event-label">{{ t('fbp.eventChange') }}</span>
            <div class="ldp-event-toggle">
              <Group
                type="switch"
                :model-value="!!node.eventConfig?.onChange?.enabled"
                @update:model-value="
                  emit('update', {
                    eventConfig: {
                      ...node.eventConfig,
                      onChange: {
                        enabled: !!$event,
                        action: node.eventConfig?.onChange?.action,
                        targetField: node.eventConfig?.onChange?.targetField,
                        apiUrl: node.eventConfig?.onChange?.apiUrl,
                      },
                    },
                  })
                "
              />
            </div>
          </div>
          <div v-if="node.eventConfig?.onChange?.enabled" class="ldp-event-body">
            <Select
              :model-value="node.eventConfig?.onChange?.action ?? ''"
              :options="[
                { value: '', label: t('fbp.chooseAction') },
                { value: 'linkField', label: t('fbp.actLinkField') },
                { value: 'callApi', label: t('fbp.actCallApi') },
                { value: 'showTip', label: t('fbp.actShowTip') },
                { value: 'setValue', label: t('fbp.actSetValue') },
                { value: 'toggleVisible', label: t('fbp.actToggleVisible') },
              ]"
              @update:model-value="
                emit('update', {
                  eventConfig: {
                    ...node.eventConfig,
                    onChange: {
                      enabled: true,
                      action: String($event ?? ''),
                      targetField: node.eventConfig?.onChange?.targetField,
                      apiUrl: node.eventConfig?.onChange?.apiUrl,
                    },
                  },
                })
              "
            />
            <!-- setValue / toggleVisible 需要目标字段 -->
            <div
              v-if="
                node.eventConfig?.onChange?.action === 'setValue' ||
                node.eventConfig?.onChange?.action === 'toggleVisible'
              "
              class="ldp-prop"
              style="padding: 0; border: none; margin-top: 8px"
            >
              <label>{{ t('fbp.targetField') }}</label>
              <Select
                :model-value="node.eventConfig?.onChange?.targetField ?? ''"
                :options="visibleWhenFieldOptions"
                :placeholder="t('fbp.targetFieldPh')"
                @update:model-value="
                  emit('update', {
                    eventConfig: {
                      ...node.eventConfig,
                      onChange: {
                        ...node.eventConfig?.onChange,
                        enabled: true,
                        targetField: $event === null ? '' : String($event ?? ''),
                      },
                    },
                  })
                "
              />
            </div>
            <!-- callApi 需要接口地址 -->
            <div
              v-if="node.eventConfig?.onChange?.action === 'callApi'"
              class="ldp-prop"
              style="padding: 0; border: none; margin-top: 8px"
            >
              <label>{{ t('fbp.apiUrl') }}</label>
              <Input
                :model-value="node.eventConfig?.onChange?.apiUrl ?? ''"
                placeholder="https://api.example.com/xxx"
                @update:model-value="
                  emit('update', {
                    eventConfig: {
                      ...node.eventConfig,
                      onChange: {
                        enabled: true,
                        action: 'callApi',
                        apiUrl: $event === null ? '' : String($event ?? ''),
                      },
                    },
                  })
                "
              />
            </div>
          </div>
        </div>

        <!-- onFocus -->
        <div class="ldp-event-card">
          <div class="ldp-event-head">
            <IconSvg type="sun" size="xs" class="ldp-event-icon" />
            <span class="ldp-event-label">{{ t('fbp.eventFocus') }}</span>
            <div class="ldp-event-toggle">
              <Group
                type="switch"
                :model-value="!!node.eventConfig?.onFocus?.enabled"
                @update:model-value="
                  emit('update', {
                    eventConfig: {
                      ...node.eventConfig,
                      onFocus: { enabled: !!$event, action: node.eventConfig?.onFocus?.action },
                    },
                  })
                "
              />
            </div>
          </div>
        </div>

        <!-- onBlur -->
        <div class="ldp-event-card">
          <div class="ldp-event-head">
            <IconSvg type="moon" size="xs" class="ldp-event-icon" />
            <span class="ldp-event-label">{{ t('fbp.eventBlur') }}</span>
            <div class="ldp-event-toggle">
              <Group
                type="switch"
                :model-value="!!node.eventConfig?.onBlur?.enabled"
                @update:model-value="
                  emit('update', {
                    eventConfig: {
                      ...node.eventConfig,
                      onBlur: { enabled: !!$event, action: node.eventConfig?.onBlur?.action },
                    },
                  })
                "
              />
            </div>
          </div>
          <div v-if="node.eventConfig?.onBlur?.enabled" class="ldp-event-body">
            <Select
              :model-value="node.eventConfig?.onBlur?.action ?? ''"
              :options="[
                { value: '', label: t('fbp.chooseAction') },
                { value: 'autoValidate', label: t('fbp.actAutoValidate') },
                { value: 'format', label: t('fbp.actFormat') },
                { value: 'submit', label: t('fbp.actSubmit') },
              ]"
              @update:model-value="
                emit('update', {
                  eventConfig: {
                    ...node.eventConfig,
                    onBlur: { ...node.eventConfig?.onBlur, enabled: true, action: String($event ?? '') },
                  },
                })
              "
            />
          </div>
        </div>

        <div class="ldp-section-title">{{ t('fbp.sectionLinkage') }}</div>
        <div class="ldp-prop">
          <label>{{ t('fbp.linkageType') }}</label>
          <Select
            :model-value="node.eventConfig?.linkageType ?? 'none'"
            :options="[
              { value: 'none', label: t('fbp.linkageNone') },
              { value: 'followValue', label: t('fbp.linkageFollowValue') },
              { value: 'followOptions', label: t('fbp.linkageFollowOptions') },
              { value: 'showHide', label: t('fbp.linkageShowHide') },
            ]"
            @update:model-value="emit('update', { eventConfig: { ...node.eventConfig, linkageType: $event as any } })"
          />
        </div>
        <template v-if="node.eventConfig?.linkageType && node.eventConfig.linkageType !== 'none'">
          <!-- 显隐联动：选择控制的目标字段 -->
          <div v-if="node.eventConfig.linkageType === 'showHide'" class="ldp-prop">
            <label>{{ t('fbp.targetField') }}</label>
            <Select
              :model-value="node.eventConfig?.onChange?.targetField ?? ''"
              :options="visibleWhenFieldOptions"
              :placeholder="t('fbp.showHideFieldPh')"
              @update:model-value="
                emit('update', {
                  eventConfig: {
                    ...node.eventConfig,
                    onChange: {
                      enabled: true,
                      action: 'toggleVisible',
                      targetField: $event === null ? '' : String($event ?? ''),
                    },
                  },
                })
              "
            />
          </div>

          <!-- 联动公式 -->
          <div class="ldp-prop">
            <label>{{ t('fbp.linkageFormula') }}</label>
            <Input
              :model-value="node.eventConfig?.linkageFormula ?? ''"
              :placeholder="linkageFormulaPlaceholder"
              @update:model-value="
                emit('update', { eventConfig: { ...node.eventConfig, linkageFormula: String($event ?? '') } })
              "
            />
          </div>

          <!-- 公式帮助提示 -->
          <div class="ldp-linkage-help">
            <IconSvg type="info-circle" size="xs" />
            <span>{{ linkageHelpText }}</span>
          </div>
        </template>
      </div>

      <!-- ═══ 数据源页 ═══ -->
      <div v-show="activeTab === 'data' && !isContainer" class="ldp-prop-page">
        <div class="ldp-section-title">{{ t('fbp.defaultValue') }}</div>
        <div class="ldp-prop">
          <label>{{ t('fbp.defaultType') }}</label>
          <Select
            :model-value="node.dataConfig?.defaultType ?? 'none'"
            :options="[
              { value: 'none', label: t('fbp.none') },
              { value: 'fixed', label: t('fbp.fixed') },
              { value: 'formula', label: t('fbp.formula') },
              { value: 'api', label: t('fbp.apiFetch') },
              { value: 'currentUser', label: t('fbp.currentUser') },
              { value: 'currentTime', label: t('fbp.currentTime') },
            ]"
            @update:model-value="emit('update', { dataConfig: { ...node.dataConfig, defaultType: $event as any } })"
          />
        </div>
        <template v-if="node.dataConfig?.defaultType === 'formula'">
          <div class="ldp-prop">
            <label>{{ t('fbp.defaultFormula') }}</label>
            <Input
              :model-value="node.dataConfig?.defaultFormula ?? ''"
              :placeholder="t('fbp.defaultFormulaPh')"
              @update:model-value="
                emit('update', { dataConfig: { ...node.dataConfig, defaultFormula: String($event ?? '') } })
              "
            />
          </div>
        </template>

        <div class="ldp-section-title">{{ t('fbp.sectionRemote') }}</div>
        <div class="ldp-datasource-card">
          <div class="ldp-prop" style="padding: 0; border: none">
            <label>{{ t('fbp.sourceType') }}</label>
            <Select
              :model-value="node.dataConfig?.sourceType ?? 'none'"
              :options="[
                { value: 'none', label: t('fbp.srcNone') },
                { value: 'api', label: t('fbp.srcApi') },
                { value: 'database', label: t('fbp.srcDatabase') },
                { value: 'userList', label: t('fbp.srcUserList') },
                { value: 'deptList', label: t('fbp.srcDeptList') },
              ]"
              @update:model-value="emit('update', { dataConfig: { ...node.dataConfig, sourceType: $event as any } })"
            />
          </div>
          <template v-if="node.dataConfig?.sourceType === 'api'">
            <div class="ldp-prop" style="padding: 0; border: none; margin-top: 8px">
              <label>{{ t('fbp.apiUrl') }}</label>
            </div>
            <div class="ldp-datasource-url">
              <input
                class="ldp-datasource-input"
                :value="node.dataConfig?.apiUrl ?? ''"
                :placeholder="t('fbp.apiUrlPh')"
                @input="
                  emit('update', {
                    dataConfig: { ...node.dataConfig, apiUrl: ($event.target as HTMLInputElement).value },
                  })
                "
              />
            </div>
            <div class="ldp-prop" style="padding: 0; border: none; margin-top: 8px">
              <label>{{ t('fbp.dataMapping') }}</label>
              <div style="display: flex; gap: 6px">
                <Input
                  :model-value="node.dataConfig?.labelField ?? ''"
                  :placeholder="t('fbp.labelFieldPh')"
                  @update:model-value="
                    emit('update', { dataConfig: { ...node.dataConfig, labelField: String($event ?? '') } })
                  "
                />
                <Input
                  :model-value="node.dataConfig?.valueField ?? ''"
                  :placeholder="t('fbp.valueFieldPh')"
                  @update:model-value="
                    emit('update', { dataConfig: { ...node.dataConfig, valueField: String($event ?? '') } })
                  "
                />
              </div>
            </div>
          </template>
        </div>

        <div class="ldp-section-title">{{ t('fbp.sectionDataLinkage') }}</div>
        <div class="ldp-prop">
          <label>{{ t('fbp.linkageSource') }}</label>
          <Select
            :model-value="node.dataConfig?.linkageSource ?? 'none'"
            :options="[
              { value: 'none', label: t('fbp.none') },
              { value: 'userList', label: t('fbp.srcUserList') },
              { value: 'deptList', label: t('fbp.srcDeptList') },
              { value: 'roleList', label: t('fbp.srcRoleList') },
            ]"
            @update:model-value="emit('update', { dataConfig: { ...node.dataConfig, linkageSource: $event as any } })"
          />
        </div>
        <div v-if="node.dataConfig?.linkageSource && node.dataConfig.linkageSource !== 'none'" class="ldp-prop">
          <label>{{ t('fbp.linkageField') }}</label>
          <Select
            :model-value="node.dataConfig?.linkageField ?? ''"
            :options="visibleWhenFieldOptions"
            :placeholder="t('fbp.noneDash')"
            @update:model-value="
              emit('update', {
                dataConfig: { ...node.dataConfig, linkageField: $event === null ? '' : String($event ?? '') },
              })
            "
          />
        </div>

        <div class="ldp-section-title">{{ t('fbp.sectionPersist') }}</div>
        <div class="ldp-prop ldp-prop-switch">
          <label>{{ t('fbp.cacheData') }}</label>
          <Group
            type="switch"
            :model-value="!!node.dataConfig?.cacheData"
            @update:model-value="emit('update', { dataConfig: { ...node.dataConfig, cacheData: !!$event } })"
          />
        </div>
        <div class="ldp-prop ldp-prop-switch">
          <label>{{ t('fbp.clearAfterSubmit') }}</label>
          <Group
            type="switch"
            :model-value="!!node.dataConfig?.clearAfterSubmit"
            @update:model-value="emit('update', { dataConfig: { ...node.dataConfig, clearAfterSubmit: !!$event } })"
          />
        </div>
      </div>
    </div>

    <!-- 空态 -->
    <div v-else class="ldp-props-empty">
      <div class="ldp-props-empty-icon">
        <IconSvg type="mouse-pointer-click" size="xl" />
      </div>
      <p>{{ t('fbd.emptySelectA') }}<br />{{ t('fbd.emptySelectB') }}</p>
    </div>
  </aside>
</template>
