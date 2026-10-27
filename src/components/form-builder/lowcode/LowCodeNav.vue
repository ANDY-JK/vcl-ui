<script setup lang="ts">
/**
 * LowCodeNav — 低代码导航外壳（宿主只挂这一个，其余导航项由用户自建）
 *
 * ## 它解决的那件事
 *
 * 用户的产品形态：**宿主搭一个导航外壳 + 一个低代码入口，其余导航项由用户自己配**。
 * 所以这个组件的定位是"框架"而不是"页面集合"：它负责
 *
 *   · 把 `NavSource`（static / api / forms 三来源，见 `useLowCodeNav`）变成可点的导航；
 *   · 维护选中态与页面区，**只 emit 不替宿主路由**（`update:modelValue` + `select`）；
 *   · 表单页内置渲染（内联 schema 或 `formId` 走 FormStore → `toFormSchema`），
 *     其余页面交给插槽 —— 这正是"用户完全自己对接"的出口；
 *   · 配置问题（`issues`）可选显示，默认不显示（导航干净优先），但**永远可从 `#issues` 取到**。
 *
 * ## 三个刻意的取舍
 *
 * 1. **不复用 `AccordionNav`**：它 `useRouter()/useRoute()` 绑 vue-router。若从本域引用，
 *    低代码用户只要 `import 'vcl-ui/form-builder'` 就会被拉进 layout 产物 + vue-router 依赖 ——
 *    为了省一个列表渲染不值得。本组件用 `key` + `emit` 把路由决定权留给宿主（与 ADR-005
 *    "`path` 只是建议值"一致）。
 * 2. **链接页对外链才允许真跳转**：站内链接 `preventDefault` 后交宿主路由器（否则整页刷新），
 *    外链才 `target="_blank"` 且必带 `rel="noopener noreferrer"`（防反向标签劫持）；两者都先选中当前项。
 * 3. **不自动提交**：`FormBuilder` 的 `submit` 只转成 `page-submit` 事件。配置可能经无签名分享码
 *    流入，自动外发等于把"把填表人输入发到任意域"的能力交给分享者（ADR-005 D3）。
 *
 * ## 受控语义
 *
 * 不传 `modelValue` = 非受控（内部自持，仍会 emit）；传了就完全受控 —— 拖 `v-model` 才有回写。
 * 悬空选中（选项被删/变成分组）由 `useLowCodeNav` 收敛，并**通过 `update:modelValue` 告知宿主**。
 */
import { computed, onUnmounted, ref, useSlots, watch } from 'vue'
import { useT } from '@/components/_internal/i18n'
import FormBuilder from '../FormBuilder.vue'
import type { ApiUrlPolicy } from '../api-url-guard'
import type { FormData, FormSchema } from '../types'
import type { FormStore } from '../designer/store'
import { isExternalNavUrl, type NavNode, type NavFormNode } from './nav-schema'
import { useLowCodeNav, type NavSource, type SelectionAdjustPayload } from './useLowCodeNav'
import { createFormPageResolver, type FormPageResolver } from './page-resolver'

interface Props {
  /** 导航定义来源（static / api / forms）；不传 = 空导航（空态，不报错） */
  source?: NavSource | (() => NavSource | undefined)
  /** 外发 URL 策略（api 来源用）；不传 = 只允许同源 */
  apiUrlPolicy?: () => ApiUrlPolicy
  /** 权限过滤（判定交宿主） */
  filter?: (node: NavNode) => boolean
  /** 注入 fetch（宿主常要加鉴权头 / 走自己的请求层）；不传用全局 fetch */
  fetcher?: typeof fetch
  /**
   * 表单存储（`forms` 来源的数据源，也是表单页解析的默认来源）。
   * 宿主对接自己后端时在这里注入；不传则用活动实例（`setActiveFormStore`）。
   */
  formStore?: FormStore
  /** 受控选中 key（不传 = 非受控） */
  modelValue?: string | null
  /** 侧栏标题（纯展示；不传则不渲染标题行） */
  title?: string
  /** 挂载即加载 */
  autoLoad?: boolean
  /** 加载后自动选中第一个可选项 */
  autoSelect?: boolean
  /** 表单页是否内置渲染（关掉 = 交给 `#page` 插槽，宿主完全自渲染） */
  renderFormPage?: boolean
  /** 表单页解析器（默认用活动 FormStore；宿主可换成自己后端取设计数据） */
  resolveFormPage?: FormPageResolver
  /** 是否显示配置问题条（默认不显示；问题仍可从 `#issues` 插槽取） */
  showIssues?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  autoLoad: true,
  autoSelect: true,
  renderFormPage: true,
  showIssues: false,
})

const emit = defineEmits<{
  /** 选中态变化（受控宿主据此回写；非受控时也会发，悬空收敛同样会通知宿主） */
  'update:modelValue': [key: string | null]
  /** 用户选中某个可选项 —— **只通知，不替宿主路由**（宿主按 key 决定跳哪里） */
  select: [node: NavNode]
  /** 表单页提交（校验通过后）；外壳**不自动外发**，由宿主的监听决定发给谁 */
  'page-submit': [payload: { node: NavNode; data: FormData }]
  /** 表单页数据变化（同一次变更只发一次，不透传 FormBuilder 的双事件） */
  'page-change': [payload: { node: NavNode; data: FormData }]
  /**
   * 选中态被**收敛**（第 144 轮）：宿主传的 key 不存在 / 指向分组 / 按配置置空。
   * 宿主应据此修正自己存的"上次访问页"，否则下次打开还在错页。
   */
  'selection-adjust': [payload: SelectionAdjustPayload]
}>()

const t = useT()
const slots = useSlots()

// ── 选中态：非受控用内部 ref；受控时宿主那枚 prop 是真源，二者共用一个可写 computed ──
const internalKey = ref<string | null>(null)
const selectedKey = computed<string | null>({
  get: () => (props.modelValue === undefined ? internalKey.value : props.modelValue),
  set: (v) => {
    internalKey.value = v
    emit('update:modelValue', v)
  },
})

const api = useLowCodeNav({
  // ⚠️ `props.source` 本身可能就是 getter：必须先分叉再包一层，否则会把"那个函数"当成来源传下去，
  // 于是 `getSource()` 拿到一个 function（`.kind` 为 undefined），表现是导航永远空 —— 却不报错。
  source: () => (typeof props.source === 'function' ? props.source() : props.source),
  apiUrlPolicy: () => props.apiUrlPolicy?.() ?? {},
  filter: (n) => (props.filter ? props.filter(n) : true),
  fetcher: props.fetcher,
  // getter 形态：宿主中途换实现（登录态/后端切换、内存 ↔ REST）后 `refresh()` 才跟得上。
  // 传 `props.formStore` 是**快照** —— 换了 store 还拿旧的取一遍，表现为"切了没变化"且不报错。
  formStore: () => props.formStore,
  modelValue: selectedKey,
  onSelectionAdjust: (payload) => emit('selection-adjust', payload),
  autoLoad: props.autoLoad,
  autoSelect: props.autoSelect,
  onSelect: (node) => emit('select', node),
})

const nodes = api.nodes
const current = api.current

// ── 页面区：表单页解析（token 序号防迟到覆盖；卸载作废） ──
type PageStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'error'
const pageStatus = ref<PageStatus>('idle')
const pageSchema = ref<FormSchema | null>(null)
const pageReason = ref('')
const pageError = ref('')
/** 每页独立表单数据：切页即重置（不复用上一页的输入，避免"串数据"） */
const pageData = ref<FormData>({})
let pageToken = 0
let disposed = false

const resolver = computed<FormPageResolver>(() => props.resolveFormPage ?? createFormPageResolver(props.formStore))

/** 只有"表单页 + 开启内置渲染 + 没被 `#page` 覆盖"才需要解析 */
const needsFormResolve = (node: NavNode | null): node is NavFormNode =>
  !!node && node.kind === 'form' && props.renderFormPage !== false && !slots.page

async function loadFormPage(node: NavNode | null): Promise<void> {
  pageSchema.value = null
  pageReason.value = ''
  pageError.value = ''
  pageData.value = {}
  if (!needsFormResolve(node)) {
    pageStatus.value = 'idle'
    return
  }
  const my = ++pageToken
  pageStatus.value = 'loading'
  try {
    const out = await resolver.value(node)
    if (my !== pageToken || disposed) return // 迟到结果丢弃（快速切页 / 卸载）
    if (out.status === 'ready') {
      pageSchema.value = out.schema
      pageStatus.value = 'ready'
    } else {
      pageReason.value = out.reason
      pageStatus.value = 'missing'
    }
  } catch (err) {
    if (my !== pageToken || disposed) return
    pageError.value = err instanceof Error ? err.message : String(err)
    pageStatus.value = 'error'
  }
}

watch(current, (node) => void loadFormPage(node), { immediate: true })

/**
 * 宿主刷新入口（`defineExpose`）：保存表单 / 改完后端数据后调用 —— 重取导航。
 *
 * 为什么这是产品形态的必需项而不是便利项：`forms` 来源的导航项由"用户自建表单"派生，
 * 用户在宿主里存完新表单后若不重取，新项不会出现 —— 此前宿主只剩两条路（整页重载，
 * 或去改全局 `setActiveFormStore` 触发）。既然承诺"用户完全自己对接自己数据库"，
 * 宿主就必须有能力说一句"我改完了，你重取一下"。
 *
 * ⚠️ **只调 `api.refresh()` 就够，不要在这里再显式 `loadFormPage(current)`**：
 * `refresh()` 会重建 `nodes`（新对象），`current` 身份随之变化，`watch(current, …)`
 * 已经把当前页重载掉了 —— 多写一行等于加一段永不独立生效的防御代码。
 * 本轮负向对照 + 实验证据：去掉那行后，static 来源（节点数组同一引用）下页面**照样**换成新标题。
 * 若将来有人让节点对象"身份稳定"（例如缓存复用），**必须回来把这里改回显式重载**。
 */
async function refresh(): Promise<void> {
  await api.refresh()
}

defineExpose({ refresh })

onUnmounted(() => {
  disposed = true
  pageToken++ // 卸载后到达的解析结果不再写状态
})

const navLabel = computed(() => props.title || t('common.menu'))
const pageKind = computed(() => current.value?.kind ?? 'none')
/** 外链才允许真跳转；站内链接交给宿主路由（见文件头取舍 2） */
const isExternal = computed(() => (current.value?.kind === 'link' ? isExternalNavUrl(current.value.url) : false))

function onNavClick(node: NavNode): void {
  if (node.kind === 'group') return // 分组不可选
  api.select(node.key)
}

function onLinkClick(e: MouseEvent): void {
  // 站内链接交给宿主路由器（否则整页刷新）；外链放行真跳转。两种都先选中当前项 ——
  // 不选中会出现"点了导航但高亮没动"的割裂感（外链万一被浏览器拦截也仍停在这一页）。
  const n = current.value
  if (!n) return
  if (!isExternal.value) e.preventDefault()
  api.select(n.key)
}

function onSubmit(data: FormData): void {
  if (current.value) emit('page-submit', { node: current.value, data })
}

/** `v-model` 回写：只同步本地页面数据，**不**对外发事件（FormBuilder 紧接着会发 `change`） */
function onModelUpdate(data: FormData): void {
  pageData.value = data
}

/** 数据变化（FormBuilder 的 `update:modelValue` 与 `change` 是同一次变更的两条事件） */
function onFormChange(data: FormData): void {
  pageData.value = data
  if (current.value) emit('page-change', { node: current.value, data })
}
</script>

<template>
  <div class="lcn" :data-nav-count="nodes.length">
    <nav class="lcn-nav" :aria-label="navLabel">
      <header v-if="title" class="lcn-title">{{ title }}</header>

      <!-- 配置问题条：默认不显示（导航干净优先），但内容永远可从 #issues 插槽取 -->
      <div
        v-if="showIssues && api.issues.value.length"
        class="lcn-issues"
        role="status"
        :data-issues="api.issues.value.length"
      >
        <ul class="lcn-issues-list">
          <li v-for="(issue, i) in api.issues.value" :key="`${issue.path}:${issue.code}:${i}`" :data-code="issue.code">
            <code class="lcn-issue-path">{{ issue.path }}</code> {{ issue.message }}
          </li>
        </ul>
      </div>
      <!-- @slot issues: 取全部配置问题（默认不显示问题条，但插槽始终可用来自己呈现） -->
      <div v-else-if="slots.issues" class="lcn-issues-host">
        <slot name="issues" :issues="api.issues.value" />
      </div>

      <!-- 导航加载态 / 失败态：失败**不清空**已有导航（一次抖动不该让整条导航消失） -->
      <div v-if="api.loading.value && !nodes.length" class="lcn-hint" data-state="loading">
        {{ t('common.loading') }}
      </div>
      <div v-if="api.error.value" class="lcn-error" role="alert" data-state="error">
        <span class="lcn-error-text">{{ api.error.value }}</span>
        <button type="button" class="lcn-retry" @click="api.refresh()">{{ t('common.retry') }}</button>
      </div>

      <!-- @slot nav-empty: 覆盖"导航为空"的文案 -->
      <p v-if="!api.loading.value && !nodes.length" class="lcn-hint" data-state="empty">
        <slot name="nav-empty">{{ t('common.empty') }}</slot>
      </p>

      <ul v-if="nodes.length" class="lcn-list">
        <li v-for="node in nodes" :key="node.key" class="lcn-li">
          <!-- 分组：不可选，只收拢子项 -->
          <template v-if="node.kind === 'group'">
            <!-- @slot nav-group: 自定义分组标题渲染（默认只出一行不可点的标题） -->
            <slot name="nav-group" :node="node">
              <div class="lcn-group-label">{{ node.label }}</div>
            </slot>
            <ul class="lcn-sublist">
              <li v-for="child in node.children" :key="child.key" class="lcn-li">
                <!-- @slot nav-item: 自定义导航项渲染（接管后不渲染内置按钮；回传 node/active/select） -->
                <slot name="nav-item" :node="child" :active="child.key === api.selectedKey.value" :select="onNavClick">
                  <button
                    type="button"
                    class="lcn-item"
                    :class="{ active: child.key === api.selectedKey.value }"
                    :data-key="child.key"
                    :aria-current="child.key === api.selectedKey.value ? 'page' : undefined"
                    @click="onNavClick(child)"
                  >
                    <!-- @slot icon: 自定义图标渲染（默认只出 data-icon 属性，本库不解释图标名） -->
                    <slot name="icon" :node="child">
                      <span v-if="child.icon" class="lcn-icon" aria-hidden="true" :data-icon="child.icon" />
                    </slot>
                    <span class="lcn-label" :title="child.label">{{ child.label }}</span>
                    <span v-if="child.badge" class="lcn-badge">{{ child.badge }}</span>
                  </button>
                </slot>
              </li>
            </ul>
          </template>

          <slot v-else name="nav-item" :node="node" :active="node.key === api.selectedKey.value" :select="onNavClick">
            <button
              type="button"
              class="lcn-item"
              :class="{ active: node.key === api.selectedKey.value }"
              :data-key="node.key"
              :aria-current="node.key === api.selectedKey.value ? 'page' : undefined"
              @click="onNavClick(node)"
            >
              <slot name="icon" :node="node">
                <span v-if="node.icon" class="lcn-icon" aria-hidden="true" :data-icon="node.icon" />
              </slot>
              <span class="lcn-label" :title="node.label">{{ node.label }}</span>
              <span v-if="node.badge" class="lcn-badge">{{ node.badge }}</span>
            </button>
          </slot>
        </li>
      </ul>
    </nav>

    <section
      class="lcn-page"
      :class="{ 'lcn-page-external': isExternal }"
      :data-kind="pageKind"
      :data-key="current?.key ?? ''"
    >
      <!-- 1. 宿主完全自渲染（优先级最高，连内置表单页都覆盖） -->
      <!-- @slot page: 完全接管页面区（优先级最高；用它会跳过表单页解析） -->
      <slot v-if="slots.page" name="page" :node="current" :issues="api.issues.value" />

      <template v-else-if="!current">
        <p class="lcn-hint" data-state="no-page">{{ t('common.empty') }}</p>
      </template>

      <!-- 2. 链接页：外链真跳转（带 noopener），站内链接交宿主路由 -->
      <template v-else-if="current.kind === 'link'">
        <a
          class="lcn-link"
          :href="current.url"
          :target="isExternal ? '_blank' : undefined"
          :rel="isExternal ? 'noopener noreferrer' : undefined"
          :data-external="isExternal ? '1' : '0'"
          @click="onLinkClick"
        >
          {{ current.label }}
        </a>
      </template>

      <!-- 3. 表单页：内置渲染（解析中/空态/错误态都在这里收口） -->
      <template v-else-if="current.kind === 'form' && renderFormPage">
        <p v-if="pageStatus === 'loading'" class="lcn-hint" data-state="form-loading">{{ t('common.loading') }}</p>
        <div
          v-else-if="pageStatus === 'missing'"
          class="lcn-missing"
          data-state="form-missing"
          :data-reason="pageReason"
        >
          {{ pageReason }}
        </div>
        <div v-else-if="pageStatus === 'error'" class="lcn-error" role="alert" data-state="form-error">
          <span class="lcn-error-text">{{ pageError }}</span>
          <button type="button" class="lcn-retry" @click="loadFormPage(current)">{{ t('common.retry') }}</button>
        </div>
        <FormBuilder
          v-else-if="pageStatus === 'ready' && pageSchema"
          class="lcn-form"
          :schema="pageSchema"
          :model-value="pageData"
          @update:model-value="onModelUpdate"
          @change="onFormChange"
          @submit="onSubmit"
        />
      </template>

      <!-- 4. 其余（data / custom，或宿主关掉内置表单渲染）：交给默认插槽，没插槽就是空态 -->
      <!-- @slot default: 兜底页面渲染（data/custom 页，或宿主关掉内置表单渲染时） -->
      <slot v-else :node="current" :issues="api.issues.value">
        <!-- 第 153 轮：这句**必须指路**。`data-state` 只有读 DOM 的人看得见，
             宿主集成者看到的是文案 —— 原来和 no-page 共用"暂无数据"，
             用户分不清"这页本来就空"还是"我没接插槽"。 -->
        <p class="lcn-hint" data-state="slot-required">{{ t('fbd.slotRequired') }}</p>
      </slot>
    </section>
  </div>
</template>

<style src="./lowcode-nav-scoped.css" scoped></style>
