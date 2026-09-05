<script setup lang="ts">
/**
 * 快捷键帮助面板（P2-10）— 工具栏「快捷键」按钮或画布 ? 键呼出
 * 纯展示组件：行数据本地定义，开合由 FormDesigner 的 v-if 控制
 */
import { computed } from 'vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()

/** 快捷键清单（keys 走 i18n：多选一项中英结构不同） */
const rows = computed(() => [
  { keys: 'Delete / Backspace', label: t('fbd.scDelete') },
  { keys: 'Ctrl + D', label: t('fbd.scDuplicate') },
  { keys: 'Ctrl + C / V', label: t('fbd.scCopyPaste') },
  { keys: 'Ctrl + Z', label: t('fbd.scUndo') },
  { keys: 'Ctrl + Shift + Z', label: t('fbd.scRedo') },
  { keys: 'Ctrl + ↑ / ↓', label: t('fbd.scMove') },
  { keys: t('fbd.scMultiKeys'), label: t('fbd.scMultiSelect') },
  { keys: '?', label: t('fbd.scHelp') },
])
</script>

<template>
  <div class="ld-shortcuts" role="dialog" :aria-label="t('fbd.shortcuts')">
    <div class="ld-sc-head">{{ t('fbd.shortcuts') }}</div>
    <div v-for="row in rows" :key="row.label" class="ld-sc-row">
      <span class="ld-sc-keys">{{ row.keys }}</span>
      <span class="ld-sc-label">{{ row.label }}</span>
    </div>
    <div class="ld-sc-hint">{{ t('fbd.shortcutsHint') }}</div>
  </div>
</template>
