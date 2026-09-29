<script setup lang="ts">
// ⛔ 保护 — 标签+徽标合一，禁止：clamp() → px，variant 枚举修改
//    需我确认：新增 variant 颜色、closable 行为
// 合并说明：原 Badge.vue 已合并到 Tag，Badge 的 count/sup/color/offset/showZero/hidden 全部吸收
import { computed, useSlots } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()

interface Props {
  /** 文字内容（内联模式） */
  text?: string
  /** 变体颜色 */
  variant?: 'default' | 'primary' | 'success' | 'danger' | 'warning' | 'info'
  /** 尺寸 */
  size?: 'sm' | 'md'
  /** 可关闭 */
  closable?: boolean
  /** 圆角药丸 */
  rounded?: boolean
  /** 纯圆点模式 */
  dot?: boolean
  /** 数字溢出上限，如 99 → 99+，仅当 text 为纯数字或 count 生效时生效 */
  max?: number
  // ---- 以下为原 Badge 功能 ----
  /** 数字徽标：显示数量；与 text 同时传入时 text 优先 */
  count?: number
  /** 自定义背景色（CSS 颜色或变量，默认随 variant） */
  color?: string
  /** 角标偏移 [x, y]：正 x 向右、正 y 向下（仅 sup 角标模式生效） */
  offset?: [number, number]
  /** count=0 时仍显示（默认 count=0 隐藏） */
  showZero?: boolean
  /** 强制隐藏 */
  hidden?: boolean
  /** 角标模式：包裹内容时角标定位在右上角（原 Badge 的核心功能） */
  sup?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'md',
  closable: false,
  rounded: false,
  dot: false,
  max: 99,
  showZero: false,
  hidden: false,
  sup: false,
})

const emit = defineEmits<{
  /** 点击关闭按钮（仅 closable 时出现） */
  close: []
}>()
const slots = useSlots()

/** 有默认插槽 + sup 模式 → 角标定位在内容右上角 */
const isSupMode = computed(
  () =>
    (props.sup || !!slots.default) &&
    (props.count !== undefined || props.dot || props.text !== undefined || !!props.color),
)

/** 是否可见：hidden > dot > text > count（0 需 showZero） */
const visible = computed(() => {
  if (props.hidden) return false
  if (props.dot) return true
  if (props.text !== undefined) return props.text !== ''
  if (props.count !== undefined) return props.count > 0 || props.showZero
  // 纯内联标签模式（无 count/dot/text，有 slot 或默认 text）
  return true
})

/** 显示内容 */
const displayText = computed(() => {
  if (props.dot) return ''
  if (props.text !== undefined) return props.text
  if (props.count !== undefined) {
    const n = props.count
    return n > props.max ? `${props.max}+` : String(n)
  }
  // 纯文字模式
  const t = props.text ?? ''
  if (props.max !== undefined && /^\d+$/.test(t)) {
    const n = parseInt(t, 10)
    if (n > props.max) return `${props.max}+`
  }
  return t
})

/** 背景色覆盖。
 *  ⚠️ color prop 用于「实心底」场景，此前的默认文字色是 --color-text-secondary（灰字），
 *  压在实心底上对比度极低（实测暗色下配 --color-warning 仅 1.47，等同不可见）。
 *  故传了 color 时文字自动改为白色 —— 这是实心 tag 唯一可读的默认组合；
 *  需要自定义文字色请用 style/slot 覆盖。 */
const colorStyle = computed(() => {
  if (props.color) return { background: props.color, color: '#fff' }
  return {}
})

/** 角标定位偏移 */
const supStyle = computed(() => {
  const style: Record<string, string> = {}
  if (props.color) style.background = props.color
  if (props.offset) {
    style.top = `${props.offset[1]}px`
    style.right = `${-props.offset[0]}px`
  }
  return style
})
</script>

<template>
  <!-- 角标模式：包裹内容 + 右上角徽标 -->
  <span v-if="isSupMode" class="tag-sup-wrap">
    <!-- @slot default: 角标模式下被包裹的内容（右上角显示数字/圆点徽标） -->
    <slot />
    <span
      v-if="visible"
      class="tag-sup"
      :class="{ 'tag-dot': dot }"
      :style="supStyle"
      role="status"
      :aria-label="dot ? t('basic.tagHint') : displayText"
      >{{ displayText }}</span
    >
  </span>

  <!-- 内联标签模式 -->
  <span
    v-else
    class="tag"
    :class="[`tag-${variant}`, `tag-${size}`, { rounded, dot, 'tag-has-text': !dot && displayText }]"
    :style="colorStyle"
  >
    <!-- @slot default: 内联标签显示内容；不传则回退 text 属性 -->
    <slot>{{ displayText }}</slot>
    <button
      v-if="closable && !dot"
      type="button"
      class="tag-close"
      :aria-label="t('common.close')"
      @click.stop="emit('close')"
    >
      <IconSvg type="x" size="sm" />
    </button>
  </span>
</template>

<style scoped>
/* ===== 内联标签模式 ===== */
.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-weight: 500;
  white-space: nowrap;
  transition: all var(--transition-fast);
}
.tag-sm {
  padding: 1px var(--space-2);
  font-size: clamp(10px, calc(10px + var(--vcl-fit) * 5), 15px);
}
.tag-md {
  padding: var(--space-1) 10px;
  font-size: clamp(11px, calc(11px + var(--vcl-fit) * 4), 15px);
}
.tag.rounded {
  border-radius: 100px;
}

/* dot 模式：纯圆点 */
.tag.dot {
  width: 8px;
  height: 8px;
  padding: 0;
  border-radius: 50%;
  border: none;
  min-width: 0;
  min-height: 0;
}
.tag.dot.tag-sm {
  width: 6px;
  height: 6px;
}
.tag.dot.tag-md {
  width: 8px;
  height: 8px;
}
/* 有文字时恢复正常尺寸 */
.tag-has-text {
  width: auto;
  height: auto;
}

.tag-default {
  background: var(--color-bg-alt);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}
.tag-primary {
  /* 同其它语义色口径：浅底上的文字用深档令牌。--color-primary 基色压在
     --color-primary-light 上实测对比度不足 AA；solid 档（5.84）达标 */
  background: var(--color-primary-light);
  color: var(--color-primary-solid);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
}
.tag-success {
  background: var(--color-success-bg);
  color: var(--color-success-text);
  border: 1px solid var(--color-success-border);
  border-radius: var(--radius-sm);
}
.tag-danger {
  background: var(--color-danger-bg);
  color: var(--color-danger-hover);
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-sm);
}
.tag-warning {
  background: var(--color-warning-bg);
  color: var(--color-warning-text);
  border: 1px solid var(--color-warning-border);
  border-radius: var(--radius-sm);
}
.tag-info {
  background: var(--color-info-bg);
  color: var(--color-info-text);
  border: 1px solid var(--color-info-border);
  border-radius: var(--radius-sm);
}

.tag-close {
  display: inline-flex;
  padding: 1px;
  margin-left: var(--space-1);
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.5;
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.tag-close:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.08);
}

/* ===== 角标模式（原 Badge） ===== */
.tag-sup-wrap {
  position: relative;
  display: inline-flex;
}

/* 角标本体 — 圆角胶囊 */
.tag-sup {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: clamp(16px, 2vw, 18px);
  height: clamp(16px, 2vw, 18px);
  padding: 0 clamp(var(--space-1), 0.8vw, 6px);
  border-radius: 100px;
  /* 实心底压白字：用 --color-danger-solid（暗色下 --color-danger 被提亮为 #f87171，
     白字对比度仅 2.77 不达标） */
  background: var(--color-danger-solid, var(--color-danger));
  color: #ffffff;
  font-size: clamp(10px, calc(10px + var(--vcl-fit) * 5), 15px);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  /* 绝对定位右上角，中心点骑在内容角上对半跨出边界 */
  position: absolute;
  top: 0;
  right: 0;
  transform: translate(50%, -50%);
  border: 1px solid var(--color-badge-ring, var(--color-surface));
  z-index: 1;
}

/* 红点模式 */
.tag-sup.tag-dot {
  width: clamp(8px, 1vw, 10px);
  min-width: clamp(8px, 1vw, 10px);
  height: clamp(8px, 1vw, 10px);
  padding: 0;
  border-radius: 50%;
}
</style>
