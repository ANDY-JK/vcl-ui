<script setup lang="ts">
// 独立 HTML 图例 — flex-wrap + gap 自然撑高，永不重叠
import { computed } from 'vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()

const props = defineProps<{
  items: { name: string; color: string; visible: boolean }[]
}>()

const emit = defineEmits<{
  toggle: [name: string]
  'toggle-all': [visible: boolean]
}>()

const allVisible = computed(() => props.items.length > 0 && props.items.every((i) => i.visible))

function onClick(name: string) {
  emit('toggle', name)
}

function onToggleAll() {
  // 如果当前全部可见 → 全部隐藏；否则（部分或全部隐藏）→ 全部显示
  emit('toggle-all', !allVisible.value)
}
</script>

<template>
  <div v-if="items.length > 0" class="cl-root">
    <div class="cl-header">
      <button type="button" class="cl-toggle-all" :class="{ 'cl-toggle-all--active': allVisible }" @click="onToggleAll">
        {{ allVisible ? t('chart.selectNone') : t('chart.selectAll') }}
      </button>
    </div>
    <div class="cl-list">
      <button
        v-for="item in items"
        :key="item.name"
        class="cl-item"
        :class="{ off: !item.visible }"
        :title="item.name"
        @click="onClick(item.name)"
      >
        <span class="cl-dot" :style="{ backgroundColor: item.color }" />
        <span class="cl-text">{{ item.name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.cl-root {
  flex-shrink: 0;
  padding: var(--space-2) 12px 4px;
  border-top: 1px solid var(--color-border-light);
  margin-top: var(--space-1);
}
.cl-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--space-1);
}
.cl-toggle-all {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: clamp(11px, 1.5vw, 14px);
  padding: var(--space-0) 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1.5;
}
.cl-toggle-all:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.cl-toggle-all--active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-light);
}
.cl-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) 16px;
}
.cl-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-1);
  border: none;
  background: none;
  cursor: pointer;
  border-radius: var(--radius-sm);
  font-size: clamp(12px, 1.6vw, 15px);
  color: var(--color-text);
  transition:
    opacity 0.15s,
    background 0.15s;
  line-height: 1.6;
}
.cl-item:hover {
  background: var(--color-bg-alt);
}
.cl-item.off {
  opacity: 0.3;
}
.cl-dot {
  width: clamp(8px, 1.5vw, 10px);
  height: clamp(8px, 1.5vw, 10px);
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}
.cl-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: clamp(100px, 18vw, 140px);
}
</style>
