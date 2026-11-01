<script setup lang="ts">
/**
 * 属性面板 — 设计器右栏 (v3)
 *
 * 五页签容器：基本 / 校验 / 样式 / 事件 / 数据。各页内容拆分为子组件：
 * PropsValidationPage / PropsEventPage / PropsDataPage / PropsConditionGroup / PropsAdvancedFields。
 */
import { computed, ref, watch } from 'vue'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import IconPicker from '@/components/form/IconPicker.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useT } from '@/components/_internal/i18n'
import { toNativeColorValue } from '@/components/_internal/utils'
import {
  getTypeLabel,
  getTypeIcon,
  parseCascaderOptions,
  isContainerNode,
  flattenNodes,
  type DesignerNode,
} from './types'
import { getFieldDefaults, getComponentCategory } from '../fieldRegistry'
import PropsValidationPage from './PropsValidationPage.vue'
import PropsEventPage from './PropsEventPage.vue'
import PropsDataPage from './PropsDataPage.vue'
import PropsConditionGroup from './PropsConditionGroup.vue'
import PropsAdvancedFields from './PropsAdvancedFields.vue'
import PropsContainerSection from './PropsContainerSection.vue'

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

/** Number 值转换：清空输入必须落成 undefined——
 *  落成 0 会把 maxLength 变成"锁死输入框"、min/step/rows 变成错误默认值 */
function onNumberEmit(key: keyof DesignerNode, v: unknown): void {
  if (v === '' || v == null) {
    emit('update', { [key]: undefined } as Partial<DesignerNode>)
    return
  }
  const num = Number(v)
  emit('update', { [key]: isNaN(num) ? undefined : num } as Partial<DesignerNode>)
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

// ════════════════════════════════════════
// 滚动位置与页签有效性
// ════════════════════════════════════════

const panelRef = ref<HTMLElement | null>(null)

function resetScroll(): void {
  if (panelRef.value) panelRef.value.scrollTop = 0
}

// 切换页签 / 切换节点时回到顶部，避免长表单里"看不到刚打开的面板内容"
watch(activeTab, () => resetScroll())
watch(
  () => props.node.id,
  () => {
    // 容器只有「基本」页，切到容器时把失效页签拉回基本页，否则面板会空白
    if (!availableTabs.value.some((tab) => tab.id === activeTab.value)) activeTab.value = 'basic'
    resetScroll()
  },
)
</script>

<template>
  <aside ref="panelRef" class="ldp-props">
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
          :tabindex="activeTab === tab.id ? 0 : -1"
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

        <!-- 容器节点专属（拆分至 PropsContainerSection.vue，超 800 行整改） -->
        <PropsContainerSection v-if="isContainer" :node="node" @update="emit('update', $event)" />

        <!-- 字段节点专属属性 -->
        <template v-else>
          <div class="ldp-prop">
            <label>{{ t('fbp.fieldKey') }}</label>
            <Input
              :model-value="node.key ?? ''"
              :placeholder="t('fbp.fieldKeyPh')"
              @update:model-value="emit('update', { key: $event === null ? '' : String($event) })"
            />
            <span class="ldp-prop-hint">{{ t('fbp.keyHint') }}</span>
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

          <!-- 扫码识别属性（空/0 = 不过滤，与渲染端 ok() 口径一致） -->
          <template v-if="node.type === 'scan-code'">
            <div class="ldp-section-title">{{ t('fbp.sectionScan') }}</div>
            <div class="ldp-prop">
              <label>{{ t('fbp.scanFormats') }}</label>
              <Select
                :model-value="node.scanFormats ?? 'all'"
                :options="[
                  { value: 'all', label: t('fbp.scanFmtAll') },
                  { value: 'qr', label: t('fbp.scanFmtQr') },
                  { value: 'barcode', label: t('fbp.scanFmtBarcode') },
                ]"
                @update:model-value="emit('update', { scanFormats: $event as 'all' | 'qr' | 'barcode' })"
              />
            </div>
            <div class="ldp-prop">
              <label>{{ t('fbp.scanPrefix') }}</label>
              <Input
                :model-value="node.scanPrefix ?? ''"
                :placeholder="t('fbp.scanPrefixPh')"
                @update:model-value="onInputEmit('scanPrefix', $event)"
              />
            </div>
            <div class="ldp-prop">
              <label>{{ t('fbp.scanLength') }}</label>
              <Input
                type="number"
                :model-value="node.scanLength ?? 0"
                :placeholder="t('fbp.scanLengthPh')"
                @update:model-value="onNumberEmit('scanLength', $event)"
              />
            </div>
          </template>

          <PropsAdvancedFields :node="node" @update="emit('update', $event)" />

          <PropsConditionGroup :node="node" :field-options="visibleWhenFieldOptions" @update="emit('update', $event)" />
        </template>
      </div>

      <!-- ═══ 校验规则页（子组件 PropsValidationPage） ═══ -->
      <PropsValidationPage
        v-show="activeTab === 'validation' && !isContainer"
        :node="node"
        @update="emit('update', $event)"
      />

      <!-- ═══ 样式设置页 ═══ -->
      <div v-show="activeTab === 'style' && !isContainer" class="ldp-prop-page">
        <div class="ldp-section-title">{{ t('fbp.sectionLabel') }}</div>
        <div class="ldp-prop">
          <label>{{ t('fbp.labelPosition') }}</label>
          <Select
            :model-value="node.styleConfig?.labelPosition ?? 'left'"
            :options="[
              { value: 'left', label: t('fbp.posLeft') },
              { value: 'top', label: t('fbp.posTop') },
              { value: 'hidden', label: t('fbp.posHidden') },
            ]"
            @update:model-value="
              emit('update', {
                styleConfig: { ...node.styleConfig, labelPosition: $event as 'left' | 'top' | 'hidden' },
              })
            "
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
            @update:model-value="
              emit('update', { styleConfig: { ...node.styleConfig, controlWidth: $event as '100%' | '50%' | 'auto' } })
            "
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
            @update:model-value="
              emit('update', { styleConfig: { ...node.styleConfig, size: $event as 'small' | 'default' | 'large' } })
            "
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
            @update:model-value="
              emit('update', {
                styleConfig: { ...node.styleConfig, radius: $event as 'default' | '0px' | '12px' | '20px' },
              })
            "
          />
        </div>

        <div class="ldp-section-title">{{ t('fbp.sectionColor') }}</div>
        <div class="ldp-prop">
          <label>{{ t('fbp.borderColor') }}</label>
          <div class="ldp-color-row">
            <input
              type="color"
              class="ldp-color-picker"
              :value="toNativeColorValue(node.styleConfig?.borderColor ?? '#e2e8f0')"
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
              :value="toNativeColorValue(node.styleConfig?.focusBorderColor ?? '#4f6ef7')"
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
      </div>

      <!-- ═══ 事件配置页 ═══ -->
      <PropsEventPage
        v-show="activeTab === 'event' && !isContainer"
        :node="node"
        :field-options="visibleWhenFieldOptions"
        @update="emit('update', $event)"
      />
      <PropsDataPage
        v-show="activeTab === 'data' && !isContainer"
        :node="node"
        :field-options="visibleWhenFieldOptions"
        @update="emit('update', $event)"
      />
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
