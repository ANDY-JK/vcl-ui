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
    /** 加载中文本（空串用内置 i18n） */
    loadingText?: string
    /** 加载失败文本（空串用内置 i18n） */
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
  if (props.lazy && imgRef.value) {
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
  if (props.preview && loaded.value) _lightboxOpen.value = true
}
</script>

<template>
  <div
    ref="imgRef"
    class="v-image"
    :style="{ width: _w, height: _h, borderRadius: _rad }"
    :class="{ loaded, failed, clickable: preview && loaded }"
    role="img"
    :aria-label="alt || t('image.label')"
    :tabindex="preview && loaded ? 0 : undefined"
    @click="onClick"
    @keydown.enter.prevent="onClick"
    @keydown.space.prevent="onClick"
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
    <img
      v-if="inView"
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
  background: var(--color-bg-alt);
  flex-shrink: 0;
  cursor: default;
}
.v-image.clickable {
  cursor: pointer;
}
.v-image.clickable:hover {
  opacity: 0.9;
}
.v-image.clickable:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.v-image-img {
  width: 100%;
  height: 100%;
  display: block;
  transition: opacity var(--transition-slow);
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
  gap: var(--space-1);
  color: var(--color-text-muted);
}
.v-image-error {
  color: var(--color-danger-on-surface);
}
.v-image-text {
  font-size: calc(14px * var(--vcl-scale));
}
</style>
