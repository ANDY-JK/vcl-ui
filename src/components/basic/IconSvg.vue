<script lang="ts">
// ⛔ 保护 — 图标渲染核心，使用 @lucide/vue + @iconify/vue + morphicons
import { defineComponent, computed, h, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { lucideSubset } from '@/components/_internal/lucide-subset'
import { ensureSolarIcons, isSolarReady } from '@/components/_internal/solar-icons-registry'
import {
  ensureMorphicons,
  isMorphiconsReady,
  getMorphIconComponent,
  getMorphIconNode,
} from '@/components/_internal/morphicons-registry'
import { warnOnce } from '@/components/_internal/warnOnce'
import { renderFallback, sizeClass, sizeMap, toPascal, toSolarIconName } from '@/components/_internal/icon-variants'

export default defineComponent({
  name: 'IconSvg',
  props: {
    type: { type: String, required: true },
    size: { type: String, default: 'md' },
    color: { type: String, default: 'currentColor' },
    /**
     * 图标语义层级（吸收 BoardUI 的 icon-primary…quaternary）。
     * 只给出 intents 名字，取值全在 tokens.css 的 `--vcl-icon-*` 别名里 ——
     * 主题覆盖/暗色/自定义主题都自动跟随，组件不写死任何颜色。
     * 与 `color` 的关系：传了 `color` 就用 `color`（显式优先），否则用 tone，再否则 currentColor。
     */
    tone: { type: String, default: '' },
    provider: { type: String, default: 'lucide' },
  },
  setup(props) {
    const px = computed(() => sizeMap[props.size] || 20)
    // Solar 图标数据按需加载：默认 lucide 不加载 235KB 的 solar 数据
    const solarReady = ref(isSolarReady())
    // Morphicons 组件与几何数据同样按需加载（全量 557KB / gzip 127KB），仅 provider='morphicons' 时引入
    const morphReady = ref(isMorphiconsReady())

    return () => {
      const sz = px.value
      // 显式 color 优先；否则按 tone 取 `--vcl-icon-*`（四级语义）；都没给就跟随文字色
      const clr =
        props.color !== 'currentColor' ? props.color : props.tone ? `var(--vcl-icon-${props.tone})` : 'currentColor'

      // Solar 提供者 → @iconify/vue（数据动态加载，加载完成前渲染兜底）
      if (props.provider === 'solar') {
        if (!solarReady.value) {
          // 触发异步加载，完成后重新渲染；失败只告警一次并保持兜底渲染，
          // 不标记 ready（网络恢复后下次渲染可重试），但不让 rejection 反复轰炸
          ensureSolarIcons()
            .then(() => {
              solarReady.value = true
            })
            .catch((e) => {
              warnOnce('solar-icons', '[IconSvg] solar 图标数据加载失败，渲染兜底图标: ' + String(e))
            })
          return renderFallback(sz, clr)
        }
        return h(Icon, {
          icon: toSolarIconName(props.type),
          width: sz,
          height: sz,
          color: clr,
          class: sizeClass(props.size),
          'aria-hidden': true,
        })
      }

      // Morphicons 提供者 → 形变动画（切换 type 时自动从旧图标形变到新图标）
      if (props.provider === 'morphicons') {
        // 组件与几何数据都动态加载，加载完成前渲染兜底（同 solar 策略）
        if (!morphReady.value) {
          ensureMorphicons()
            .then(() => {
              morphReady.value = true
            })
            .catch((e) => {
              warnOnce('morphicons', '[IconSvg] morphicons 加载失败，渲染兜底图标: ' + String(e))
            })
          return renderFallback(sz, clr)
        }
        const MorphIcon = getMorphIconComponent()
        const node = getMorphIconNode(props.type)
        if (MorphIcon && node) {
          // 非受控模式：icon 变化即触发形变；size/color 与静态图标保持一致的视觉口径
          return h(MorphIcon, {
            icon: node,
            size: sz,
            color: clr,
            strokeWidth: 2,
            class: sizeClass(props.size),
            'aria-hidden': true,
          })
        }
        if (import.meta.env?.DEV) {
          warnOnce('IconSvg-morphicons', `morphicons 图标未收录: ${props.type}，已渲染兜底图`)
        }
        return renderFallback(sz, clr)
      }

      // Lucide 图标 → 子集具名导入（可摇树；新图标先加进 gen-lucide-subset 的收集范围重新生成）
      const compName = toPascal(props.type)
      const comp = lucideSubset[props.type]
      if (comp) {
        return h(comp, {
          size: sz,
          color: clr,
          'stroke-width': 2,
          class: sizeClass(props.size),
          'aria-hidden': true,
        })
      }
      // 未命中：一次性告警（面板/业务传错名时可见），渲染兜底
      if (import.meta.env?.DEV) warnOnce('IconSvg', `lucide 图标未收录: ${props.type}（${compName}），已渲染兜底图`)

      // 兜底 SVG
      return renderFallback(sz, clr)
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
  /* 覆盖 width/height 属性：属性塞不进 calc()，图标会在全站等比缩放里掉队 */
  width: calc(20px * var(--vcl-scale));
  height: calc(20px * var(--vcl-scale));
}
.icon-sz-xs {
  width: calc(12px * var(--vcl-scale));
  height: calc(12px * var(--vcl-scale));
}
.icon-sz-sm {
  width: calc(16px * var(--vcl-scale));
  height: calc(16px * var(--vcl-scale));
}
.icon-sz-md {
  width: calc(20px * var(--vcl-scale));
  height: calc(20px * var(--vcl-scale));
}
.icon-sz-lg {
  width: calc(24px * var(--vcl-scale));
  height: calc(24px * var(--vcl-scale));
}
.icon-sz-xl {
  width: calc(28px * var(--vcl-scale));
  height: calc(28px * var(--vcl-scale));
}
</style>
