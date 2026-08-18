<script setup lang="ts">
// ⛔ 保护 — 折叠面板，禁止：动画时序，展开/折叠逻辑，chevron 旋转
//    需我确认：accordion 互斥模式、defaultOpen 行为
import { ref, watch, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'

interface Props {
  title: string
  open?: boolean
  disabled?: boolean
  /** 面板唯一标识，用于 aria-controls / aria-labelledby 关联 */
  id?: string
  /** 手风琴模式标记：配合外部 CollapseGroup 使用，展开时自动关闭同组其他面板 */
  accordion?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  open: false,
  disabled: false,
  id: '',
  accordion: false,
})

const emit = defineEmits<{
  'update:open': [v: boolean]
  /** 手风琴模式：展开时触发，外部 CollapseGroup 监听后关闭同组其他面板 */
  'accordion-expand': []
}>()

// 内部状态管理：有 v-model 时同步 prop，无 v-model 时自主管理
const _open = ref(props.open)
watch(
  () => props.open,
  (v) => {
    _open.value = v
  },
)

// 生成唯一 ID，用于触发器与内容面板的 aria 关联
const panelId = computed(() => props.id || `collapse-panel-${Math.random().toString(36).slice(2, 10)}`)
const triggerId = computed(() => `collapse-trigger-${panelId.value.replace('collapse-panel-', '')}`)

// ---- max-height 动态计算：替代硬编码 1000px ----
// 原方案 max-height: 1000px 在内容超过 1000px 时会被截断
// 改为 JS 测量 scrollHeight，精准匹配内容高度
const contentRef = ref<HTMLElement | null>(null)
const contentMaxH = ref<string>('0px')

async function updateMaxHeight() {
  await nextTick()
  if (!contentRef.value) return
  contentMaxH.value = _open.value ? `${contentRef.value.scrollHeight}px` : '0px'
}

watch(_open, () => {
  updateMaxHeight()
})
onBeforeUnmount(() => {
  contentRef.value = null
})

// 初始化测量
nextTick(() => updateMaxHeight())

// 窗口 resize 时重新测量（内容可能因响应式布局变化）
let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  if (contentRef.value) {
    resizeObserver = new ResizeObserver(() => {
      if (_open.value) updateMaxHeight()
    })
    resizeObserver.observe(contentRef.value)
  }
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

function toggle() {
  if (props.disabled) return
  const next = !_open.value
  _open.value = next
  emit('update:open', next)
  if (next && props.accordion) {
    emit('accordion-expand')
  }
  updateMaxHeight()
}
</script>

<template>
  <div class="collapse" :class="{ open: _open, disabled }">
    <button
      :id="triggerId"
      type="button"
      class="collapse-trigger"
      :disabled="disabled"
      :aria-expanded="_open"
      :aria-controls="panelId"
      @click="toggle"
    >
      <span class="collapse-title">{{ title }}</span>
      <IconSvg type="chevron-right" size="sm" class="collapse-arrow" />
    </button>
    <div
      v-show="_open"
      :id="panelId"
      ref="contentRef"
      class="collapse-content"
      role="region"
      :aria-labelledby="triggerId"
      :class="{ expanded: _open }"
      :style="{ maxHeight: contentMaxH }"
    >
      <div class="collapse-body">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.collapse {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color var(--transition-fast);
}
.collapse.open {
  border-color: var(--color-primary);
}
.collapse.disabled {
  opacity: 0.45;
}

.collapse-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: clamp(8px, 1.5vw, 12px) clamp(10px, 2vw, 16px);
  border: none;
  background: var(--color-surface);
  font-size: clamp(12px, 1.8vw, 14px);
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.collapse-trigger:hover:not(:disabled) {
  background: var(--color-bg-alt);
}
.collapse-trigger:disabled {
  cursor: not-allowed;
}

.collapse-arrow {
  color: var(--color-text-muted);
  transition: transform var(--transition-normal);
}
.collapse.open .collapse-arrow {
  transform: rotate(90deg);
}

.collapse-content {
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  transition:
    max-height var(--transition-normal),
    opacity var(--transition-fast);
}
.collapse-content.expanded {
  opacity: 1;
  transition:
    max-height var(--transition-normal),
    opacity var(--transition-normal) 0.1s;
}

.collapse-body {
  padding: clamp(8px, 1.5vw, 12px) clamp(10px, 2vw, 16px) clamp(10px, 2vw, 16px);
  border-top: 1px solid var(--color-border-light);
  background: var(--color-bg);
}
</style>
