<script setup lang="ts">
import { ref, watch, computed, nextTick, onMounted, onUnmounted, toRef } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import Toast from '@/components/feedback/Toast.vue'
import { boostZTop } from '@/components/_internal/z-top'
import type { AnnoType } from './composables/annotation-types'
import { useImageExport } from './composables/useImageExport'
import { useImageTransform } from './composables/useImageTransform'
import { useImageAnnotation } from './composables/useImageAnnotation'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'
import { useToastNotify } from '@/components/_internal/useToastNotify'
import { useT } from '@/components/_internal/i18n'

const t = useT()
// 模板 v-for 循环变量曾遮蔽 t()，i18n 函数用 $t 别名并收窄返回 string（ComposerTranslation 不能作索引类型）
const $t = t as (key: string, params?: Record<string, unknown>) => string

// ---- 图片项 ----
export interface ImageItem {
  url: string
  label?: string
}

/** src 接受：字符串 / 对象 / 数组（任意组合），自动归一化 */
export type ImageSrc = string | ImageItem | (string | ImageItem)[]

const props = withDefaults(
  defineProps<{
    /** 图片源：字符串/对象 = 单图，数组 = 多图 */
    src?: ImageSrc
    /** 初始打开定位到第几张（越界自动收敛） */
    initialIndex?: number
    /** 预览标题（优先显示；未传时多图显示当前张 label 或「第 n 张」） */
    title?: string
  }>(),
  { initialIndex: 0 },
)

const emit = defineEmits<{
  /** 关闭预览 */
  close: []
  /** 切换图片：[当前索引] */
  change: [index: number]
}>()

// ---- 归一化：统一为 ImageItem[] ----
function toItem(raw: string | ImageItem): ImageItem {
  return typeof raw === 'string' ? { url: raw } : raw
}
const items = computed<ImageItem[]>(() => {
  if (props.src == null || props.src === '') return []
  if (Array.isArray(props.src)) return props.src.map(toItem)
  // 单个字符串或单个 ImageItem 对象
  return [toItem(props.src as string | ImageItem)]
})
const isMulti = computed(() => items.value.length > 1)
const total = computed(() => items.value.length)

const currentIndex = ref(Math.max(0, Math.min(props.initialIndex, total.value - 1)))
const currentUrl = computed(() => items.value[currentIndex.value]?.url || '')
const currentLabel = computed(() => items.value[currentIndex.value]?.label || '')
watch(
  () => props.initialIndex,
  (v) => {
    currentIndex.value = Math.max(0, Math.min(v ?? 0, total.value - 1))
  },
)

// ---- 缩略图面板 ----
const showThumbs = ref(isMulti.value)
watch(isMulti, (v) => {
  showThumbs.value = v
})
function toggleThumbs() {
  showThumbs.value = !showThumbs.value
}

// ---- 标注 + 变换/手势子系统下沉 useImageAnnotation / useImageTransform（M3 第七/八刀）----
// 标注引擎（状态/渲染/命中/工具/键盘）与变换手势已整体抽离；本文件保留接线 + 键盘回落、
// 色点自适应裁减 fitAnnoColors（顶栏布局知识，依赖 .ip-color-dot 与 annoToolsRef）。
// 标注画布模板 ref（渲染/命中/坐标换算下沉 useImageAnnotation 内部消费）
const annoCanvas = ref<HTMLCanvasElement | null>(null)

const {
  annotations,
  annoTool,
  annoColor,
  annoWidth,
  annoColors,
  annoWidths,
  setAnnoTool,
  renderAnnos,
  hitTest,
  stagePoint,
  stageCoords,
  annoStartAt,
  annoMoveAt,
  onAnnoMouseDown,
  onAnnoMouseMove,
  onAnnoMouseUp,
  onKeydown,
  resetAnnoGestures,
  isAnnoDrawing,
  isAnnoDragging,
} = useImageAnnotation(annoCanvas, {
  currentIndex,
  // 无标注态时的键盘回落：Escape 关弹层；多图时 ←→ 切图
  // （工具快捷键 R/P/C 由 composable 先处理，此处只处理「无标注工具」路径）
  onKeydownFallback: (e) => {
    if (e.key === 'Escape') {
      if (annoTool.value) {
        setAnnoTool(null)
        return
      }
      emit('close')
      return
    }
    if (isMulti.value && !annoTool.value) {
      if (e.key === 'ArrowLeft') {
        goPrev()
        return
      }
      if (e.key === 'ArrowRight') {
        goNext()
        return
      }
    }
  },
})

const {
  scale,
  dragging,
  rotation,
  flipH,
  imgTransform,
  resetTransform,
  setScale,
  rotateCW,
  rotateCCW,
  toggleFlip,
  onWheel,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onDblClick,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onTouchCancel,
} = useImageTransform(annoCanvas, {
  isMulti: () => isMulti.value,
  annoActive: () => !!annoTool.value,
  isAnnoDrawing,
  isAnnoDragging,
  startAnnoAt: annoStartAt,
  moveAnnoAt: annoMoveAt,
  endAnnoDraw: () => onAnnoMouseUp(),
  cancelAnnoGestures: resetAnnoGestures,
  stagePoint: (x, y) => stagePoint(x, y),
  stageCoords: (e) => stageCoords(e),
  hitTest: (p) => hitTest(p),
  onSwipe: (dir) => (dir === 'prev' ? goPrev() : goNext()),
})

// 预览弹层（--z-lightbox 10000）高于全局 Toast（--z-top 9999）：挂载期间临时提升 --z-top 至 10001，让内嵌 Toast 显示在弹层之上
// boostZTop 模块级引用计数（_internal/z-top.ts），多组件/多实例共享
let _releaseZTop: (() => void) | null = null
const overlayRef = ref<HTMLElement | null>(null)

// 组件常驻（v-if="currentUrl" 控制 backdrop），以「有图」作为弹层可见性驱动焦点陷阱
const _trapVisible = toRef(() => !!currentUrl.value)
const { activate: activateTrap, deactivate: deactivateTrap } = useFocusTrap({
  visible: _trapVisible,
  getContainer: () => overlayRef.value,
  autofocus: 'container',
})

// ---- 顶栏标注工具行：色点按可用空间逐步裁减（顶栏 UI 布局知识，留在宿主）----
// 单行布局下，窄屏空间不足时从最后一个色点往前逐个隐藏，保证所有控件一行放下（不换行/不横滚）。
// 选中色始终保留可见（用户当前在用的颜色不因裁减而丢失）。桌面端宽屏空间充足，全部显示。
const annoToolsRef = ref<HTMLElement | null>(null)
let _annoToolsRo: ResizeObserver | null = null
function fitAnnoColors() {
  const tools = annoToolsRef.value
  if (!tools) return
  const dots = [...tools.querySelectorAll<HTMLElement>('.ip-color-dot')]
  if (!dots.length) return
  const activeIdx = annoColors.findIndex((c) => c === annoColor.value)
  // 先全量显示（选中色恒显示），再按空间从后往前逐个隐藏。
  // 判据用 scrollWidth：色点有 min-width 下限、按钮不压缩，内容放不下时 scrollWidth 真实溢出
  dots.forEach((d) => {
    d.style.display = ''
  })
  let guard = 0
  while (tools.scrollWidth > tools.clientWidth + 1 && guard++ < dots.length) {
    let hide = -1
    for (let i = dots.length - 1; i >= 0; i--) {
      if (i !== activeIdx && dots[i].style.display !== 'none') {
        hide = i
        break
      }
    }
    if (hide < 0) break
    dots[hide].style.display = 'none'
  }
}
// 换色后重算：新选中色若是被裁减隐藏的色点，需要显示出来（当前使用中的颜色不能丢失）
watch(annoColor, () => fitAnnoColors())

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && annoToolsRef.value) {
    _annoToolsRo = new ResizeObserver(() => fitAnnoColors())
    _annoToolsRo.observe(annoToolsRef.value)
  }
  _releaseZTop = boostZTop()
  // 挂载即聚焦弹层，保证 Esc 立即可用（此前焦点在触发按钮，键盘关闭失效）
  nextTick(() => overlayRef.value?.focus())
  // Tab 循环在弹层内：全屏 dialog 的 Tab 落到被遮住的背景页面对键盘用户是"焦点消失"
  activateTrap()
})
onUnmounted(() => {
  _annoToolsRo?.disconnect()
  deactivateTrap()
  _releaseZTop?.()
})

function goTo(idx: number) {
  if (idx < 0 || idx >= total.value || idx === currentIndex.value) return
  currentIndex.value = idx
  emit('change', idx)
  resetTransform()
  _loadState.value = 'loading'
}
function goPrev() {
  goTo(currentIndex.value - 1)
}
function goNext() {
  goTo(currentIndex.value + 1)
}

// ---- 键盘：onKeydown 由 useImageAnnotation 提供（标注操作优先，无标注态回落 onKeydownFallback）----

// ---- 加载状态 ----
type LoadState = 'loading' | 'loaded' | 'error'
const _loadState = ref<LoadState>('loading')
watch(currentUrl, () => {
  _loadState.value = 'loading'
})
function onImgLoad() {
  _loadState.value = 'loaded'
  nextTick(renderAnnos)
}
function onImgError() {
  _loadState.value = 'error'
}

// ---- 导出：合成（原图 + 标注）→ 下载 / 复制 ----
const imgEl = ref<HTMLImageElement | null>(null)
// 操作反馈走 Toast 通知（右下角弹窗），不用工具栏小字（复用共享 notify）
const { toastRef, notify } = useToastNotify()

// ---- 导出为 PNG（管道下沉 useImageExport；本文件只保留接线）----
// displayTitle / _loadState 声明在本接线之后，但 downloadImage/copyImage 只在用户点按时
// 才执行（届时已初始化），运行时读取安全。
const { downloadImage, copyImage } = useImageExport({
  imgEl,
  annoCanvas,
  annotations,
  isLoaded: () => _loadState.value === 'loaded',
  title: () => displayTitle.value,
  t: $t,
  notify,
})

// ---- 标题 ----
const displayTitle = computed(() => {
  if (props.title) return props.title
  if (isMulti.value) return currentLabel.value || $t('imagePreview.imageLabel', { n: currentIndex.value + 1 })
  return currentLabel.value || ''
})
</script>

<template>
  <div v-if="currentUrl" class="ip-backdrop" @click.self="emit('close')">
    <Toast ref="toastRef" variant="toast" position="bottom-right" />
    <div
      ref="overlayRef"
      class="ip-overlay"
      role="dialog"
      aria-modal="true"
      tabindex="0"
      @keydown="onKeydown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
    >
      <!-- 顶部栏 -->
      <div class="ip-header">
        <span class="ip-title" :title="displayTitle">{{ displayTitle }}</span>
        <!-- 标注工具：矩形 / 圆形 / 画笔 / 颜色 / 粗细（单行；颜色数量按可用空间逐步裁减，窄屏先隐藏后面的色点） -->
        <div ref="annoToolsRef" class="ip-anno-tools">
          <button
            v-for="tool in ['rect', 'circle', 'pen'] as AnnoType[]"
            :key="tool"
            class="ip-hdr-btn"
            :class="{ active: annoTool === tool }"
            :title="
              {
                rect: $t('imagePreview.annoRect'),
                pen: $t('imagePreview.annoPen'),
                circle: $t('imagePreview.annoCircle'),
              }[tool]
            "
            @click="setAnnoTool(tool)"
          >
            <IconSvg :type="{ rect: 'square', pen: 'pen-tool', circle: 'circle' }[tool]" size="sm" />
          </button>
          <span class="ip-toolbar-sep" />
          <button
            v-for="c in annoColors"
            :key="c"
            class="ip-color-dot"
            :class="{ active: annoColor === c }"
            :style="{ background: c }"
            :title="c"
            @click="annoColor = c"
          />
          <span class="ip-toolbar-sep" />
          <button
            v-for="w in annoWidths"
            :key="w"
            class="ip-hdr-btn ip-w-btn"
            :class="{ active: annoWidth === w }"
            :title="$t('imagePreview.lineWidth', { w })"
            @click="annoWidth = w"
          >
            <span :style="{ width: w * 2 + 'px', height: w * 2 + 'px', borderRadius: '50%', background: annoColor }" />
          </button>
        </div>
        <div class="ip-header-right">
          <span v-if="isMulti" class="ip-counter-header">{{ currentIndex + 1 }} / {{ total }}</span>
          <button
            v-if="isMulti"
            class="ip-hdr-btn"
            :class="{ active: showThumbs }"
            :title="$t('imagePreview.thumbs')"
            @click="toggleThumbs"
          >
            <IconSvg type="panel-right" size="sm" />
          </button>
          <button class="ip-close" :title="$t('imagePreview.close')" @click="emit('close')">
            <IconSvg type="x" size="sm" />
          </button>
        </div>
      </div>

      <!-- 主体：主视图 + 缩略图 -->
      <div class="ip-body">
        <!-- 主视图 -->
        <div class="ip-main">
          <div
            class="ip-stage"
            :style="{ cursor: annoTool ? 'crosshair' : undefined }"
            @wheel="onWheel"
            @mousedown="onAnnoMouseDown"
            @mousemove="onAnnoMouseMove"
            @mouseup="onAnnoMouseUp"
            @touchstart.passive="onTouchStart"
            @touchmove.prevent="onTouchMove"
            @touchend.passive="onTouchEnd"
            @touchcancel.passive="onTouchCancel"
          >
            <!-- 加载态 -->
            <div v-if="_loadState === 'loading'" class="ip-spinner" />
            <div v-else-if="_loadState === 'error'" class="ip-error">⚠ {{ $t('imagePreview.loadFailed') }}</div>

            <!-- 图片 -->
            <img
              ref="imgEl"
              :src="currentUrl"
              class="ip-img"
              :class="{ invisible: _loadState !== 'loaded' }"
              :style="{
                transform: imgTransform,
                cursor: scale > 1 || rotation !== 0 ? (dragging ? 'grabbing' : 'grab') : 'default',
              }"
              draggable="false"
              @load="onImgLoad"
              @error="onImgError"
              @mousedown.prevent="onMouseDown"
              @dblclick.prevent="onDblClick"
              @dragstart.prevent
            />

            <!-- 标注画布 -->
            <canvas ref="annoCanvas" class="ip-anno-canvas" />
            <template v-if="isMulti">
              <button
                class="ip-arrow ip-arrow-left"
                :disabled="currentIndex <= 0"
                :title="$t('imagePreview.prev')"
                @click.stop="goPrev"
              >
                <IconSvg type="chevron-left" size="md" />
              </button>
              <button
                class="ip-arrow ip-arrow-right"
                :disabled="currentIndex >= total - 1"
                :title="$t('imagePreview.next')"
                @click.stop="goNext"
              >
                <IconSvg type="chevron-right" size="md" />
              </button>
            </template>
          </div>

          <!-- 底部工具栏 -->
          <div class="ip-toolbar">
            <!-- 旋转 + 翻转 -->
            <button :title="$t('imagePreview.rotateCCW')" @click.stop="rotateCCW">
              <IconSvg type="rotate-ccw" size="sm" />
            </button>
            <button :title="$t('imagePreview.rotateCW')" @click.stop="rotateCW">
              <IconSvg type="rotate-cw" size="sm" />
            </button>
            <button :class="{ active: flipH }" :title="$t('imagePreview.flipH')" @click.stop="toggleFlip">
              <IconSvg type="arrow-left-right" size="sm" />
            </button>
            <span class="ip-toolbar-sep" />
            <!-- 缩放 -->
            <button :title="$t('imagePreview.zoomIn')" @click.stop="setScale(scale + 0.25)">
              <IconSvg type="zoom-in" size="sm" />
            </button>
            <button :title="$t('imagePreview.zoomOut')" @click.stop="setScale(scale - 0.25)">
              <IconSvg type="zoom-out" size="sm" />
            </button>
            <button :title="$t('imagePreview.zoomActual')" @click.stop="setScale(1)">
              <IconSvg type="maximize" size="sm" />
            </button>
            <span class="ip-toolbar-sep" />
            <!-- 导出：下载 / 复制（合成图包含标注） -->
            <button :title="$t('imagePreview.download')" @click.stop="downloadImage">
              <IconSvg type="download" size="sm" />
            </button>
            <button :title="$t('imagePreview.copy')" @click.stop="copyImage">
              <IconSvg type="copy" size="sm" />
            </button>
            <span v-if="isMulti" class="ip-counter">{{ currentIndex + 1 }} / {{ total }}</span>
            <!-- @slot actions: 预览顶部工具栏右端追加的操作按钮 -->
            <slot name="actions" />
          </div>
        </div>

        <!-- 缩略图面板：button 承载（键盘可聚焦/回车切换，纯 div 点击键盘不可达） -->
        <div v-if="isMulti && showThumbs" class="ip-thumbs" role="tablist" :aria-label="t('imagePreview.thumbs')">
          <button
            v-for="(item, i) in items"
            :key="i"
            type="button"
            class="ip-thumb"
            :class="{ active: i === currentIndex }"
            role="tab"
            :aria-selected="i === currentIndex"
            @click="goTo(i)"
          >
            <!-- 缩略图条是整批原图直挂（主图另有一张大图），不懒加载会一次拉完整册 -->
            <img
              :src="item.url"
              :alt="item.label || $t('imagePreview.imageLabel', { n: i + 1 })"
              loading="lazy"
              decoding="async"
            />
            <span class="ip-thumb-label" :title="item.label || $t('imagePreview.imageLabel', { n: i + 1 })">{{
              item.label || $t('imagePreview.imageLabel', { n: i + 1 })
            }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== 遮罩层（全屏半透明，点击关闭） ===== */
.ip-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-lightbox, 10000);
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(var(--space-1));
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ===== 浮动面板（按视口比例居中） ===== */
.ip-overlay {
  width: clamp(360px, 92vw, 1400px);
  height: clamp(280px, 90vh, 95vh);
  display: flex;
  flex-direction: column;
  background: rgba(20, 20, 22, 0.96);
  border-radius: clamp(var(--radius-md), 1.2vw, 14px);
  overflow: hidden;
  box-shadow:
    0 var(--space-2) clamp(28px, 5vw, 40px) rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.08);
  outline: none;
}

/* ===== 顶部栏 ===== */
.ip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--ctrl-height);
  padding: 0 var(--space-3) 0 var(--space-4);
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.ip-title {
  font-size: var(--ctrl-font-size);
  color: rgba(255, 255, 255, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.ip-header-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}
.ip-counter-header {
  font-size: var(--ctrl-font-size);
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
}
.ip-hdr-btn {
  width: clamp(28px, 4vw, 36px);
  height: var(--ctrl-height);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: clamp(16px, 2vw, 22px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}
.ip-hdr-btn:hover,
.ip-hdr-btn.active {
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
}
.ip-close {
  width: clamp(28px, 4vw, 36px);
  height: var(--ctrl-height);
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: clamp(16px, 2vw, 22px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition-fast);
}
.ip-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* ===== 主体 ===== */
.ip-body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.ip-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* ===== 图片限定区域 ===== */
.ip-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  /* 手势交由组件处理：阻止浏览器原生滚动/双指缩放 */
  touch-action: none;
}
.ip-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
}
.ip-img.invisible {
  opacity: 0;
  position: absolute;
  pointer-events: none;
}
/* 标注画布（覆盖在图片上方，透明背景） */
.ip-anno-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}
.ip-w-btn {
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 标注工具栏 */
.ip-anno-tools {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.ip-color-dot {
  width: clamp(14px, 2vw, 18px);
  height: clamp(14px, 2vw, 18px);
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition:
    transform var(--transition-fast),
    border-color var(--transition-fast);
  flex-shrink: 0;
}
.ip-color-dot:hover {
  transform: scale(1.2);
}
.ip-color-dot.active {
  border-color: #fff;
  transform: scale(1.15);
}
.ip-spinner {
  width: clamp(32px, 5vw, 40px);
  height: clamp(32px, 5vw, 40px);
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: #fff;
  border-radius: 50%;
  animation: ip-spin 0.8s linear infinite;
}
@keyframes ip-spin {
  to {
    transform: rotate(360deg);
  }
}
.ip-error {
  color: rgba(255, 255, 255, 0.5);
  font-size: var(--ctrl-font-size);
}

/* 左右箭头 */
.ip-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: clamp(32px, 5vw, 44px);
  height: clamp(32px, 5vw, 44px);
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: clamp(18px, 3vw, 26px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background var(--transition-normal),
    opacity var(--transition-normal);
  opacity: 0;
  z-index: 1;
}
.ip-stage:hover .ip-arrow {
  opacity: 1;
}
.ip-arrow:hover {
  background: rgba(255, 255, 255, 0.25);
}
.ip-arrow:disabled {
  opacity: 0.15;
  cursor: default;
}
.ip-arrow-left {
  left: var(--space-3);
}
.ip-arrow-right {
  right: var(--space-3);
}

/* ===== 缩略图面板 ===== */
.ip-thumbs {
  width: clamp(80px, 10vw, 110px);
  flex-shrink: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--space-2) var(--space-1);
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
}
.ip-thumbs::-webkit-scrollbar {
  width: var(--space-1);
}
.ip-thumbs::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-sm);
}
.ip-thumb {
  /* button 重置（div → button 后消除 UA 默认样式） */
  padding: 0;
  background: none;
  font: inherit;
  color: inherit;
  width: clamp(72px, 8vw, 98px);
  flex-shrink: 0;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    opacity var(--transition-fast);
  opacity: 0.55;
  display: flex;
  flex-direction: column;
}
.ip-thumb:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
  opacity: 1;
}
.ip-thumb:hover {
  opacity: 0.85;
  border-color: rgba(255, 255, 255, 0.3);
}
.ip-thumb.active {
  opacity: 1;
  border-color: #fff;
}
.ip-thumb img {
  width: 100%;
  height: clamp(48px, 6vw, 62px);
  object-fit: cover;
  display: block;
  flex-shrink: 0;
}
.ip-thumb-label {
  font-size: clamp(10px, 1.4vw, 13px);
  color: rgba(255, 255, 255, 0.55);
  padding: var(--space-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  line-height: 1.3;
}
.ip-thumb.active .ip-thumb-label {
  color: rgba(255, 255, 255, 0.85);
}

/* ===== 底部工具栏 ===== */
.ip-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: clamp(44px, 7vw, 56px);
  padding: 0 var(--space-4);
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.04);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.ip-toolbar > button {
  width: clamp(28px, 4vw, 36px);
  height: var(--ctrl-height);
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: clamp(13px, 2vw, 15px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition-fast);
}
.ip-toolbar > button:hover {
  background: rgba(255, 255, 255, 0.25);
}
.ip-toolbar > button.active {
  background: rgba(255, 255, 255, 0.3);
}
.ip-toolbar-sep {
  width: 1px;
  height: clamp(16px, 3vw, 20px);
  background: rgba(255, 255, 255, 0.15);
  margin: 0 var(--space-1);
}
.ip-counter {
  color: rgba(255, 255, 255, 0.45);
  font-size: var(--ctrl-font-size);
  margin: 0 var(--space-2);
}

/* ===== 移动端适配（窄视口） ===== */
@media (max-width: 640px) {
  /* 弹层收窄、降低高度，避免顶天立地 */
  .ip-overlay {
    width: calc(100vw - var(--space-4));
    height: 80vh;
    border-radius: var(--radius-lg);
  }
  /* 顶栏单行：标题（封顶，让位给工具行）+ 工具（flex:1 拿剩余空间，色点按空间自适应裁减）+ 缩略图/关闭 */
  .ip-header {
    height: clamp(38px, 6vw, 44px);
    padding: 0 var(--space-2) 0 var(--space-3);
  }
  .ip-title {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 15vw;
  }
  .ip-header-right {
    flex-shrink: 1;
    min-width: 0;
  }
  /* 顶栏计数与底部工具栏重复，移动端隐藏省空间 */
  .ip-counter-header {
    display: none;
  }
  /* 工具行不换行不横滚：拿到剩余宽度，空间不足时由 fitAnnoColors 逐步裁减色点数量 */
  .ip-anno-tools {
    flex: 1 1 auto;
    min-width: 0;
    gap: var(--space-1);
    overflow: visible;
    justify-content: center;
  }
  .ip-anno-tools .ip-toolbar-sep {
    margin: 0 var(--space-1);
    flex-shrink: 0;
  }
  /* 工具/线宽按钮固定不压缩（保证可点尺寸）；色点可压缩但最小 14px，压缩到底仍放不下才由 fitAnnoColors 裁减 */
  .ip-anno-tools .ip-hdr-btn {
    width: clamp(24px, 4vw, 26px);
    height: clamp(24px, 4vw, 26px);
    flex-shrink: 0;
  }
  .ip-header-right .ip-hdr-btn {
    width: clamp(28px, 5vw, 30px);
    height: clamp(28px, 5vw, 30px);
    flex-shrink: 0;
  }
  .ip-close {
    width: clamp(32px, 5vw, 40px);
    height: clamp(32px, 5vw, 40px);
    flex-shrink: 0;
  }
  .ip-color-dot {
    width: clamp(14px, 2.5vw, 16px);
    height: clamp(14px, 2.5vw, 16px);
    min-width: clamp(12px, 2vw, 14px);
    flex-shrink: 1;
  }
  .ip-toolbar {
    height: var(--ctrl-height);
    padding: 0 var(--space-2);
  }
  .ip-toolbar > button {
    width: clamp(32px, 5vw, 40px);
    height: clamp(32px, 5vw, 40px);
  }
  /* 左右箭头移动端无 hover，改为常显 */
  .ip-arrow {
    opacity: 0.8;
    width: clamp(32px, 5vw, 40px);
    height: clamp(32px, 5vw, 40px);
  }
  /* 缩略图面板改为底部横排（文档流内），不挤占主图宽度也不遮挡主图 */
  .ip-body {
    flex-direction: column;
  }
  .ip-main {
    min-height: 0;
  }
  .ip-thumbs {
    position: static;
    width: auto;
    height: clamp(64px, 12vw, 86px);
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    background: rgba(0, 0, 0, 0.55);
    padding: var(--space-2);
    gap: var(--space-2);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .ip-thumb {
    width: clamp(64px, 8vw, 84px);
  }
  .ip-thumb img {
    height: clamp(44px, 6vw, 56px);
  }
  .ip-thumb-label {
    padding: var(--space-1);
  }
}
</style>
