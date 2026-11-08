<script setup lang="ts">
// ⛔ 保护 — 分割线，禁止：clamp() margin → px，dashed/solid 样式
//    需我确认：direction 方向、text 插槽位置
interface Props {
  /** 分隔线文案（居中显示在线上） */
  text?: string
  /** 方向：水平线（默认）| 垂直线 */
  direction?: 'horizontal' | 'vertical'
  /** 虚线样式 */
  dashed?: boolean
}

withDefaults(defineProps<Props>(), {
  direction: 'horizontal',
  dashed: false,
})
</script>

<template>
  <div v-if="direction === 'horizontal'" class="divider-h" :class="{ dashed, 'with-text': !!text }">
    <span v-if="text" class="divider-text">{{ text }}</span>
  </div>
  <!-- vertical 模式 text 无效，仅 horizontal 支持文字 -->
  <div v-else class="divider-v" :class="{ dashed }" />
</template>

<style scoped>
.divider-h {
  display: flex;
  align-items: center;
  width: 100%;
  border-top: 1px solid var(--vcl-color-border);
}
.divider-h.dashed {
  border-top-style: dashed;
}
.divider-h.with-text {
  border-top: none;
}
.divider-h.with-text::before,
.divider-h.with-text::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--vcl-color-border);
}
.divider-h.with-text.dashed::before,
.divider-h.with-text.dashed::after {
  border-top-style: dashed;
}
.divider-text {
  padding: 0 calc(16px * var(--vcl-scale));
  font-size: calc(15px * var(--vcl-scale));
  line-height: var(--vcl-text-subtitle-line);
  color: var(--vcl-color-text-muted);
  white-space: nowrap;
}

.divider-v {
  display: inline-block;
  width: 1px;
  height: 100%;
  min-height: calc(16px * var(--vcl-scale));
  border-inline-start: 1px solid var(--vcl-color-border);
  align-self: stretch;
}
.divider-v.dashed {
  border-inline-start-style: dashed;
}
</style>
