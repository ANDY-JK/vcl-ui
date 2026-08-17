<script lang="ts">
// ⛔ 保护 — 图标渲染核心，使用 lucide-vue-next + @iconify/vue
import { defineComponent, computed, h } from 'vue'
import { icons as lucideIcons } from '@lucide/vue'
import { Icon } from '@iconify/vue'

const sizeMap: Record<string, number> = { xs: 12, sm: 16, md: 20, lg: 24, xl: 28 }

/** kebab-case → PascalCase */
function toPascal(kebab: string): string {
  return kebab.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('')
}

export default defineComponent({
  name: 'IconSvg',
  props: {
    type: { type: String, required: true },
    size: { type: String, default: 'md' },
    color: { type: String, default: 'currentColor' },
    provider: { type: String, default: 'lucide' },
  },
  setup(props) {
    const px = computed(() => sizeMap[props.size] || 20)

    /** Solar 图标变体后缀 */
    const SOLAR_VARIANTS = ['linear', 'bold', 'broken', 'outline', 'bold-duotone', 'line-duotone']
    function toSolarIconName(name: string): string {
      const parts = name.split('-')
      const lastTwo = parts.slice(-2).join('-')
      const lastOne = parts[parts.length - 1]!
      const hasVariant = SOLAR_VARIANTS.includes(lastTwo) || SOLAR_VARIANTS.includes(lastOne)
      return `solar:${name}${hasVariant ? '' : '-linear'}`
    }

    return () => {
      const sz = px.value
      const clr = props.color

      // Solar 提供者 → @iconify/vue
      if (props.provider === 'solar') {
        return h(Icon, {
          icon: toSolarIconName(props.type),
          width: sz,
          height: sz,
          color: clr,
          class: 'icon-svg',
          'aria-hidden': true,
        })
      }

      // Lucide 图标 → 使用 lucide-vue-next 组件
      const compName = toPascal(props.type)
      const comp = (lucideIcons as Record<string, any>)[compName]
      if (comp) {
        return h(comp, {
          size: sz,
          color: clr,
          'stroke-width': 2,
          class: 'icon-svg',
          'aria-hidden': true,
        })
      }

      // 兜底 SVG
      return h('svg', {
        class: 'icon-svg',
        width: sz, height: sz, color: clr,
        viewBox: '0 0 24 24',
        fill: 'none', stroke: 'currentColor',
        'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        'aria-hidden': true,
      }, [
        h('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }),
        h('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }),
        h('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }),
        h('rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }),
      ])
    }
  },
})
</script>

<style scoped>
.icon-svg {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
