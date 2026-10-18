<!--
  PropsDisplaySource —— 展示类字段的「数据源」配置面板

  这是把数据源能力**交到普通用户手里**的那一步：在此之前 `displaySource` 只能改 schema JSON，
  用户没法在界面上点选「静态 / 绑定字段 / 接口」。

  三个刻意的交互决定：
  1. **静态数据用 JSON 文本框而非行编辑器**：展示类数据的形状千变万化（数组/对象/嵌套），
     强行做成行编辑器会立刻遇到"用户想要嵌套结构"的死角。JSON 是诚实的表达。
  2. **JSON 非法时不提交**：只在解析成功时 emit，非法输入就地提示——
     否则用户打到一半的残缺 JSON 会被写进 schema，画布直接白掉，还不知道是自己打字打了一半。
  3. **接口模式常驻安全提示**：默认只允许同源，跨域必须宿主显式放行。
     用户填了外域地址会看到"被拒绝"，提前说清楚比事后让人困惑好。
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import { useT } from '@/components/_internal/i18n'
import type { DesignerNode } from './types'
import type { DisplayDataSource, DisplayDataKind } from '../display-data-source'

const props = defineProps<{
  /** 当前编辑的节点 */
  node: DesignerNode
  /** 可绑定的字段（label/value），用于 field 模式的下拉 */
  fieldOptions: { label: string; value: string }[]
}>()

const emit = defineEmits<{
  /** 把 dataSource 补丁交回属性面板（与其它编辑行同一条通路） */
  update: [patch: Record<string, unknown>]
}>()

const t = useT()

const source = computed<DisplayDataSource>(() => props.node.displaySource ?? { kind: 'static' })

const kindOptions = computed(() => [
  { label: t('fbDisplay.kindStatic'), value: 'static' },
  { label: t('fbDisplay.kindField'), value: 'field' },
  { label: t('fbDisplay.kindApi'), value: 'api' },
])

const methodOptions = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
]

/** 静态数据的文本框；用独立状态承载"打到一半"的非法 JSON */
const staticText = ref('')
const staticError = ref('')

watch(
  () => props.node.displaySource?.staticData,
  (v) => {
    if (source.value.kind !== 'static') return
    try {
      staticText.value = v === undefined ? '' : JSON.stringify(v, null, 2)
      staticError.value = ''
    } catch {
      staticText.value = ''
    }
  },
  { immediate: true },
)

/** 切换来源模式：换模式时清掉上一模式无关的字段，避免 schema 里留一堆半截配置 */
function setKind(kind: DisplayDataKind): void {
  const next: DisplayDataSource =
    kind === 'static'
      ? { kind, staticData: source.value.kind === 'static' ? source.value.staticData : [] }
      : kind === 'field'
        ? { kind, fieldKey: source.value.fieldKey ?? '' }
        : {
            kind,
            apiUrl: source.value.apiUrl ?? '',
            method: source.value.method ?? 'GET',
            dataPath: source.value.dataPath ?? '',
          }
  emit('update', { displaySource: next })
}

function patch(part: Partial<DisplayDataSource>): void {
  emit('update', { displaySource: { ...source.value, ...part } })
}

/** 静态数据：只在合法时提交；非法就地提示并保留上一次有效值 */
function onStaticInput(v: string | number | null): void {
  const text = String(v ?? '')
  staticText.value = text
  if (!text.trim()) {
    staticError.value = ''
    patch({ staticData: [] })
    return
  }
  try {
    patch({ staticData: JSON.parse(text) })
    staticError.value = ''
  } catch {
    staticError.value = t('fbDisplay.badJson')
  }
}
</script>

<template>
  <div class="ldp-prop">
    <div class="ldp-prop">
      <label>{{ t('fbDisplay.sourceTitle') }}</label>
      <Select
        :model-value="source.kind"
        :options="kindOptions"
        @update:model-value="setKind($event as DisplayDataKind)"
      />
    </div>

    <!-- 静态配置：设计时写死 -->
    <template v-if="source.kind === 'static'">
      <div class="ldp-prop">
        <label>{{ t('fbDisplay.staticLabel') }}</label>
        <textarea
          class="ldp-display-json"
          rows="5"
          :value="staticText"
          :placeholder="t('fbDisplay.staticPh')"
          @input="onStaticInput(($event.target as HTMLTextAreaElement).value)"
        />
        <div v-if="staticError" class="ldp-prop-hint">{{ staticError }}</div>
        <div v-else class="ldp-prop-hint ldp-prop-ok">{{ t('fbDisplay.staticHint') }}</div>
      </div>
    </template>

    <!-- 绑定字段：展示"用户填出来的东西"，随填随变 -->
    <template v-else-if="source.kind === 'field'">
      <div class="ldp-prop">
        <label>{{ t('fbDisplay.fieldLabel') }}</label>
        <Select
          :model-value="source.fieldKey ?? ''"
          :options="fieldOptions"
          @update:model-value="patch({ fieldKey: String($event ?? '') })"
        />
      </div>
      <div class="ldp-prop-hint ldp-prop-ok">{{ t('fbDisplay.fieldHint') }}</div>
    </template>

    <!-- 接口拉取 -->
    <template v-else>
      <div class="ldp-prop">
        <label>{{ t('fbDisplay.apiUrlLabel') }}</label>
        <Input
          :model-value="source.apiUrl ?? ''"
          :placeholder="t('fbDisplay.apiUrlPh')"
          @update:model-value="patch({ apiUrl: String($event ?? '') })"
        />
      </div>
      <div class="ldp-prop">
        <label>{{ t('fbDisplay.methodLabel') }}</label>
        <Select
          :model-value="source.method ?? 'GET'"
          :options="methodOptions"
          @update:model-value="patch({ method: $event as 'GET' | 'POST' })"
        />
      </div>
      <div class="ldp-prop">
        <label>{{ t('fbDisplay.dataPathLabel') }}</label>
        <Input
          :model-value="source.dataPath ?? ''"
          :placeholder="t('fbDisplay.dataPathPh')"
          @update:model-value="patch({ dataPath: String($event ?? '') })"
        />
      </div>
      <div class="ldp-prop-hint ldp-prop-ok">{{ t('fbDisplay.apiHint') }}</div>
    </template>
  </div>
</template>
