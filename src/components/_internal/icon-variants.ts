/**
 * 图标渲染的**纯函数部分**（从 `basic/IconSvg.vue` 提取）
 *
 * ## 为什么单独成文件
 *
 * `IconSvg.vue` 到了 `basic` 域止涨线 220 行的 216 行（余量 1.8%，闸口已亮 ⚠）——
 * 而它里面有一半是**与 Vue 组件生命周期无关的纯映射**：尺寸表、尺寸类名、
 * kebab→Pascal、Solar 变体名补全、兜底占位 SVG。
 *
 * 抽出来有三个直接好处：
 *   1. 组件只剩"选 provider + 触发放载 + 降级"的编排逻辑，止涨线余量回到两位数
 *   2. 纯函数可以用单测直接钉住（`icon-variants.spec.ts`）—— 在组件里只能靠挂载间接验
 *   3. Solar 变体规则（六个后缀）是**易错点**，单独成文件后改它不需要碰受保护的组件
 *
 * ⚠️ 行为一字未改：全部是原样搬移，连注释都保留。
 */
import { h } from 'vue'

/** 尺寸名 → 渲染像素（`md` 兜底） */
export const sizeMap: Record<string, number> = { xs: 12, sm: 16, md: 20, lg: 24, xl: 28 }

/** 渲染尺寸 → 尺寸类名。兜底函数只拿得到渲染尺寸（拿不到 props），故按数值反查 */
export const PX_CLASS: Record<number, string> = {
  12: 'icon-sz-xs',
  16: 'icon-sz-sm',
  20: 'icon-sz-md',
  24: 'icon-sz-lg',
  28: 'icon-sz-xl',
}

/**
 * 图标的渲染尺寸走 CSS 而非 width/height 属性：属性值只能是 SVG 用户单位，塞不进
 * calc()，图标就会在整体等比缩放时保持恒定——按钮缩了、图标没缩，正是「头大身子小」。
 * 这里保留属性（库内部按它算 viewBox 与描边比例），再由 .icon-svg 的 CSS 覆盖实际尺寸。
 */
export function sizeClass(size: string): string {
  return `icon-svg ${PX_CLASS[sizeMap[size] ?? 20] ?? 'icon-sz-md'}`
}

/** kebab-case → PascalCase（容忍空段如 foo--bar，避免 w[0] undefined 崩溃） */
export function toPascal(kebab: string): string {
  return kebab
    .split('-')
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join('')
}

/** Solar 图标变体后缀（末尾命中其一则不再补 `-linear`） */
export const SOLAR_VARIANTS = ['linear', 'bold', 'broken', 'outline', 'bold-duotone', 'line-duotone']

/**
 * 图标名 → Solar 全名。
 *
 * Solar 的命名是 `solar:<name>-<variant>`；调用方通常只写基础名，
 * 所以末尾没有变体后缀时补默认的 `-linear`。支持两段式变体（`bold-duotone`）。
 */
export function toSolarIconName(name: string): string {
  const parts = name.split('-')
  const lastTwo = parts.slice(-2).join('-')
  const lastOne = parts[parts.length - 1]!
  const hasVariant = SOLAR_VARIANTS.includes(lastTwo) || SOLAR_VARIANTS.includes(lastOne)
  return `solar:${name}${hasVariant ? '' : '-linear'}`
}

/**
 * 兜底占位 SVG（图标未命中，或 Solar/Morphicons 数据异步加载中时使用）。
 * 形状是四个小方块：一眼能看出"这不是真图标"，不会让人误以为设计如此。
 */
export function renderFallback(sz: number, clr: string) {
  return h(
    'svg',
    {
      class: `icon-svg ${PX_CLASS[sz] ?? 'icon-sz-md'}`,
      width: sz,
      height: sz,
      color: clr,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': true,
    },
    [
      h('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }),
      h('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }),
      h('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }),
      h('rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }),
    ],
  )
}
