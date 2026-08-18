<script setup lang="ts">
// 独立 HTML 图例 — flex-wrap + gap 自然撑高，永不重叠
import { computed } from 'vue'

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
        {{ allVisible ? '全不选' : '全选' }}
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
  border-top: 1px solid var(--color-border-light, #eee);
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
  font-size: 11px;
  padding: 2px 8px;
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
  gap: 5px;
  padding: var(--space-1) 6px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--color-text);
  transition:
    opacity 0.15s,
    background 0.15s;
  line-height: 1.6;
}
.cl-item:hover {
  background: var(--color-bg-hover, #e8e9eb);
}
.cl-item.off {
  opacity: 0.3;
}
.cl-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}
.cl-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}
</style>
