<script setup lang="ts">
// 独立 HTML 图例 — flex-wrap + gap 自然撑高，永不重叠
import { computed } from 'vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()

const props = defineProps<{
  /** 图例项：名称 + 色值 + 当前可见态 */
  items: { name: string; color: string; visible: boolean }[]
}>()

const emit = defineEmits<{
  /** 点击单个图例：切换该序列可见性 */
  toggle: [name: string]
  /** 全部显示 / 全部隐藏 */
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
        <span class="cl-text" :title="item.name">{{ item.name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.cl-root {
  flex-shrink: 0;
  padding: var(--space-2) calc(12px * var(--vcl-scale)) calc(4px * var(--vcl-scale));
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
  font-size: calc(14px * var(--vcl-scale));
  padding: var(--space-0) calc(8px * var(--vcl-scale));
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1.5;
}
.cl-toggle-all:hover {
  border-color: var(--color-primary);
  color: var(--color-primary-on-surface);
}
.cl-toggle-all--active {
  border-color: var(--color-primary);
  color: var(--color-primary-on-surface); /* AA：浅主色底上基色 3.8 不达标 */
  background: var(--color-primary-light);
}
.cl-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) calc(16px * var(--vcl-scale));
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
  font-size: calc(15px * var(--vcl-scale));
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
  width: calc(10px * var(--vcl-scale));
  height: calc(10px * var(--vcl-scale));
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}
.cl-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(140px * var(--vcl-scale));
}
</style>
