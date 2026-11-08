<script setup lang="ts">
/**
 * Kbd — 快捷键标记
 *
 * 为什么单独立一个组件：密排界面靠「悬停提示 + 快捷键标记」省掉大量按钮文字，
 * 而快捷键标记必须有**统一的字形与尺寸**——各页面自己写 `<span>` 会得到七八种圆角与字号。
 *
 * 平台修饰键：传 `Mod` 时按平台展开（macOS → ⌘，其余 → Ctrl），
 * 宿主就不必在两处各写一遍判断。
 */
import { computed } from 'vue'

interface Props {
  /** 按键：`'Ctrl+K'` 或 `['Ctrl', 'K']`；`Mod` 按平台展开 */
  keys: string | string[]
  /** 键与键之间的分隔符（默认 `+`；传空串则只留间距） */
  sep?: string
  /** sm = 行内小字用；md = 常规 */
  size?: 'sm' | 'md'
}

const props = withDefaults(defineProps<Props>(), {
  sep: '+',
  size: 'md',
})

/** macOS 判定：只要 `Meta` 可用就按 mac 处理，宿主不必关心 UA 细节 */
function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  const p = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
  const src = `${p ?? ''} ${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`
  return /mac|iphone|ipad|ipod/i.test(src)
}

/** 键名 → 显示字形。只收常见几个，其余原样显示（不猜、不臆造） */
function glyphOf(key: string): string {
  const mac = isMac()
  switch (key) {
    case 'Mod':
      return mac ? '⌘' : 'Ctrl'
    case 'Meta':
    case 'Cmd':
      return mac ? '⌘' : 'Win'
    case 'Ctrl':
    case 'Control':
      return mac ? '⌃' : 'Ctrl'
    case 'Alt':
    case 'Option':
      return mac ? '⌥' : 'Alt'
    case 'Shift':
      return mac ? '⇧' : 'Shift'
    case 'Enter':
      return '↵'
    case 'Esc':
    case 'Escape':
      return 'Esc'
    case 'Tab':
      return '⇥'
    case 'Backspace':
      return mac ? '⌫' : 'Backspace'
    case 'Up':
      return '↑'
    case 'Down':
      return '↓'
    case 'Left':
      return '←'
    case 'Right':
      return '→'
    default:
      return key
  }
}

const glyphs = computed<string[]>(() => {
  const raw = Array.isArray(props.keys) ? props.keys : props.keys.split('+')
  return raw
    .map((k) => k.trim())
    .filter(Boolean)
    .map(glyphOf)
})
</script>

<template>
  <span class="kbd-group" :class="`kbd-${size}`">
    <template v-for="(g, i) in glyphs" :key="`${g}-${i}`">
      <kbd class="kbd-key">{{ g }}</kbd>
      <span v-if="i < glyphs.length - 1 && sep" class="kbd-sep" aria-hidden="true">{{ sep }}</span>
    </template>
  </span>
</template>

<style src="./kbd-scoped.css" scoped></style>
