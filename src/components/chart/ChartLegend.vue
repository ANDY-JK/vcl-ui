<script setup lang="ts">
// 独立 HTML 图例 — flex-wrap + gap 自然撑高，永不重叠
defineProps<{
  items: { name: string; color: string; visible: boolean }[]
}>()

const emit = defineEmits<{
  toggle: [name: string]
}>()

function onClick(name: string) {
  emit('toggle', name)
}
</script>

<template>
  <div v-if="items.length > 0" class="cl-root">
    <div class="cl-list">
      <button
        v-for="item in items"
        :key="item.name"
        class="cl-item"
        :class="{ off: !item.visible }"
        :title="item.name"
        @click="onClick(item.name)"
      >
        <span class="cl-dot" :style="{ backgroundColor: item.color }"></span>
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
  transition: opacity .15s, background .15s;
  line-height: 1.6;
}
.cl-item:hover { background: var(--color-bg-hover, #e8e9eb); }
.cl-item.off { opacity: 0.3; }
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
