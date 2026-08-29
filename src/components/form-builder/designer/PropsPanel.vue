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
import {
  getTypeLabel,
  getTypeIcon,
  parseCascaderOptions,
  isContainerNode,
  flattenNodes,
  type DesignerNode,
} from './types'
import { getFieldDefaults, getComponentCategory } from '../fieldRegistry'

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

const tabs: { id: PropTab; label: string }[] = [
  { id: 'basic', label: '基本' },
  { id: 'validation', label: '校验' },
  { id: 'style', label: '样式' },
  { id: 'event', label: '事件' },
  { id: 'data', label: '数据' },
]

/** 容器节点只显示基本属性页 */
const availableTabs = computed(() => {
  if (isContainerNode(props.node)) return [{ id: 'basic' as PropTab, label: '基本' }]
  return tabs
})

// ════════════════════════════════════════
// 通用工具
// ════════════════════════════════════════

const isContainer = computed(() => isContainerNode(props.node))

/** span 下拉选项 */
const spanOptions = [
  { value: 24, label: '整行 (24)' },
  { value: 12, label: '半行 (12)' },
  { value: 8, label: '三分之一 (8)' },
  { value: 6, label: '四分之一 (6)' },
]

/** Input 值转换 */
function onInputEmit(key: keyof DesignerNode, v: unknown): void {
  const val = v === null ? '' : String(v)
  emit('update', { [key]: val } as Partial<DesignerNode>)
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
    { name: '最小长度', value: v?.minLength, key: 'minLength', type: 'number' },
    { name: '最大长度', value: v?.maxLength, key: 'maxLength', type: 'number' },
    { name: '正则表达式', value: v?.pattern, key: 'pattern', type: 'text' },
    { name: '手机号格式', value: v?.builtinType === 'phone', key: 'builtinType', type: 'toggle', toggleValue: 'phone' },
    { name: '邮箱格式', value: v?.builtinType === 'email', key: 'builtinType', type: 'toggle', toggleValue: 'email' },
    { name: '身份证号', value: v?.builtinType === 'idcard', key: 'builtinType', type: 'toggle', toggleValue: 'idcard' },
    { name: 'URL 格式', value: v?.builtinType === 'url', key: 'builtinType', type: 'toggle', toggleValue: 'url' },
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
  const t = props.node.eventConfig?.linkageType
  if (t === 'followValue') return '如：{{price}} * {{quantity}}'
  if (t === 'showHide') return '如：{{type}} == "A"'
  if (t === 'followOptions') return '如：{{category}}'
  return ''
})

/** 联动帮助提示文本 */
const linkageHelpText = computed(() => {
  const t = props.node.eventConfig?.linkageType
  if (t === 'followValue') return '值跟随：当依赖字段变化时，自动计算本字段值。用 {{字段名}} 引用其他字段值。'
  if (t === 'showHide') return '显隐联动：公式为条件表达式，如 {{status}} == "active"，条件为真时显示目标字段。'
  if (t === 'followOptions') return '选项跟随：根据依赖字段值自动过滤本字段选项。'
  return ''
})
</script>

<template>
  <aside class="ldp-props">
    <div v-if="node" class="ldp-props-body">
      <!-- 字段头部 -->
      <div class="ldp-props-header">
        <IconSvg :type="isContainer ? 'layout-template' : 'settings-2'" size="sm" />
        <span>属性配置</span>
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
        <div class="ldp-section-title">基本属性</div>

        <div class="ldp-prop">
          <label>标签名称</label>
          <Input
            :model-value="node.label"
            placeholder="显示名称"
            @update:model-value="
              onInputEmit('label', $event)
              emit('name-change', String($event ?? ''))
            "
          />
        </div>

        <!-- 容器节点专属 -->
        <template v-if="isContainer">
          <div class="ldp-prop">
            <label>容器类型</label>
            <div class="ldp-type-readonly">
              <IconSvg type="layout-template" size="xs" />
              {{ getTypeLabel(node.type) }}
            </div>
          </div>

          <!-- grid 容器：列数 -->
          <template v-if="node.type === 'grid'">
            <div class="ldp-section-title">栅格设置</div>
            <div class="ldp-prop">
              <label>列数</label>
              <Select
                :model-value="node.containerConfig?.columns ?? 2"
                :options="[
                  { value: 2, label: '2 列' },
                  { value: 3, label: '3 列' },
                  { value: 4, label: '4 列' },
                ]"
                @update:model-value="
                  emit('update', { containerConfig: { ...node.containerConfig, columns: Number($event) } })
                "
              />
            </div>
          </template>

          <!-- tabs 容器：标签页列表 -->
          <template v-if="node.type === 'tabs'">
            <div class="ldp-section-title">标签页配置</div>
            <div class="ldp-prop">
              <label>标签页列表（每行一个）</label>
              <textarea
                class="ldp-options-editor"
                :value="(node.containerConfig?.tabs ?? []).map((t) => t.label).join('\n')"
                placeholder="标签页 1
标签页 2"
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
            <div class="ldp-section-title">折叠项配置</div>
            <div class="ldp-prop">
              <label>折叠项标题（每行一个）</label>
              <textarea
                class="ldp-options-editor"
                :value="(node.containerConfig?.collapseItems ?? []).map((c) => c.title).join('\n')"
                placeholder="折叠项 1
折叠项 2"
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
            <div class="ldp-section-title">步骤配置</div>
            <div class="ldp-prop">
              <label>步骤标题（每行一个）</label>
              <textarea
                class="ldp-options-editor"
                :value="(node.containerConfig?.steps ?? []).map((s) => s.title).join('\n')"
                placeholder="步骤 1
步骤 2
步骤 3"
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
            <label>字段 Key</label>
            <Input
              :model-value="node.key ?? ''"
              placeholder="数据绑定标识"
              @update:model-value="emit('update', { key: $event === null ? '' : String($event) })"
            />
          </div>

          <div class="ldp-prop ldp-prop-readonly">
            <label>字段类型</label>
            <div class="ldp-type-readonly">
              <IconSvg :type="getTypeIcon(node.type)" size="xs" />
              {{ getTypeLabel(node.type) }}
            </div>
          </div>

          <div class="ldp-prop">
            <label>栅格宽度</label>
            <Select
              :model-value="node.span ?? 24"
              :options="spanOptions"
              @update:model-value="emit('update', { span: Number($event) })"
            />
          </div>

          <div class="ldp-prop ldp-prop-switch">
            <label>必填</label>
            <Group
              type="switch"
              :model-value="!!node.required"
              @update:model-value="emit('update', { required: !!$event })"
            />
          </div>

          <div class="ldp-prop ldp-prop-switch">
            <label>禁用</label>
            <Group
              type="switch"
              :model-value="!!node.disabled"
              @update:model-value="emit('update', { disabled: !!$event })"
            />
          </div>

          <div class="ldp-prop ldp-prop-switch">
            <label>只读</label>
            <Group
              type="switch"
              :model-value="!!node.readonly"
              @update:model-value="emit('update', { readonly: !!$event })"
            />
          </div>

          <!-- 占位符 -->
          <template v-if="hasProp('placeholder')">
            <div class="ldp-section-title">显示设置</div>
            <div class="ldp-prop">
              <label>占位符</label>
              <Input
                :model-value="node.placeholder ?? ''"
                placeholder="输入框内的提示文字"
                @update:model-value="onInputEmit('placeholder', $event)"
              />
            </div>
            <!-- 前缀图标 / 后缀文字（文本输入类字段） -->
            <template v-if="isTextInput">
              <div class="ldp-prop">
                <label>前缀图标</label>
                <div class="ldp-prop-inline">
                  <IconPicker
                    :model-value="node.icon ?? ''"
                    placeholder="输入框左侧图标（可选）"
                    @update:model-value="emit('update', { icon: String($event ?? '') })"
                  />
                  <button
                    v-if="node.icon"
                    type="button"
                    class="ldp-icon-clear"
                    title="清除图标"
                    @click="emit('update', { icon: '' })"
                  >
                    <IconSvg type="x" size="xs" />
                  </button>
                </div>
              </div>
              <div class="ldp-prop">
                <label>后缀文字</label>
                <Input
                  :model-value="node.suffixText ?? ''"
                  placeholder="输入框右侧固定文字，如单位"
                  @update:model-value="onInputEmit('suffixText', $event)"
                />
              </div>
            </template>
          </template>

          <!-- 提示文字 -->
          <template v-if="hasHint">
            <div class="ldp-prop">
              <label>提示文字</label>
              <Input
                :model-value="node.hint ?? ''"
                placeholder="显示在控件下方的帮助信息"
                @update:model-value="onInputEmit('hint', $event)"
              />
            </div>
          </template>

          <!-- 默认值 -->
          <template v-if="['text', 'textarea'].includes(node.type)">
            <div class="ldp-section-title">默认值</div>
            <div class="ldp-prop">
              <label>默认值</label>
              <Input
                :model-value="(node.defaultValue as string) ?? ''"
                @update:model-value="onInputEmit('defaultValue', $event)"
              />
            </div>
          </template>

          <template v-if="node.type === 'number'">
            <div class="ldp-section-title">默认值</div>
            <div class="ldp-prop">
              <label>默认值</label>
              <Input
                type="number"
                :model-value="(node.defaultValue as number) ?? 0"
                @update:model-value="onNumberEmit('defaultValue', $event)"
              />
            </div>
          </template>

          <template v-if="node.type === 'switch'">
            <div class="ldp-section-title">默认值</div>
            <div class="ldp-prop ldp-prop-switch">
              <label>默认开启</label>
              <Group
                type="switch"
                :model-value="!!node.defaultValue"
                @update:model-value="onGroupEmit('defaultValue', $event)"
              />
            </div>
          </template>

          <!-- 选项编辑 -->
          <template v-if="hasOptions">
            <div class="ldp-section-title">选项列表</div>
            <div class="ldp-prop">
              <label>选项（每行一个）</label>
              <textarea
                class="ldp-options-editor"
                :value="(node.options || []).join('\n')"
                placeholder="选项1&#10;选项2&#10;选项3"
                rows="5"
                @input="
                  emit('update', { options: ($event.target as HTMLTextAreaElement).value.split('\n').filter(Boolean) })
                "
              />
              <span class="ldp-option-count">{{ (node.options || []).length }} 个选项</span>
            </div>
          </template>

          <!-- 数字属性 -->
          <template v-if="['number', 'slider'].includes(node.type)">
            <div class="ldp-section-title">数值范围</div>
            <div class="ldp-prop-row">
              <div class="ldp-prop">
                <label>最小值</label>
                <Input type="number" :model-value="node.min ?? 0" @update:model-value="onNumberEmit('min', $event)" />
              </div>
              <div class="ldp-prop">
                <label>最大值</label>
                <Input type="number" :model-value="node.max ?? 100" @update:model-value="onNumberEmit('max', $event)" />
              </div>
            </div>
            <div class="ldp-prop">
              <label>步进</label>
              <Input type="number" :model-value="node.step ?? 1" @update:model-value="onNumberEmit('step', $event)" />
            </div>
          </template>

          <!-- 最大长度（text） -->
          <template v-if="node.type === 'text'">
            <div class="ldp-section-title">输入限制</div>
            <div class="ldp-prop">
              <label>最大长度</label>
              <Input
                type="number"
                :model-value="node.maxLength ?? 0"
                placeholder="0 = 不限制"
                @update:model-value="onNumberEmit('maxLength', $event)"
              />
            </div>
          </template>

          <!-- textarea 行数 -->
          <template v-if="node.type === 'textarea'">
            <div class="ldp-section-title">文本域设置</div>
            <div class="ldp-prop">
              <label>行数</label>
              <Input type="number" :model-value="node.rows ?? 3" @update:model-value="onNumberEmit('rows', $event)" />
            </div>
          </template>

          <!-- 评分属性 -->
          <template v-if="node.type === 'rate'">
            <div class="ldp-section-title">评分设置</div>
            <div class="ldp-prop-row">
              <div class="ldp-prop">
                <label>星星数</label>
                <Input
                  type="number"
                  :model-value="node.rateMax ?? 5"
                  @update:model-value="onNumberEmit('rateMax', $event)"
                />
              </div>
              <div class="ldp-prop ldp-prop-switch">
                <label>允许半星</label>
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
            <div class="ldp-section-title">级联配置</div>
            <div class="ldp-prop">
              <label>层级选项（JSON）</label>
              <textarea
                class="ldp-options-editor"
                :value="node.cascaderOptions"
                placeholder='[{"label":"一级","value":"1","children":[...]}]'
                rows="6"
                @input="emit('update', { cascaderOptions: ($event.target as HTMLTextAreaElement).value })"
              />
              <span class="ldp-prop-hint" :class="{ 'ldp-prop-ok': !!parseCascaderOptions(node.cascaderOptions) }">
                <IconSvg
                  :type="!!parseCascaderOptions(node.cascaderOptions) ? 'circle-check' : 'alert-circle'"
                  size="xs"
                />
                {{
                  parseCascaderOptions(node.cascaderOptions) ? 'JSON 格式正确' : '需为 {label,value,children}[] 数组'
                }}
              </span>
            </div>
          </template>

          <!-- 上传属性 -->
          <template v-if="node.type === 'upload'">
            <div class="ldp-section-title">上传设置</div>
            <div class="ldp-prop">
              <label>接受的文件类型</label>
              <Input
                :model-value="node.accept ?? 'image/*'"
                placeholder="如 image/*,.pdf"
                @update:model-value="onInputEmit('accept', $event)"
              />
            </div>
            <div class="ldp-prop ldp-prop-switch">
              <label>允许多文件</label>
              <Group
                type="switch"
                :model-value="node.multiple !== false"
                @update:model-value="onGroupEmit('multiple', $event)"
              />
            </div>
            <div class="ldp-prop">
              <label>最大文件大小 (MB)</label>
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
            <div class="ldp-section-title">子表单设置</div>
            <div class="ldp-prop">
              <label>列定义（每行一个，格式：标签|key|类型）</label>
              <textarea
                class="ldp-options-editor"
                :value="node.subformColumns ?? ''"
                placeholder="姓名|name|text&#10;电话|phone|number"
                rows="4"
                @input="emit('update', { subformColumns: ($event.target as HTMLTextAreaElement).value })"
              />
              <span class="ldp-prop-hint">类型支持：text / number / select</span>
            </div>
          </template>

          <!-- 关联选择：实体类型 -->
          <template v-if="node.type === 'relate'">
            <div class="ldp-section-title">关联设置</div>
            <div class="ldp-prop">
              <label>关联实体类型</label>
              <Select
                :model-value="node.relateEntityType ?? 'user'"
                :options="[
                  { value: 'user', label: '用户' },
                  { value: 'dept', label: '部门' },
                  { value: 'role', label: '角色' },
                  { value: 'custom', label: '自定义' },
                ]"
                @update:model-value="
                  emit('update', { relateEntityType: $event as 'user' | 'dept' | 'role' | 'custom' })
                "
              />
            </div>
          </template>

          <!-- 富文本：工具栏模式 -->
          <template v-if="node.type === 'richtext'">
            <div class="ldp-section-title">富文本设置</div>
            <div class="ldp-prop">
              <label>工具栏模式</label>
              <Select
                :model-value="node.richtextToolbar ?? 'simple'"
                :options="[
                  { value: 'simple', label: '简洁（加粗/斜体/下划线/列表）' },
                  { value: 'full', label: '完整（含标题/颜色/对齐）' },
                ]"
                @update:model-value="emit('update', { richtextToolbar: $event as 'simple' | 'full' })"
              />
            </div>
          </template>

          <!-- 地址选择：详细地址 -->
          <template v-if="node.type === 'address'">
            <div class="ldp-section-title">地址设置</div>
            <div class="ldp-prop ldp-prop-switch">
              <label>显示详细地址</label>
              <Group
                type="switch"
                :model-value="!!node.addressDetail"
                @update:model-value="emit('update', { addressDetail: !!$event })"
              />
            </div>
          </template>

          <!-- 证件号码：类型列表 -->
          <template v-if="node.type === 'idcard'">
            <div class="ldp-section-title">证件设置</div>
            <div class="ldp-prop">
              <label>证件类型（每行一个）</label>
              <textarea
                class="ldp-options-editor"
                :value="node.idcardTypes ?? '身份证'"
                placeholder="身份证&#10;护照&#10;军官证"
                rows="4"
                @input="emit('update', { idcardTypes: ($event.target as HTMLTextAreaElement).value })"
              />
              <span class="ldp-prop-hint">用户可选择多种证件类型</span>
            </div>
          </template>

          <!-- 评分矩阵：行/列标题 -->
          <template v-if="node.type === 'matrix'">
            <div class="ldp-section-title">矩阵设置</div>
            <div class="ldp-prop">
              <label>行标题（每行一个）</label>
              <textarea
                class="ldp-options-editor"
                :value="node.matrixRows ?? ''"
                placeholder="服务态度&#10;专业能力&#10;响应速度"
                rows="4"
                @input="emit('update', { matrixRows: ($event.target as HTMLTextAreaElement).value })"
              />
            </div>
            <div class="ldp-prop">
              <label>列标题（每行一个）</label>
              <textarea
                class="ldp-options-editor"
                :value="node.matrixCols ?? ''"
                placeholder="满意&#10;一般&#10;不满意"
                rows="4"
                @input="emit('update', { matrixCols: ($event.target as HTMLTextAreaElement).value })"
              />
            </div>
          </template>

          <!-- 流水号：前缀/日期格式 -->
          <template v-if="node.type === 'serial'">
            <div class="ldp-section-title">流水号设置</div>
            <div class="ldp-prop">
              <label>前缀</label>
              <Input
                :model-value="node.serialPrefix ?? ''"
                placeholder="如 NO / INV / 2024"
                @update:model-value="emit('update', { serialPrefix: String($event ?? '') })"
              />
            </div>
            <div class="ldp-prop">
              <label>日期格式</label>
              <Select
                :model-value="node.serialDateFormat ?? 'YYYYMMDD'"
                :options="[
                  { value: 'YYYYMMDD', label: '年月日 (20240101)' },
                  { value: 'YYYY', label: '年仅 (2024)' },
                  { value: 'YYYYMM', label: '年月 (202401)' },
                  { value: 'NONE', label: '无日期' },
                ]"
                @update:model-value="emit('update', { serialDateFormat: String($event ?? 'YYYYMMDD') })"
              />
            </div>
          </template>

          <!-- 条件显示 -->
          <template v-if="node.type !== 'divider' && node.type !== 'title'">
            <div class="ldp-section-title">条件显示</div>
            <div class="ldp-prop">
              <label>触发字段</label>
              <Select
                :model-value="node.visibleWhenField ?? ''"
                :options="visibleWhenFieldOptions"
                placeholder="选择触发字段（留空 = 始终显示）"
                @update:model-value="
                  emit('update', { visibleWhenField: $event === null ? '' : String($event) || undefined })
                "
              />
            </div>
            <template v-if="node.visibleWhenField">
              <div class="ldp-prop">
                <label>匹配值</label>
                <Input
                  :model-value="node.visibleWhenValue ?? ''"
                  placeholder="如 true / 1 / 某选项值"
                  @update:model-value="onInputEmit('visibleWhenValue', $event)"
                />
              </div>
              <div class="ldp-prop ldp-prop-switch">
                <label>反向匹配</label>
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
        <div class="ldp-section-title">必填校验</div>
        <div class="ldp-prop ldp-prop-switch">
          <label>必填字段</label>
          <Group
            type="switch"
            :model-value="!!node.required"
            @update:model-value="emit('update', { required: !!$event })"
          />
        </div>
        <div class="ldp-prop">
          <label>必填提示语</label>
          <Input
            :model-value="node.validation?.requiredMessage ?? ''"
            placeholder="如：此字段不能为空"
            @update:model-value="
              emit('update', { validation: { ...node.validation, requiredMessage: String($event ?? '') } })
            "
          />
        </div>

        <div class="ldp-section-title">内置校验规则</div>
        <div v-for="rule in builtinValidations" :key="rule.key" class="ldp-validation-rule">
          <span class="ldp-rule-icon" :class="{ on: !!rule.value }">
            <IconSvg :type="rule.value ? 'circle-check' : 'circle'" size="xs" />
          </span>
          <span class="ldp-rule-name">{{ rule.name }}</span>
          <span class="ldp-rule-status" :class="rule.value ? 'on' : 'off'">
            {{ rule.value ? '已启用' : '未启用' }}
          </span>
        </div>

        <div class="ldp-section-title">自定义校验</div>
        <div class="ldp-prop">
          <label>正则表达式</label>
          <Input
            :model-value="node.validation?.pattern ?? ''"
            placeholder="如：^[\u4e00-\u9fa5]+$"
            @update:model-value="emit('update', { validation: { ...node.validation, pattern: String($event ?? '') } })"
          />
        </div>
        <div class="ldp-prop">
          <label>校验提示语</label>
          <Input
            :model-value="node.validation?.patternMessage ?? ''"
            placeholder="校验失败时显示的提示"
            @update:model-value="
              emit('update', { validation: { ...node.validation, patternMessage: String($event ?? '') } })
            "
          />
        </div>
        <div class="ldp-prop ldp-prop-switch">
          <label>去除空格</label>
          <Group
            type="switch"
            :model-value="!!node.validation?.trim"
            @update:model-value="emit('update', { validation: { ...node.validation, trim: !!$event } })"
          />
        </div>
        <div class="ldp-prop ldp-prop-switch">
          <label>唯一校验</label>
          <Group
            type="switch"
            :model-value="!!node.validation?.unique"
            @update:model-value="emit('update', { validation: { ...node.validation, unique: !!$event } })"
          />
        </div>
        <div class="ldp-prop ldp-prop-switch">
          <label>实时校验</label>
          <Group
            type="switch"
            :model-value="!!node.validation?.realtime"
            @update:model-value="emit('update', { validation: { ...node.validation, realtime: !!$event } })"
          />
        </div>
      </div>

      <!-- ═══ 样式设置页 ═══ -->
      <div v-show="activeTab === 'style' && !isContainer" class="ldp-prop-page">
        <div class="ldp-section-title">标签设置</div>
        <div class="ldp-prop">
          <label>标签宽度</label>
          <Select
            :model-value="node.styleConfig?.labelWidth ?? 'default'"
            :options="[
              { value: 'default', label: '默认 (100px)' },
              { value: '80px', label: '80px' },
              { value: '120px', label: '120px' },
              { value: 'auto', label: '自动' },
            ]"
            @update:model-value="emit('update', { styleConfig: { ...node.styleConfig, labelWidth: $event as any } })"
          />
        </div>
        <div class="ldp-prop">
          <label>标签位置</label>
          <Select
            :model-value="node.styleConfig?.labelPosition ?? 'left'"
            :options="[
              { value: 'left', label: '左侧' },
              { value: 'top', label: '上方' },
              { value: 'hidden', label: '隐藏' },
            ]"
            @update:model-value="emit('update', { styleConfig: { ...node.styleConfig, labelPosition: $event as any } })"
          />
        </div>

        <div class="ldp-section-title">控件样式</div>
        <div class="ldp-prop">
          <label>控件宽度</label>
          <Select
            :model-value="node.styleConfig?.controlWidth ?? '100%'"
            :options="[
              { value: '100%', label: '100%' },
              { value: '50%', label: '50%' },
              { value: 'auto', label: '自适应' },
            ]"
            @update:model-value="emit('update', { styleConfig: { ...node.styleConfig, controlWidth: $event as any } })"
          />
        </div>
        <div class="ldp-prop">
          <label>控件尺寸</label>
          <Select
            :model-value="node.styleConfig?.size ?? 'default'"
            :options="[
              { value: 'small', label: '小' },
              { value: 'default', label: '默认' },
              { value: 'large', label: '大' },
            ]"
            @update:model-value="emit('update', { styleConfig: { ...node.styleConfig, size: $event as any } })"
          />
        </div>
        <div class="ldp-prop">
          <label>圆角风格</label>
          <Select
            :model-value="node.styleConfig?.radius ?? 'default'"
            :options="[
              { value: 'default', label: '默认 (6px)' },
              { value: '0px', label: '直角 (0px)' },
              { value: '12px', label: '大圆角 (12px)' },
              { value: '20px', label: '胶囊 (20px)' },
            ]"
            @update:model-value="emit('update', { styleConfig: { ...node.styleConfig, radius: $event as any } })"
          />
        </div>

        <div class="ldp-section-title">颜色定制</div>
        <div class="ldp-prop">
          <label>边框颜色</label>
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
          <label>聚焦边框色</label>
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

        <div class="ldp-section-title">自定义样式</div>
        <div class="ldp-prop">
          <label>自定义类名</label>
          <Input
            :model-value="node.styleConfig?.customClass ?? ''"
            placeholder="如：my-custom-field"
            @update:model-value="
              emit('update', { styleConfig: { ...node.styleConfig, customClass: String($event ?? '') } })
            "
          />
        </div>
        <div class="ldp-prop">
          <label>自定义样式（CSS）</label>
          <textarea
            class="ldp-options-editor"
            :value="node.styleConfig?.customCss ?? ''"
            placeholder="/* 在此输入自定义 CSS */\n.my-field input { font-size: 16px; }"
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
        <div class="ldp-section-title">字段事件</div>

        <!-- onChange -->
        <div class="ldp-event-card">
          <div class="ldp-event-head">
            <IconSvg type="square-pen" size="xs" class="ldp-event-icon" />
            <span class="ldp-event-label">值变化 (onChange)</span>
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
                { value: '', label: '— 选择动作 —' },
                { value: 'linkField', label: '联动其他字段' },
                { value: 'callApi', label: '调用 API' },
                { value: 'showTip', label: '显示提示' },
                { value: 'setValue', label: '设置字段值' },
                { value: 'toggleVisible', label: '显示/隐藏字段' },
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
              <label>目标字段</label>
              <Select
                :model-value="node.eventConfig?.onChange?.targetField ?? ''"
                :options="visibleWhenFieldOptions"
                placeholder="选择目标字段"
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
              <label>接口地址</label>
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
            <span class="ldp-event-label">获得焦点 (onFocus)</span>
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
            <span class="ldp-event-label">失去焦点 (onBlur)</span>
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
                { value: '', label: '— 选择动作 —' },
                { value: 'autoValidate', label: '自动校验' },
                { value: 'format', label: '格式化值' },
                { value: 'submit', label: '提交数据' },
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

        <div class="ldp-section-title">字段联动</div>
        <div class="ldp-prop">
          <label>联动类型</label>
          <Select
            :model-value="node.eventConfig?.linkageType ?? 'none'"
            :options="[
              { value: 'none', label: '无联动' },
              { value: 'followValue', label: '值跟随' },
              { value: 'followOptions', label: '选项跟随' },
              { value: 'showHide', label: '显隐联动' },
            ]"
            @update:model-value="emit('update', { eventConfig: { ...node.eventConfig, linkageType: $event as any } })"
          />
        </div>
        <template v-if="node.eventConfig?.linkageType && node.eventConfig.linkageType !== 'none'">
          <!-- 显隐联动：选择控制的目标字段 -->
          <div v-if="node.eventConfig.linkageType === 'showHide'" class="ldp-prop">
            <label>目标字段</label>
            <Select
              :model-value="node.eventConfig?.onChange?.targetField ?? ''"
              :options="visibleWhenFieldOptions"
              placeholder="选择要控制显隐的字段"
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
            <label>联动公式</label>
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
        <div class="ldp-section-title">默认值</div>
        <div class="ldp-prop">
          <label>默认值类型</label>
          <Select
            :model-value="node.dataConfig?.defaultType ?? 'none'"
            :options="[
              { value: 'none', label: '无' },
              { value: 'fixed', label: '固定值' },
              { value: 'formula', label: '公式' },
              { value: 'api', label: 'API 获取' },
              { value: 'currentUser', label: '当前用户' },
              { value: 'currentTime', label: '当前时间' },
            ]"
            @update:model-value="emit('update', { dataConfig: { ...node.dataConfig, defaultType: $event as any } })"
          />
        </div>
        <template v-if="node.dataConfig?.defaultType === 'formula'">
          <div class="ldp-prop">
            <label>默认值公式</label>
            <Input
              :model-value="node.dataConfig?.defaultFormula ?? ''"
              placeholder="如：{{phone}} + {{name}}"
              @update:model-value="
                emit('update', { dataConfig: { ...node.dataConfig, defaultFormula: String($event ?? '') } })
              "
            />
          </div>
        </template>

        <div class="ldp-section-title">远程数据源</div>
        <div class="ldp-datasource-card">
          <div class="ldp-prop" style="padding: 0; border: none">
            <label>数据源类型</label>
            <Select
              :model-value="node.dataConfig?.sourceType ?? 'none'"
              :options="[
                { value: 'none', label: '无（静态数据）' },
                { value: 'api', label: 'API 接口' },
                { value: 'database', label: '数据库表' },
                { value: 'userList', label: '关联用户列表' },
                { value: 'deptList', label: '关联部门列表' },
              ]"
              @update:model-value="emit('update', { dataConfig: { ...node.dataConfig, sourceType: $event as any } })"
            />
          </div>
          <template v-if="node.dataConfig?.sourceType === 'api'">
            <div class="ldp-prop" style="padding: 0; border: none; margin-top: 8px">
              <label>接口地址</label>
            </div>
            <div class="ldp-datasource-url">
              <input
                class="ldp-datasource-input"
                :value="node.dataConfig?.apiUrl ?? ''"
                placeholder="接口地址，如 https://api.example.com/data"
                @input="
                  emit('update', {
                    dataConfig: { ...node.dataConfig, apiUrl: ($event.target as HTMLInputElement).value },
                  })
                "
              />
            </div>
            <div class="ldp-prop" style="padding: 0; border: none; margin-top: 8px">
              <label>数据映射</label>
              <div style="display: flex; gap: 6px">
                <Input
                  :model-value="node.dataConfig?.labelField ?? ''"
                  placeholder="显示字段名"
                  @update:model-value="
                    emit('update', { dataConfig: { ...node.dataConfig, labelField: String($event ?? '') } })
                  "
                />
                <Input
                  :model-value="node.dataConfig?.valueField ?? ''"
                  placeholder="值字段名"
                  @update:model-value="
                    emit('update', { dataConfig: { ...node.dataConfig, valueField: String($event ?? '') } })
                  "
                />
              </div>
            </div>
          </template>
        </div>

        <div class="ldp-section-title">数据联动</div>
        <div class="ldp-prop">
          <label>联动数据源</label>
          <Select
            :model-value="node.dataConfig?.linkageSource ?? 'none'"
            :options="[
              { value: 'none', label: '无' },
              { value: 'userList', label: '关联用户列表' },
              { value: 'deptList', label: '关联部门列表' },
              { value: 'roleList', label: '关联角色列表' },
            ]"
            @update:model-value="emit('update', { dataConfig: { ...node.dataConfig, linkageSource: $event as any } })"
          />
        </div>
        <div v-if="node.dataConfig?.linkageSource && node.dataConfig.linkageSource !== 'none'" class="ldp-prop">
          <label>联动条件字段</label>
          <Select
            :model-value="node.dataConfig?.linkageField ?? ''"
            :options="visibleWhenFieldOptions"
            placeholder="— 无 —"
            @update:model-value="
              emit('update', {
                dataConfig: { ...node.dataConfig, linkageField: $event === null ? '' : String($event ?? '') },
              })
            "
          />
        </div>

        <div class="ldp-section-title">数据持久化</div>
        <div class="ldp-prop ldp-prop-switch">
          <label>缓存数据</label>
          <Group
            type="switch"
            :model-value="!!node.dataConfig?.cacheData"
            @update:model-value="emit('update', { dataConfig: { ...node.dataConfig, cacheData: !!$event } })"
          />
        </div>
        <div class="ldp-prop ldp-prop-switch">
          <label>提交后清空</label>
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
      <p>选中节点后<br />编辑属性</p>
    </div>
  </aside>
</template>
