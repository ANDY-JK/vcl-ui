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
      <!-- 2026-10-02：全不选并入图例行末尾（原独立一行，窄图区会另起一行） -->
      <button type="button" class="cl-toggle-all" :class="{ 'cl-toggle-all--active': allVisible }" @click="onToggleAll">
        {{ allVisible ? t('chart.selectNone') : t('chart.selectAll') }}
      </button>
    </div>
  </div>
</template>

<style src="./chart-legend-scoped.css" scoped></style>
