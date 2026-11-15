<script setup lang="ts">
// ⛔ 保护 — 图片，禁止：lazy loading 逻辑删除，尺寸比例，fallback 占位
//    需我确认：src fallback、aspect-ratio 默认值
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import ImagePreview from '@/components/data/ImagePreview.vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()

const props = withDefaults(
  defineProps<{
    /** 图片地址 */
    src?: string
    /** 原生 alt */
    alt?: string
    /** 图片宽度 */
    width?: number
    /** 图片高度 */
    height?: number
    /** 默认尺寸（宽高未设时，默认 80） */
    size?: number
    /** object-fit（默认 'cover'） */
    fit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down'
    /** 圆角 */
    radius?: number
    /** 圆形 */
    round?: boolean
    /** 懒加载（默认开） */
    lazy?: boolean
    /** 点击放大预览（默认开） */
    preview?: boolean
    /** 加载中文本。默认空 = 只显示占位图标、不显示文字（传了才渲染） */
    loadingText?: string
    /** 加载失败文本。默认空 = 只显示错误图标、不显示文字（同上） */
    errorText?: string
  }>(),
  {
    alt: '',
    size: 80,
    fit: 'cover',
    lazy: true,
    preview: true,
    loadingText: '',
    errorText: '',
  },
)

// 关于 loadingText / errorText 的「空串」语义（#501）：
// 曾经这两个 prop 的注释写的是「空串用内置 i18n」，与实现相反 —— 模板里是
// `v-if="loadingText"` / `v-if="errorText"`，空串 = **不显示文字**（只留图标）。
// 而且 `image` 命名空间下只有 `label` 一个键，**没有** loading/error 的文案可回退。
// 组件默认尺寸 80px（头像/缩略图），在小格子里塞一行"加载中"本身就是坏设计：
// 实现是对的，错的是注释 —— 所以这里改注释，不硬加一段回退文案。
// 行为由 `tests/unit/image-states.spec.ts` 钉住（「自定义才显示」「不传只有图标」）。

const emit = defineEmits<{
  /** 图片加载成功 */
  load: [src: string]
  /** 图片加载失败 */
  error: [src: string]
  /** 图片点击 */
  click: [src: string]
}>()

const loaded = ref(false)
const failed = ref(false)
const inView = ref(!props.lazy)
const imgRef = ref<HTMLImageElement | null>(null)
const _lightboxOpen = ref(false)

let _observer: IntersectionObserver | null = null

onMounted(() => {
  // 没有图片地址时不必观察（观察了也没有图片要加载）
  if (props.lazy && hasSrc.value && imgRef.value) {
    // 环境降级：无 IntersectionObserver（旧 Safari/WebView）时直接加载
    if (typeof IntersectionObserver !== 'undefined') {
      _observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            inView.value = true
            _observer?.disconnect()
            _observer = null
          }
        },
        { rootMargin: '200px' },
      )
      _observer.observe(imgRef.value)
    } else {
      inView.value = true
    }
  }
})

onUnmounted(() => {
  _observer?.disconnect()
})

// src 变更时重置加载/失败状态（避免换图后永远显示首字母/错误占位）
watch(
  () => props.src,
  () => {
    loaded.value = false
    failed.value = false
  },
)

/** 是否给了真实图片地址：空串/纯空白都算"没有"，此时不该发起请求 */
const hasSrc = computed(() => typeof props.src === 'string' && props.src.trim() !== '')

/** 是否处于可交互（点开预览）状态：必须已加载成功且有地址 */
const canPreview = computed(() => props.preview && loaded.value && hasSrc.value)

const _w = computed(() => (props.width || props.size) + 'px')
const _h = computed(() => (props.height || props.size) + 'px')
const _rad = computed(() => (props.round ? '50%' : (props.radius ?? 4) + 'px'))

function onLoad() {
  loaded.value = true
  emit('load', props.src || '')
}

function onError() {
  failed.value = true
  emit('error', props.src || '')
}

function onClick() {
  emit('click', props.src || '')
  // 只有"有地址且加载成功"才开灯箱；失败态开灯箱只会弹出一个同样加载不出来的空壳
  if (canPreview.value) _lightboxOpen.value = true
}
</script>

<template>
  <div
    ref="imgRef"
    class="v-image"
    :style="{ width: _w, height: _h, borderRadius: _rad }"
    :class="{ loaded, failed, clickable: canPreview }"
    :role="canPreview ? 'button' : 'img'"
    :aria-label="alt || t('image.label')"
    :tabindex="canPreview ? 0 : undefined"
    @click="onClick"
    @keydown.enter="canPreview && onClick()"
    @keydown.space="canPreview && onClick()"
  >
    <!-- 加载占位 -->
    <div v-if="!loaded && !failed" class="v-image-placeholder">
      <IconSvg type="image" size="md" />
      <span v-if="loadingText" class="v-image-text">{{ loadingText }}</span>
    </div>

    <!-- 加载失败 -->
    <div v-if="failed" class="v-image-error">
      <IconSvg type="circle-alert" size="md" />
      <span v-if="errorText" class="v-image-text">{{ errorText }}</span>
    </div>

    <!-- 真实图片（懒加载：进入视口前不绑定 src，避免提前发起请求） -->
    <!--
      没有 src 时**不渲染 <img>**：原来会渲染 `<img src="">`，浏览器把它当成
      "当前文档地址"再请求一次（等于每次渲染都多一个无效请求），而且永远等不到 load/error，
      占位符就永久挂着。失败态同样不再保留 <img>（留着只会让"到底哪张是坏的"看不出来）。
    -->
    <img
      v-if="inView && hasSrc && !failed"
      :src="src"
      :alt="alt"
      class="v-image-img"
      :class="{ invisible: !loaded }"
      :style="{ objectFit: fit, borderRadius: _rad }"
      @load="onLoad"
      @error="onError"
    />
  </div>

  <!-- 灯箱预览 -->
  <Teleport to="body">
    <ImagePreview v-if="_lightboxOpen" :src="src || ''" @close="_lightboxOpen = false" />
  </Teleport>
</template>

<style scoped>
.v-image {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--vcl-color-bg-alt);
  flex-shrink: 0;
  cursor: default;
}
.v-image.clickable {
  cursor: pointer;
}
@media (hover: hover) {
  .v-image.clickable:hover {
    opacity: 0.9;
  }
}
.v-image.clickable:focus-visible {
  outline: 2px solid var(--vcl-color-primary);
  outline-offset: 2px;
}

.v-image-img {
  width: 100%;
  height: 100%;
  display: block;
  transition: opacity var(--vcl-transition-slow);
}
.v-image-img.invisible {
  opacity: 0;
}

.v-image-placeholder,
.v-image-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--vcl-space-1);
  color: var(--vcl-color-text-muted);
}
.v-image-error {
  color: var(--vcl-color-danger-on-surface);
}
.v-image-text {
  font-size: calc(14px * var(--vcl-scale));
  line-height: var(--vcl-text-control-line);
}
</style>
