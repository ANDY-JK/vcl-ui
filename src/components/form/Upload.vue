<script setup lang="ts">
// ⛔ 保护 — 文件上传，禁止：clamp() → px，拖拽区尺寸比例，进度条动画
//    需我确认：accept 文件类型、multiple 多文件逻辑、预览图尺寸
import { ref, watch, computed, onUnmounted, onErrorCaptured } from 'vue'
import { formatSize } from '@/components/_internal/format-utils'
const _error = ref<Error | null>(null)
onErrorCaptured((e: Error) => {
  _error.value = e
  return false
})
import IconSvg from '@/components/basic/IconSvg.vue'
import ProgressBar from '@/components/data/ProgressBar.vue'
import CameraCapture from '@/components/form/CameraCapture.vue'

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
  multiple?: boolean
  maxSize?: number // MB
  minSize?: number // KB
  disabled?: boolean
  drag?: boolean
  modelValue?: UploadFile[]
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
})

const emit = defineEmits<{
  change: [files: UploadFile[]]
  remove: [file: UploadFile]
  error: [message: string]
  'update:modelValue': [files: UploadFile[]]
  /** card 模式：点击图片预览 */
  preview: [url: string]
}>()

const files = ref<UploadFile[]>([])
const dragging = ref(false)
const timers: ReturnType<typeof setInterval>[] = []

let fileId = 0

// 同步外部 modelValue → 内部 files（双向：外部清空时内部也清，避免预览残留）
watch(
  () => props.modelValue,
  (val) => {
    if (val && val.length > 0) {
      if (files.value.length === 0) files.value = val
    } else if (val && val.length === 0) {
      // 竞态防护：内部有正在上传的文件时，外部空数组通常是「父组件 modelValue getter
      // 尚未反映本次上传」的同步回环。立即清空会让 realUpload 完成时 emit 空数组，
      // 父组件 onUpload 误判为「用户删除文件」→ 落盘空记录 → 拍照返回刷新后图片丢失
      // （每个门店首次上传必现，需拍两次）。等上传完成 emit 后由父组件重新推入即可。
      if (files.value.some((f) => f.status === 'uploading')) return
      files.value.forEach((f) => {
        if (f.url?.startsWith('blob:')) URL.revokeObjectURL(f.url)
      })
      files.value = []
    }
  },
  { immediate: true },
)

function syncModel() {
  emit('update:modelValue', [...files.value])
}

/** 图片压缩：canvas resize + quality 调整（移动端尤其需要） */
async function compressImage(file: File): Promise<File> {
  if (!props.compress || !file.type.startsWith('image/')) return file
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = (e) => {
        URL.revokeObjectURL(url)
        reject(e)
      }
      img.src = url
    })
    // 等比缩小到 maxWidth 以内
    let { width, height } = img
    if (width > props.maxWidth) {
      height = Math.round(height * (props.maxWidth / width))
      width = props.maxWidth
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, width, height)
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('压缩失败'))),
        file.type === 'image/png' ? 'image/png' : 'image/jpeg',
        props.compressQuality,
      )
    })
    // 压缩后体积大于原图则返回原文件
    if (blob.size >= file.size) return file
    return new File([blob], file.name, { type: blob.type, lastModified: Date.now() })
  } catch {
    // 压缩失败返回原文件
    return file
  }
}

function processFiles(fileList: FileList | null) {
  if (!fileList || fileList.length === 0) return
  // card 模式且已有文件 → 替换而非追加
  if (props.variant === 'card' && files.value.length) {
    // 清理旧 blob URL
    files.value.forEach((f) => {
      if (f.url?.startsWith('blob:')) URL.revokeObjectURL(f.url)
    })
    files.value = []
  }
  const newFiles: UploadFile[] = []
  const limit = props.multiple ? fileList.length : 1
  for (let i = 0; i < limit; i++) {
    const f = fileList[i]
    if (!f) continue
    // accept 白名单校验（文件选择、拖拽、目录选择都走这里）：
    // 移动端选择器可能由宿主（如微信内置浏览器）提供拍照入口，但格式仍须匹配 accept
    if (props.accept && !isMimeAccepted(f, props.accept)) {
      emit('error', `文件 "${f.name}" 类型不支持（仅支持 ${props.accept}）`)
      continue
    }
    if (f.size > props.maxSize * 1024 * 1024) {
      emit('error', `文件 "${f.name}" 超过 ${props.maxSize}MB 限制`)
      continue
    }
    if (props.minSize && f.size < props.minSize * 1024) {
      emit('error', `文件 "${f.name}" 小于 ${props.minSize}KB 限制`)
      continue
    }
    if (files.value.some((existing) => existing.name === f.name && existing.size === f.size)) {
      emit('error', `文件 "${f.name}" 已存在`)
      continue
    }
    const uf: UploadFile = {
      id: ++fileId,
      name: f.name,
      size: f.size,
      progress: 0,
      status: 'uploading',
      raw: f,
    }
    newFiles.push(uf)
    files.value.unshift(uf)

    // 异步压缩图片后上传
    compressImage(f).then((compressed) => {
      uf.size = compressed.size
      if (props.customRequest) {
        realUpload(uf, compressed)
      } else {
        simulateUpload(uf)
      }
    })
  }
  if (newFiles.length) {
    if (props.variant === 'card') createPreviews(newFiles, fileList)
    emit('change', files.value)
    syncModel()
  }
}

function createPreviews(newFiles: UploadFile[], fileList: FileList) {
  for (let i = 0; i < Math.min(newFiles.length, fileList.length); i++) {
    const f = fileList[i]
    if (f && f.type.startsWith('image/')) newFiles[i].url = URL.createObjectURL(f)
  }
}

async function realUpload(uf: UploadFile, rawFile: File) {
  if (!props.customRequest) {
    uf.status = 'error'
    emit('error', '未配置 customRequest')
    return
  }
  try {
    const result = await props.customRequest(rawFile)
    uf.progress = 100
    uf.status = 'done'
    uf.url = result.url
    syncModel()
  } catch (e: any) {
    uf.status = 'error'
    emit('error', e?.message || '上传失败')
    syncModel()
  }
}

function simulateUpload(uf: UploadFile) {
  let p = 0
  const timer = setInterval(() => {
    p += Math.random() * 30 + 10
    if (p >= 100) {
      p = 100
      uf.progress = 100
      uf.status = 'done'
      clearInterval(timer)
    } else {
      uf.progress = Math.round(p)
    }
  }, 300)
  timers.push(timer)
}

function removeFile(uf: UploadFile) {
  // 释放 Blob URL 避免内存泄漏
  if (uf.url?.startsWith('blob:')) URL.revokeObjectURL(uf.url)
  files.value = files.value.filter((f) => f.id !== uf.id)
  emit('remove', uf)
  syncModel()
}

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

/** 检查文件 MIME 是否匹配 accept 模式（如 "image/*" 匹配 "image/png"） */
function isMimeAccepted(file: File, accept: string): boolean {
  if (!accept) return true
  const types = accept.split(',').map((s) => s.trim())
  return types.some((t) => {
    if (t.endsWith('/*')) return file.type.startsWith(t.slice(0, -1))
    if (t.startsWith('.')) return file.name.toLowerCase().endsWith(t.toLowerCase())
    return file.type === t
  })
}

function onPaste(e: ClipboardEvent) {
  if (props.disabled) return
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  const items = e.clipboardData?.items
  if (!items) return
  const dt = new DataTransfer()
  for (let i = 0; i < items.length; i++) {
    const f = items[i].getAsFile()
    if (!f) continue
    // accept 白名单校验：仅允许匹配 accept 的文件类型，防止恶意 SVG/HTML 粘贴
    if (props.accept && !isMimeAccepted(f, props.accept)) continue
    dt.items.add(f)
  }
  if (dt.files.length) processFiles(dt.files)
}

function retryFile(fileId: number) {
  const f = files.value.find((x) => x.id === fileId)
  if (f && f.status === 'error') {
    f.status = 'uploading'
    f.progress = 0
    simulateUpload(f)
  }
}

const fileInputRef = ref<HTMLInputElement | null>(null)
function triggerFileInput() {
  fileInputRef.value?.click()
}

// ===== 移动端「拍照/相册/文件」菜单 =====
// 安卓系统选择器（Photo Picker / DocumentsUI）没有相机入口，触屏设备上点击弹自绘菜单补齐
const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
const sheetOpen = ref(false)

/** 弹菜单还是直接选文件：仅移动端启用 mobileMenu 时弹菜单，桌面直接打开系统选择器 */
function handlePick() {
  if (props.disabled) return
  if (props.mobileMenu && isTouchDevice) sheetOpen.value = true
  else triggerFileInput()
}

/** 拍照/相册/浏览：临时 input 走系统选择器。
 *  拍照用 capture 直开系统相机（用户验证此路径可用、有图；安卓部分版本文件选择器
 *  没有「拍摄」入口，capture 是这些机型唯一拍照途径）。 */
function pickFrom(kind: 'camera' | 'gallery' | 'browse') {
  sheetOpen.value = false
  if (props.disabled) return
  // 移除上一次残留的临时 input（用户取消选择时不会触发 change）
  document.querySelectorAll('input[data-up-temp]').forEach((el) => el.remove())
  const input = document.createElement('input')
  input.type = 'file'
  // 浏览 = 全类型文件浏览器（对齐 iOS 原生「浏览」）；拍照/相册 = 原 accept（默认图片）
  input.accept = kind === 'browse' ? '' : props.accept || 'image/*'
  if (kind === 'camera') input.setAttribute('capture', 'environment')
  input.setAttribute('data-up-temp', '1')
  input.style.display = 'none'
  input.addEventListener('change', (e) => {
    onInputChange(e as Event)
    input.remove()
  })
  document.body.appendChild(input)
  input.click()
}

// ===== 页面内拍照：调起 CameraCapture 组件（原生相机布局） =====
// 真机 <input capture> 调起系统相机时，页面切到后台，Android/Edge 可能杀进程，
// 返回即整页重建（白屏刷新）。改用 CameraCapture 页面内取景拍照，全程不离开页面，无刷新。
// 相机不可用（无摄像头 / 权限拒绝 / 非 HTTPS）时由组件内置降级（fallbackOnError 默认开）调起系统相机，
// 照片仍经 capture 事件交付，这里只需转发提示。
const cameraOpen = ref(false)

function openCamera() {
  if (props.disabled) return
  sheetOpen.value = false
  cameraOpen.value = true
}

/** 组件拍照成功（页面内拍照或降级系统相机）→ 走正常上传链路（与相册/浏览一致） */
function onCameraCapture(file: File) {
  const dt = new DataTransfer()
  dt.items.add(file)
  processFiles(dt.files)
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
let _clickTimer: ReturnType<typeof setTimeout> | null = null
function onCardClick() {
  if (_clickTimer) {
    clearTimeout(_clickTimer)
    _clickTimer = null
    return
  }
  _clickTimer = setTimeout(() => {
    _clickTimer = null
    if (files.value.length) emit('preview', cardPreviewUrl.value)
    else handlePick()
  }, 280)
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
  timers.forEach((t) => clearInterval(t))
  timers.length = 0
  // 清理所有未释放的 Blob URL
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
      color: var(--color-danger);
      font-size: clamp(10px, 1.3vw, 11px);
    "
  >
    ⚠ 上传组件异常
  </div>
  <!-- ===== card 变体：精确对标旧项目 dropZone 结构 ===== -->
  <div
    v-else-if="variant === 'card'"
    class="card-wrap"
    :class="{ 'card-dragging': dragging, 'card-disabled': disabled }"
    role="button"
    :tabindex="disabled ? -1 : 0"
    :aria-label="label || '上传文件'"
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
      <!-- ① 标签：始终居中，pointer-events:none -->
      <p class="card-label">
        {{ label }}
      </p>

      <!-- ② 预览图：有文件时显示 -->
      <img v-if="cardPreviewUrl" :src="cardPreviewUrl" class="card-img" />

      <!-- ③ 多张标志：翻页按钮 + 计数 -->
      <template v-if="cardFileCount > 1">
        <button class="card-arrow card-arrow-left" @click="cardPrev">‹</button>
        <button class="card-arrow card-arrow-right" @click="cardNext">›</button>
        <span class="card-count">{{ cardIdx + 1 }}/{{ cardFileCount }}</span>
      </template>

      <!-- ④ 点击区：接收点击/双击 -->
      <div class="card-click-area" @click.stop="onCardClick" @dblclick.stop="onCardDblClick" />

      <!-- ⑤ 删除按钮：hover 时显示 -->
      <button
        v-if="files.length && cardHovered && !disabled"
        type="button"
        class="card-clear"
        @click.stop="files = []; syncModel()"
      >
        删除
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
    <slot name="trigger" :open-file-dialog="triggerFileInput">
      <div
        class="upload-area"
        :class="{ dragging, disabled }"
        role="button"
        :tabindex="disabled ? -1 : 0"
        :aria-label="'上传文件'"
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
          @change="onInputChange"
          @click="onDefaultInputClick"
        />
        <IconSvg type="upload" size="lg" color="var(--color-text-muted)" />
        <p class="upload-hint">
          <template v-if="dragging"> 释放文件以上传 </template>
          <template v-else> 拖拽 / 粘贴 / <span class="upload-link">点击上传</span> </template>
        </p>
        <p v-if="maxSize" class="upload-limit">单个文件不超过 {{ maxSize }}MB</p>
      </div>
    </slot>

    <div v-if="files.length" class="upload-list">
      <slot v-for="(f, idx) in files" :key="f.id" name="file-item" :file="f" :index="idx">
        <div class="upload-item">
          <IconSvg type="file" size="md" class="upload-file-icon" />
          <div class="upload-file-info">
            <div class="upload-file-name">
              {{ f.name }}
            </div>
            <div class="upload-file-meta">
              <span>{{ formatSize(f.size) }}</span>
              <span v-if="f.status === 'done'" style="color: var(--color-success)">✓ 上传成功</span>
              <span v-else-if="f.status === 'error'" style="color: var(--color-danger)">✗ 上传失败</span>
            </div>
            <ProgressBar
              v-if="f.status === 'uploading'"
              :percent="f.progress"
              :show-text="false"
              :height="4"
              style="margin-top: var(--space-1)"
            />
          </div>
          <button type="button" class="upload-remove" aria-label="移除文件" @click="removeFile(f)">
            <IconSvg type="x" size="sm" />
          </button>
        </div>
      </slot>
    </div>
  </div>

  <!-- ===== 移动端「拍照/相册/文件」菜单 ===== -->
  <Teleport to="body">
    <div v-if="sheetOpen" class="up-sheet-mask" @click="sheetOpen = false">
      <div class="up-sheet" @click.stop>
        <button type="button" class="up-sheet-item" @click="openCamera">📷 拍照</button>
        <button type="button" class="up-sheet-item" @click="pickFrom('gallery')">🖼 相册</button>
        <button type="button" class="up-sheet-item" @click="pickFrom('browse')">📄 浏览</button>
        <button type="button" class="up-sheet-cancel" @click="sheetOpen = false">取消</button>
      </div>
    </div>
  </Teleport>

  <!-- ===== 页面内拍照（CameraCapture 组件：原生相机布局，中键快门+左右侧键） ===== -->
  <CameraCapture v-model="cameraOpen" @capture="onCameraCapture" @error="onCameraError" />
</template>

<style scoped>
/* ===== card 变体（精确对标旧项目 drop-zone） ===== */
.card-wrap {
  position: relative;
  width: 110px;
  height: 110px;
  border: 2px dashed var(--color-border);
  background: var(--color-surface);
  overflow: hidden;
  box-sizing: border-box;
}
.card-wrap:hover,
.card-dragging {
  border-color: var(--color-primary);
}
.card-disabled {
  opacity: 0.5;
}
/* 内容容器 */
.card-content {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}
/* 点击区（30% 居中，z:3 高于图片和标签） */
.card-click-area {
  position: absolute;
  width: 30%;
  height: 30%;
  top: 35%;
  left: 35%;
  z-index: 3;
  cursor: pointer;
}
/* 标签文字（对标 .drop-zone p，始终居中，不拦截点击） */
.card-label {
  position: absolute;
  margin: 0;
  text-align: center;
  font-size: clamp(11px, 1.5vw, 15px);
  color: var(--color-primary);
  z-index: 2;
  pointer-events: none;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90%;
}
/* 预览图（对标 .drop-zone img） */
.card-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: cover;
  position: relative;
  z-index: 1;
}
.card-filename {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  margin: 0;
  padding: var(--space-1) 4px;
  font-size: 9px;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  z-index: 3;
}
/* 多张翻页箭头 */
.card-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 8;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: var(--ctrl-font-size);
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}
.card-wrap:hover .card-arrow {
  opacity: 1;
}
.card-arrow-left {
  left: 4px;
}
.card-arrow-right {
  right: 4px;
}
/* 计数标记 */
.card-count {
  position: absolute;
  bottom: 4px;
  right: 6px;
  z-index: 8;
  font-size: clamp(10px, 1.3vw, 13px);
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  padding: 1px 5px;
  border-radius: var(--radius-md);
}
/* 删除按钮 */
.card-clear {
  position: absolute;
  top: 5px;
  right: 5px;
  z-index: 10;
  padding: var(--space-1) 5px;
  border: none;
  border-radius: var(--radius-sm);
  background: #ef4444;
  color: #fff;
  font-size: clamp(10px, 1.3vw, 13px);
  cursor: pointer;
  font-weight: 600;
}

/* ===== default 变体 ===== */
.upload-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.upload-area {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: clamp(var(--space-6), 4vw, 36px);
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.upload-area:hover:not(.disabled) {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}
.upload-area.dragging {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}
.upload-area.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.upload-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: inherit;
}
.upload-hint {
  font-size: clamp(13px, 1.8vw, 15px);
  color: var(--color-text-secondary);
}
.upload-link {
  color: var(--color-primary);
  font-weight: 500;
}
.upload-limit {
  font-size: clamp(11px, 1.5vw, 15px);
  color: var(--color-text-muted);
}
.upload-list {
  display: flex;
  flex-direction: column;
  gap: clamp(var(--space-1), 1vw, 8px);
}
.upload-item {
  display: flex;
  align-items: center;
  gap: clamp(7px, 1.2vw, var(--space-2));
  padding: clamp(7px, 1.2vw, 10px) clamp(var(--space-2), 1.5vw, 12px);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.upload-file-icon {
  flex-shrink: 0;
  color: var(--color-text-muted);
}
.upload-file-info {
  flex: 1;
  min-width: 0;
}
.upload-file-name {
  font-size: clamp(11px, 1.8vw, 15px);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.upload-file-meta {
  display: flex;
  gap: clamp(var(--space-2), 1.5vw, 12px);
  font-size: clamp(10px, 1.4vw, 15px);
  color: var(--color-text-muted);
  margin-top: var(--space-1);
}
.upload-remove {
  display: flex;
  padding: var(--space-1);
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: 50%;
}
.upload-remove:hover {
  background: var(--color-bg-alt);
  color: var(--color-danger);
}
</style>

<!-- 移动端菜单样式：Teleport 到 body，scoped 不生效，用全局类名前缀 -->
<style>
.up-sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.up-sheet {
  width: 100%;
  max-width: 480px;
  background: var(--color-bg);
  border-radius: 14px 14px 0 0;
  padding: var(--space-3) var(--space-4) calc(16px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.up-sheet-item,
.up-sheet-cancel {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  font-size: clamp(13px, 2vw, 15px);
  color: var(--color-text);
  cursor: pointer;
  text-align: center;
}
.up-sheet-item:active {
  background: var(--color-bg-alt);
}
.up-sheet-cancel {
  border-color: transparent;
  color: var(--color-text-muted);
  background: transparent;
}
</style>
