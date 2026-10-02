<script setup lang="ts">
import { reportError } from '@/components/_internal/runtime-observer'
// ⛔ 保护 — 文件上传，禁止：clamp() → px，拖拽区尺寸比例，进度条动画
//    需我确认：accept 文件类型、multiple 多文件逻辑、预览图尺寸
import { ref, watch, computed, onUnmounted, onErrorCaptured } from 'vue'
import { formatSize } from '@/components/_internal/utils'
import { useT } from '@/components/_internal/i18n'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'

const t = useT()
const _error = ref<Error | null>(null)
onErrorCaptured((e: Error) => {
  reportError('[Upload] 内部异常已隔离:', e.message)
  _error.value = e
  return false
})
import IconSvg from '@/components/basic/IconSvg.vue'
import ProgressBar from '@/components/data/ProgressBar.vue'
import CameraCapture from '@/components/form/CameraCapture.vue'
import { openSystemCapture, cancelPendingSystemCapture } from '@/components/form/utils/capture-fallback'
import { useUploadQueue } from './utils/useUploadQueue'
import ImagePreview from '@/components/data/ImagePreview.vue'

/** 卡片单击的判定窗口：等到这时还没第二击才按「单击预览」处理（双击是选文件） */
const _CARD_CLICK_DECIDE_MS = 280

export interface UploadFile {
  id: number
  name: string
  size: number
  progress: number
  status: 'uploading' | 'done' | 'error'
  url?: string
  /** 原始文件（Blob）：供调用方直接持久化，避免重新异步转码丢数据 */
  raw?: Blob
}

interface Props {
  /** 接受的文件类型：默认图片；传空字符串 = 全部类型（含目录里的文件） */
  accept?: string
  /** 多文件 */
  multiple?: boolean
  /** 单文件大小上限（MB，默认 10） */
  maxSize?: number // MB
  /** 单文件大小下限（KB） */
  minSize?: number // KB
  /** 禁用 */
  disabled?: boolean
  /** 拖拽上传（默认开） */
  drag?: boolean
  /** 受控文件列表（v-model:modelValue，UploadFile[]） */
  modelValue?: UploadFile[]
  /** 自定义上传：替代内置请求，返回 { url }；失败时 reject 走 error 事件 */
  customRequest?: (file: File) => Promise<{ url: string }>
  /** 'default' 标准上传区 | 'card' 紧凑方块卡片 */
  variant?: 'default' | 'card'
  /** card 模式下的显示标签 */
  label?: string
  /** 目录选择模式（webkitdirectory）：选择整个文件夹上传（隐式多文件），仍按 accept 校验每个文件 */
  directory?: boolean
  /** 触屏设备点击弹「拍照/相册/文件」菜单（安卓系统选择器无相机入口，以此补齐拍照能力）；桌面不受影响 */
  mobileMenu?: boolean
  /** 图片压缩：开启后图片文件会经过 canvas 压缩再上传（移动端尤其需要） */
  compress?: boolean
  /** 图片压缩最大宽度（px），超过时等比缩小；默认 1920 */
  maxWidth?: number
  /** 图片压缩质量 0-1；默认 0.85 */
  compressQuality?: number
  /** 同时在飞的文件数（压缩+上传）。默认 3：按浏览器同源约 6 条连接取半，
   *  给页面其它请求留通道；服务端有并发/限流策略时按更严的那个设 */
  maxConcurrent?: number
  /** 图片预览：'builtin' 点击图片直接打开内置全屏预览（默认）；'event' 仅抛 preview 事件由消费方自行处理 */
  previewMode?: 'builtin' | 'event'
}

const props = withDefaults(defineProps<Props>(), {
  accept: 'image/*',
  multiple: false,
  maxSize: 10,
  disabled: false,
  drag: true,
  modelValue: () => [],
  customRequest: undefined,
  variant: 'default',
  label: '',
  directory: false,
  mobileMenu: false,
  compress: false,
  maxWidth: 1920,
  compressQuality: 0.85,
  previewMode: 'builtin',
})

// 入参变化 = 内容已变：清错误态让上传区重渲染一次，否则 ⚠ 降级提示会永久卡死（仍坏会再次捕获，不成环）
watch(
  () => ({ ...props }),
  () => (_error.value = null),
)

const emit = defineEmits<{
  /** 文件列表变化（新增/删除/状态流转后抛全量） */
  change: [files: UploadFile[]]
  /** 移除单个文件 */
  remove: [file: UploadFile]
  /** 校验/上传失败提示文案 */
  error: [message: string]
  /** v-model——受控文件列表 */
  'update:modelValue': [files: UploadFile[]]
  /** card 模式：点击图片预览 */
  preview: [url: string]
}>()

const dragging = ref(false)

// 文件队列引擎（拆分至 utils/useUploadQueue.ts）：队列状态/模型同步/校验/压缩/上传/删除/重试
const { files, clearAllFiles, processFiles, removeFile, retryFile, isMimeAccepted } = useUploadQueue({ props, emit })

function onDragOver(e: DragEvent) {
  e.preventDefault()
  if (props.drag && !props.disabled) dragging.value = true
}
function onDragLeave() {
  dragging.value = false
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  dragging.value = false
  if (!props.disabled) processFiles(e.dataTransfer?.files || null)
}

function onInputChange(e: Event) {
  processFiles((e.target as HTMLInputElement).files)
}

function onPaste(e: ClipboardEvent) {
  if (props.disabled) return
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  const items = e.clipboardData?.items
  if (!items) return
  const pasted: File[] = []
  for (let i = 0; i < items.length; i++) {
    const f = items[i].getAsFile()
    if (!f) continue
    // accept 白名单校验：仅允许匹配 accept 的文件类型，防止恶意 SVG/HTML 粘贴
    if (props.accept && !isMimeAccepted(f, props.accept)) continue
    pasted.push(f)
  }
  if (pasted.length) processFiles(pasted)
}

const fileInputRef = ref<HTMLInputElement | null>(null)
function triggerFileInput() {
  fileInputRef.value?.click()
}

// ===== 移动端「拍照/相册/文件」菜单 =====
// 安卓系统选择器（Photo Picker / DocumentsUI）没有相机入口，触屏设备上点击弹自绘菜单补齐
const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
const sheetOpen = ref(false)
/** 底部菜单容器（Teleport 到 body 的 sheet 内），供焦点陷阱限定范围 */
const upSheetRef = ref<HTMLElement | null>(null)
// P2-5：底部菜单焦点陷阱 —— 打开时焦点移入选项，Tab 循环不逃逸，关闭恢复
useFocusTrap({
  visible: sheetOpen,
  getContainer: () => upSheetRef.value,
  autofocus: 'container',
})

/** 弹菜单还是直接选文件：仅移动端启用 mobileMenu 时弹菜单，桌面直接打开系统选择器 */
function handlePick() {
  if (props.disabled) return
  if (props.mobileMenu && isTouchDevice) sheetOpen.value = true
  else triggerFileInput()
}

/** 拍照/相册/浏览：走系统选择器（共用采集兜底引擎的临时 input）。
 *  拍照（capture）直开系统相机——安卓部分版本文件选择器没有「拍摄」入口，capture 是这些机型唯一拍照途径。
 *  相机不可用 / 用户取消时由 CameraCapture 兜底链（系统相机 → 上传面板）接管。 */
async function pickFrom(kind: 'camera' | 'gallery' | 'browse') {
  sheetOpen.value = false
  if (props.disabled) return
  // 浏览 = 全类型文件浏览器（对齐 iOS 原生「浏览」）；拍照/相册 = 原 accept（默认图片）
  const accept = kind === 'browse' ? '' : props.accept || 'image/*'
  const files = await openSystemCapture({
    accept,
    // 拍照：后置相机直出；相册/浏览：不带 capture，让系统弹自己的选择器
    capture: kind === 'camera' ? 'environment' : false,
    multiple: props.multiple,
  })
  if (!files.length) return
  processFiles(files)
}

// ===== 页面内拍照：调起 CameraCapture 组件（原生相机布局） =====
// 真机 <input capture> 调起系统相机时，页面切到后台，Android/Edge 可能杀进程，
// 返回即整页重建（白屏刷新）。改用 CameraCapture 页面内取景拍照，全程不离开页面，无刷新。
// 相机不可用（无摄像头 / 权限拒绝 / 非 HTTPS）时由组件内置兜底链接管：
// 页面内 → 系统相机 → 上传面板，照片仍经 capture 事件交付，这里只需转发提示。
const cameraOpen = ref(false)

function openCamera() {
  if (props.disabled) return
  sheetOpen.value = false
  cameraOpen.value = true
}

/** 组件拍照成功（页面内拍照或降级系统相机）→ 走正常上传链路（与相册/浏览一致） */
function onCameraCapture(file: File) {
  processFiles([file])
}

/** 连拍模式按「完成」：队列照片批量走上传链路（降级系统相机时仍逐张走 capture） */
function onCameraBatchFinish(batch: File[]) {
  if (!batch.length) return
  processFiles(batch)
}

/** 相机不可用提示（组件已自动降级系统相机，仅提示用户） */
function onCameraError(msg: string) {
  emit('error', msg)
}

/** default 变体：透明 input 覆盖上传区，触屏+mobileMenu 时拦截点击改弹菜单 */
function onDefaultInputClick(e: MouseEvent) {
  if (props.mobileMenu && isTouchDevice && !props.disabled) {
    e.preventDefault()
    handlePick()
  }
}

// card 模式：当前预览索引 + 多张翻页
const cardIdx = ref(0)
watch(
  () => files.value.length,
  () => {
    cardIdx.value = 0
  },
)
const cardPreviewUrl = computed(() => {
  if (props.variant !== 'card') return ''
  const f = files.value[cardIdx.value]
  if (!f || !f.url) return ''
  return f.url
})
const cardFileCount = computed(() => files.value.length)
const cardHovered = ref(false)

// ===== 内置图片预览（复用库内 ImagePreview；'event' 模式不接管，仅抛事件） =====
const _previewItems = ref<{ url: string; label?: string }[]>([])
const _previewIdx = ref(0)
/** 可预览的图片文件（有 url 的） */
const _imageFiles = computed(() => files.value.filter((f) => f.url))
function openPreview(file: UploadFile) {
  const idx = _imageFiles.value.findIndex((f) => f.id === file.id)
  if (idx < 0) return
  if (props.previewMode === 'builtin') {
    _previewItems.value = _imageFiles.value.map((f) => ({ url: f.url!, label: f.name }))
    _previewIdx.value = idx
  }
  emit('preview', file.url!)
}
function closePreview() {
  _previewItems.value = []
}

let _clickTimer: ReturnType<typeof setTimeout> | null = null
function onCardClick() {
  if (_clickTimer) {
    clearTimeout(_clickTimer)
    _clickTimer = null
    return
  }
  _clickTimer = setTimeout(() => {
    _clickTimer = null
    const f = files.value[cardIdx.value]
    if (f?.url) openPreview(f)
    else handlePick()
  }, _CARD_CLICK_DECIDE_MS)
}
function onCardDblClick() {
  if (_clickTimer) {
    clearTimeout(_clickTimer)
    _clickTimer = null
  }
  handlePick()
}
function cardPrev(e: Event) {
  e.stopPropagation()
  if (cardFileCount.value > 1) cardIdx.value = (cardIdx.value - 1 + cardFileCount.value) % cardFileCount.value
}
function cardNext(e: Event) {
  e.stopPropagation()
  if (cardFileCount.value > 1) cardIdx.value = (cardIdx.value + 1) % cardFileCount.value
}

/** 程序化控制文件输入 */
defineExpose({
  /** 重试上次失败的上传 */
  retryFile,
  /** 手动触发文件选择对话框 */
  triggerFileInput,
})

onUnmounted(() => {
  // 系统采集仍挂着（旧内核无 cancel 事件）时强制按「取消」收尾，避免 Promise 永挂
  cancelPendingSystemCapture()
  // 清理所有未释放的 Blob URL（模拟上传定时器由 useUploadQueue 自行清理）
  files.value.forEach((f) => {
    if (f.url?.startsWith('blob:')) URL.revokeObjectURL(f.url)
  })
})
</script>

<template>
  <div
    v-if="_error"
    class="card-wrap"
    style="
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--vcl-color-danger-on-surface);
      font-size: calc(11px * var(--vcl-scale));
    "
  >
    ⚠ {{ t('form.uploadError') }}
  </div>
  <!-- ===== card 变体：精确对标旧项目 dropZone 结构 ===== -->
  <div
    v-else-if="variant === 'card'"
    class="card-wrap"
    :class="{ 'card-dragging': dragging, 'card-disabled': disabled }"
    role="button"
    :tabindex="disabled ? -1 : 0"
    :aria-label="label || t('form.upload')"
    :aria-disabled="disabled ? 'true' : 'false'"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @mouseenter="cardHovered = true"
    @mouseleave="cardHovered = false"
    @paste="onPaste"
    @keydown.enter.prevent="handlePick"
    @keydown.space.prevent="handlePick"
  >
    <!-- 内容容器 -->
    <div class="card-content">
      <!-- ① 标签：无图时居中展示；有预览图后隐藏（图片撑满卡片，文字压图显脏） -->
      <p v-if="label && !cardPreviewUrl" class="card-label">
        {{ label }}
      </p>

      <!-- ② 预览图：有文件时显示；点图直接全屏预览（点中央小区域才是选文件，避免语义混淆） -->
      <img
        v-if="cardPreviewUrl"
        :src="cardPreviewUrl"
        class="card-img"
        loading="lazy"
        decoding="async"
        :alt="t('form.previewImage')"
        style="cursor: zoom-in"
        @click.stop="openPreview(files[cardIdx]!)"
      />

      <!-- ③ 多张标志：翻页按钮 + 计数 -->
      <template v-if="cardFileCount > 1">
        <button class="card-arrow card-arrow-left" :aria-label="t('form.prevPhoto')" @click="cardPrev">
          <IconSvg type="chevron-left" size="xs" />
        </button>
        <button class="card-arrow card-arrow-right" :aria-label="t('form.nextPhoto')" @click="cardNext">
          <IconSvg type="chevron-right" size="xs" />
        </button>
        <span class="card-count">{{ cardIdx + 1 }}/{{ cardFileCount }}</span>
      </template>

      <!-- ④ 点击区：接收点击/双击 -->
      <div class="card-click-area" @click.stop="onCardClick" @dblclick.stop="onCardDblClick" />

      <!-- ⑤ 删除按钮：hover 时显示；触屏无 hover → 常显，否则移动端无法删除 -->
      <button
        v-if="files.length && (cardHovered || isTouchDevice) && !disabled"
        type="button"
        class="card-clear"
        @click.stop="clearAllFiles"
      >
        {{ t('form.delete') }}
      </button>
    </div>
    <!-- 隐藏的 file input（对标旧项目） -->
    <input
      ref="fileInputRef"
      type="file"
      style="display: none"
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled"
      :webkitdirectory="directory ? '' : undefined"
      @change="onInputChange"
    />
  </div>

  <!-- ===== default 变体：标准上传区 ===== -->
  <div v-else class="upload-wrap" @paste="onPaste">
    <!-- @slot trigger: 上传触发区（作用域：open-file-dialog 手动选择文件入口） -->
    <slot name="trigger" :open-file-dialog="triggerFileInput">
      <div
        class="upload-area"
        :class="{ dragging, disabled }"
        role="button"
        :tabindex="disabled ? -1 : 0"
        :aria-label="t('form.upload')"
        :aria-disabled="disabled ? 'true' : 'false'"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
        @keydown.enter.prevent="handlePick"
        @keydown.space.prevent="handlePick"
      >
        <input
          ref="fileInputRef"
          type="file"
          class="upload-input"
          :accept="accept"
          :multiple="multiple"
          :disabled="disabled"
          :webkitdirectory="directory ? '' : undefined"
          tabindex="-1"
          aria-hidden="true"
          @change="onInputChange"
          @click="onDefaultInputClick"
        />
        <IconSvg type="upload" size="lg" color="var(--vcl-color-text-muted)" />
        <p class="upload-hint">
          <template v-if="dragging">{{ t('form.dropHint') }}</template>
          <template v-else
            >{{ t('form.dragHint') }}<span class="upload-link">{{ t('form.clickUpload') }}</span></template
          >
        </p>
        <p v-if="maxSize" class="upload-limit">{{ t('form.uploadLimit', { max: maxSize }) }}</p>
      </div>
    </slot>

    <div v-if="files.length" class="upload-list">
      <!-- @slot file-item: 单个文件项的自定义渲染（作用域：key、file、index） -->
      <slot v-for="(f, idx) in files" :key="f.id" name="file-item" :file="f" :index="idx">
        <div class="upload-item">
          <!-- 图片文件：缩略图可点击进内置预览；非图片保持通用文件图标 -->
          <button
            v-if="f.url"
            type="button"
            class="upload-thumb"
            :aria-label="t('form.previewImage')"
            @click="openPreview(f)"
          >
            <img :src="f.url" alt="" loading="lazy" decoding="async" />
          </button>
          <IconSvg v-else type="file" size="md" class="upload-file-icon" />
          <div class="upload-file-info">
            <div class="upload-file-name" :title="f.name">
              {{ f.name }}
            </div>
            <div class="upload-file-meta">
              <span>{{ formatSize(f.size) }}</span>
              <span v-if="f.status === 'done'" style="color: var(--vcl-color-success)"
                >✓ {{ t('form.uploadSuccess') }}</span
              >
              <span v-else-if="f.status === 'error'" style="color: var(--vcl-color-danger-on-surface)"
                >✗ {{ t('form.uploadFailed') }}</span
              >
            </div>
            <ProgressBar
              v-if="f.status === 'uploading'"
              :percent="f.progress"
              :show-text="false"
              :height="4"
              style="margin-top: var(--vcl-space-1)"
            />
          </div>
          <button type="button" class="upload-remove" :aria-label="t('form.removeFile')" @click="removeFile(f)">
            <IconSvg type="x" size="sm" />
          </button>
        </div>
      </slot>
    </div>
  </div>

  <!-- ===== 移动端「拍照/相册/文件」菜单 ===== -->
  <Teleport to="body">
    <div v-if="sheetOpen" class="up-sheet-mask" @click="sheetOpen = false">
      <div ref="upSheetRef" class="up-sheet" tabindex="-1" role="menu" :aria-label="t('form.pickSource')" @click.stop>
        <button type="button" class="up-sheet-item" @click="openCamera">
          <IconSvg type="camera" size="sm" />{{ t('form.camera') }}
        </button>
        <button type="button" class="up-sheet-item" @click="pickFrom('gallery')">
          <IconSvg type="image" size="sm" />{{ t('form.gallery') }}
        </button>
        <button type="button" class="up-sheet-item" @click="pickFrom('browse')">
          <IconSvg type="file-text" size="sm" />{{ t('form.browse') }}
        </button>
        <button type="button" class="up-sheet-cancel" @click="sheetOpen = false">{{ t('form.cancel') }}</button>
      </div>
    </div>
  </Teleport>

  <!-- ===== 页面内拍照（CameraCapture 组件：原生相机布局，中键快门+左右侧键） =====
       multiple 字段启用连拍：拍一张接着拍下一张、胶卷回看/重拍某张，完成时批量交付 -->
  <CameraCapture
    v-model="cameraOpen"
    :multiple="props.multiple"
    @capture="onCameraCapture"
    @finish="onCameraBatchFinish"
    @error="onCameraError"
  />

  <!-- ===== 内置图片预览（previewMode='builtin' 时接管；多图可左右切换） ===== -->
  <ImagePreview v-if="_previewItems.length" :src="_previewItems" :initial-index="_previewIdx" @close="closePreview" />
</template>

<style src="./upload-scoped.css" scoped></style>

<!-- 移动端菜单样式：Teleport 到 body，scoped 不生效，用全局类名前缀 -->
<style src="./upload.css"></style>
