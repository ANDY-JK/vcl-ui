<script setup lang="ts">
// 独立 HTML 图例 — flex-wrap + gap 自然撑高，永不重叠
import { computed } from 'vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()

const props = defineProps<{
  /**
   * 图例项：名称 + 色值 + 当前可见态。
   *
   * `key` 是项的**唯一身份**（与展示名分开，#489）：两个系列可以同名，而隐藏集合、
   * DOM key 都必须按身份走 —— 否则点其中一个会两个一起消失。
   *
   * 不传 `key`（或传空串）时退化为按**展示名**，此时同名项在 `toggle` 事件里
   * 无法区分（都发同一个 name）—— 需要精确控制请显式传 `key`（#492）。
   */
  items: { key?: string; name: string; color: string; visible: boolean }[]
}>()

const emit = defineEmits<{
  /** 点击单个图例：切换该项（传了 key 发 key，否则发展示名） */
  toggle: [identity: string]
  /** 全部显示 / 全部隐藏 */
  'toggle-all': [visible: boolean]
}>()

const allVisible = computed(() => props.items.length > 0 && props.items.every((i) => i.visible))

/**
 * 事件身份：优先用非空 key，否则用展示名（#492）。
 *
 * 为什么挡空串：模板里 DOM key 写的是 `keyOf(item) || i`（空串会退回下标），
 * 而事件以前直接发 `keyOf(item)` —— 同一个项在 DOM 里叫 "0"、在事件里叫 ""，
 * 宿主拿到空串根本找不到要切换的项，点了没反应。
 */
function keyOf(item: { key?: string; name: string }): string {
  const k = item.key?.trim()
  return k || item.name
}

/**
 * DOM 专用 key：在事件身份后面补「第几个同名」，保证 v-for 的 key 唯一。
 * 事件仍发 `keyOf(item)`（不把这段合成尾巴泄漏给宿主）；DOM 与事件各司其职。
 */
const domKeys = computed<string[]>(() => {
  const seen = new Map<string, number>()
  return props.items.map((item) => {
    const base = keyOf(item)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return `${base}#${n}`
  })
})

function onClick(item: { key?: string; name: string }) {
  emit('toggle', keyOf(item))
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
        v-for="(item, i) in items"
        :key="domKeys[i]"
        type="button"
        class="cl-item"
        :class="{ off: !item.visible }"
        :title="item.name"
        @click="onClick(item)"
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
