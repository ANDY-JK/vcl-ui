<script setup lang="ts">
// ⛔ 保护 — 页面内拍照组件，参照原生相机布局：中间快门键，取消/重拍/翻转等
//    侧键左右按需显示。替代系统相机调起（避免页面切后台被浏览器杀进程重建刷新）。
//    需我确认：布局结构、采集参数（4:3 高清）、拍照后交付方式（capture 事件）
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'

const t = useT()

/** 相机浮层容器（Teleport 到 body 的遮罩内），供焦点陷阱限定范围 */
const camcStageRef = ref<HTMLElement | null>(null)

interface Props {
  /** 显隐控制（v-model） */
  modelValue?: boolean
  /** JPEG 输出质量 0-1，默认 0.9 */
  quality?: number
  /** 页面内相机不可用（权限拒绝/无摄像头/非 HTTPS）时自动降级调起设备系统相机，默认 true */
  fallbackOnError?: boolean
  /**
   * 多张连拍模式：快门确认后不交付、进内部队列并回到取景继续拍下一张；
   * 底部胶卷可回看/左右切换/重拍某张/删除，按「完成」经 finish 一次性交付 File[]。
   * 降级系统相机时无法连拍（每次一张，仍走 capture 事件逐张交付）。
   */
  multiple?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  quality: 0.9,
  fallbackOnError: true,
  multiple: false,
})

// P2-5：弹层焦点陷阱 —— 打开时焦点移入工具栏，Tab 循环不逃逸，关闭恢复
// 注意：必须在 props 声明之后调用（computed 内引用 props.modelValue，先声明会导致 TDZ ReferenceError）
useFocusTrap({
  visible: computed(() => props.modelValue),
  getContainer: () => camcStageRef.value,
  autofocus: 'container',
})

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  /** 确认使用照片（页面内拍照或降级系统相机拍照均交付 File；multiple 模式下降级路径也走这里） */
  capture: [file: File]
  /** multiple 模式：按「完成」一次性交付队列全部照片 */
  finish: [files: File[]]
  /** 取消 / 关闭 */
  cancel: []
  /** 相机不可用提示；fallbackOnError 时附带说明已切换系统相机 */
  error: [message: string]
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const cameraReady = ref(false)
const shotUrl = ref('')
const shotFile = ref<File | null>(null)
/** 是否有前置摄像头可切换（enumerateDevices 检测，无则隐藏「翻转」键 = 按需显示） */
const showFlip = ref(false)
let stream: MediaStream | null = null
let streamKind: 'environment' | 'user' = 'environment'

/* ════════ multiple 连拍队列 ════════ */
interface CamShot {
  file: File
  url: string
}
const shots = ref<CamShot[]>([])
/** ≥0：正在回看队列第 viewIdx 张（左右切换/重拍/删除） */
const viewIdx = ref(-1)
/** ≥0：取景是为替换第 replaceIdx 张（快门确认后替换该位，而非追加） */
const replaceIdx = ref(-1)

function clearShot() {
  if (shotUrl.value.startsWith('blob:')) URL.revokeObjectURL(shotUrl.value)
  shotUrl.value = ''
  shotFile.value = null
}

function clearShots() {
  shots.value.forEach((s) => URL.revokeObjectURL(s.url))
  shots.value = []
  viewIdx.value = -1
  replaceIdx.value = -1
}

/** 回看队列第 i 张 */
function reviewShot(i: number) {
  viewIdx.value = i
  replaceIdx.value = -1
  clearShot()
}

function reviewPrev() {
  if (viewIdx.value > 0) viewIdx.value -= 1
}

function reviewNext() {
  if (viewIdx.value < shots.value.length - 1) viewIdx.value += 1
}

/** 回看中：删除当前张 */
function deleteShot() {
  const i = viewIdx.value
  if (i < 0 || i >= shots.value.length) return
  URL.revokeObjectURL(shots.value[i].url)
  shots.value.splice(i, 1)
  if (!shots.value.length) {
    viewIdx.value = -1
    return
  }
  viewIdx.value = Math.min(i, shots.value.length - 1)
}

/** 回看中：重拍当前张 → 回取景，快门确认后替换该位 */
function retakeShot() {
  replaceIdx.value = viewIdx.value
  viewIdx.value = -1
  clearShot()
}

/** 回看/替换中：放弃替换或回取景继续拍 */
function backToViewfinder() {
  replaceIdx.value = -1
  viewIdx.value = -1
  clearShot()
}

/** multiple 模式按「完成」：一次性交付队列 */
function finishShots() {
  if (!shots.value.length) return
  const files = shots.value.map((s) => s.file)
  close()
  emit('update:modelValue', false)
  emit('finish', files)
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) start()
  },
  { immediate: true },
)

async function start() {
  cameraReady.value = false
  clearShot()
  clearShots()
  streamKind = 'environment'
  if (!navigator.mediaDevices?.getUserMedia) {
    handleCameraUnavailable(t('form.cameraUnavailable'))
    return
  }
  await refreshFlipAvailable()
  await openStream('environment')
}

/** 检测摄像头数量更新翻转键；授权前后各调用一次（iOS 未授权时 enumerateDevices 返回空/不全） */
async function refreshFlipAvailable(): Promise<void> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    showFlip.value = devices.filter((d) => d.kind === 'videoinput').length > 1
  } catch {
    showFlip.value = false
  }
}

/** 取流：个别 WebView 对 facingMode 字面量不支持（抛 OverconstrainedError/TypeError），
 *  去掉 facingMode 用默认摄像头重试一次，尽量留在页面内拍照，避免直接降级系统相机 */
async function acquireStream(kind: 'environment' | 'user'): Promise<MediaStream> {
  const base: MediaTrackConstraints = {
    aspectRatio: { ideal: 4 / 3 },
    width: { ideal: 3264 },
    height: { ideal: 2448 },
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: kind, ...base }, audio: false })
  } catch (e) {
    if ((e as Error)?.name === 'OverconstrainedError' || (e as Error)?.name === 'TypeError') {
      return await navigator.mediaDevices.getUserMedia({ video: base, audio: false })
    }
    throw e
  }
}

async function openStream(kind: 'environment' | 'user') {
  try {
    // 默认 4:3 比例 + 尽量高清：拍纸质合同/协议 4:3 取景更合适；ideal 让设备在
    // 支持范围内给最高分辨率（4:3 主流档位 3264×2448 起），达不到也不拒绝、不阻塞
    const s = await acquireStream(kind)
    if (!props.modelValue) {
      s.getTracks().forEach((t) => t.stop())
      return
    } // 已被关闭
    stream = s
    streamKind = kind
    await nextTick()
    const video = videoRef.value
    if (!video || !props.modelValue) {
      close()
      return
    }
    video.srcObject = s
    await video.play()
    cameraReady.value = true
    // 摄像头权限已授予，此时设备列表才完整（iOS 未授权时 enumerateDevices 返回不全）→ 刷新翻转键
    await refreshFlipAvailable()
  } catch (e) {
    console.warn('[CameraCapture] 相机不可用:', e)
    handleCameraUnavailable(cameraErrorToChinese(e))
  }
}

/** 页面内相机不可用：默认降级调起设备系统相机，避免用户不给权限就拍不了 */
function handleCameraUnavailable(msg: string) {
  if (props.fallbackOnError) {
    close()
    emit('update:modelValue', false)
    emit('error', t('form.cameraSwitched', { msg }))
    triggerSystemCamera()
  } else {
    emit('error', msg)
    emit('update:modelValue', false)
  }
}

/** 微信内置浏览器（含企业微信）检测：X5/XWeb 内核的 file input 行为与系统浏览器不同 */
const isWeChat = typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent)

/** 调起设备系统相机（capture input）；拍照返回的 File 经 capture 事件交付，调用方无需感知降级 */
function triggerSystemCamera() {
  document.querySelectorAll('input[data-camc-fallback]').forEach((el) => el.remove())
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  // 微信内置浏览器（X5/XWeb）对 capture 支持不稳定（部分版本忽略、部分直开相机后返回异常）。
  // 微信自己的文件选择器自带「拍摄」入口（拍摄/相册/聊天记录），不带 capture 弹它最通用；
  // wx.chooseMedia 需要后端签名（wx.config），非微信环境无此约束，可直开系统相机。
  if (!isWeChat) input.setAttribute('capture', 'environment')
  input.setAttribute('data-camc-fallback', '1')
  input.style.display = 'none'
  input.addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0]
    if (f) emit('capture', f)
    input.remove()
  })
  document.body.appendChild(input)
  input.click()
}

function close() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop())
    stream = null
  }
  cameraReady.value = false
  clearShot()
  clearShots()
}

/** multiple 模式下队列非空时取消，防误触丢片；替换取景中取消 = 退回回看不清队列 */
function cancel() {
  if (replaceIdx.value >= 0) {
    viewIdx.value = Math.min(replaceIdx.value, shots.value.length - 1)
    replaceIdx.value = -1
    clearShot()
    return
  }
  if (props.multiple && shots.value.length && !window.confirm(t('form.cancelDiscardShots', { n: shots.value.length })))
    return
  close()
  emit('update:modelValue', false)
  emit('cancel')
}

function flip() {
  const next = streamKind === 'environment' ? 'user' : 'environment'
  const old = stream
  stream = null
  if (old) old.getTracks().forEach((t) => t.stop())
  cameraReady.value = false
  openStream(next)
}

function takeShot() {
  const video = videoRef.value
  if (!video || !cameraReady.value) return
  if (!video.videoWidth) {
    // 个别内核 play() 后 metadata 未完全就绪（videoWidth=0）：稍后重试一帧，仍无则降级
    // 避免用户按快门没反应
    setTimeout(() => {
      if (!props.modelValue || !cameraReady.value) return
      if (video.videoWidth) doShot(video)
      else handleCameraUnavailable(t('form.captureFailed'))
    }, 150)
    return
  }
  doShot(video)
}

function doShot(video: HTMLVideoElement) {
  const canvas = document.createElement('canvas')
  // 取景为 4:3 取景框完整显示帧（contain 不裁剪）→ 出图直接取整帧，与取景所见一致
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx || typeof canvas.toBlob !== 'function') {
    // 取景画面正常但截帧能力缺失（个别受限内核）→ 降级系统相机，避免按快门没反应
    handleCameraUnavailable(t('form.captureFailed'))
    return
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  canvas.toBlob(
    (blob) => {
      if (!blob) {
        // 微信等受限环境 toBlob 可能回调 null：按了快门没反应会让用户困惑，降级系统相机
        handleCameraUnavailable(t('form.captureFailed'))
        return
      }
      // 文件名保留中文（用户可见/打包下载用）；存储层 sanitizeObjectKeyPart 会
      // 在生成对象键时 ASCII 化——Supabase 对象键不接受中文，但展示名不受影响
      shotFile.value = new File([blob], `${t('form.camera')}-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' })
      if (shotUrl.value.startsWith('blob:')) URL.revokeObjectURL(shotUrl.value)
      shotUrl.value = URL.createObjectURL(blob)
    },
    'image/jpeg',
    props.quality,
  )
}

function retake() {
  clearShot()
}

function useShot() {
  if (!shotFile.value) return
  const f = shotFile.value
  if (props.multiple) {
    // 连拍：替换目标位（回看重拍进入）或追加队列，然后回到取景继续拍下一张
    const url = shotUrl.value
    shotUrl.value = '' // blob URL 所有权转移给队列，不随 clearShot revoke
    shotFile.value = null
    if (replaceIdx.value >= 0 && replaceIdx.value < shots.value.length) {
      URL.revokeObjectURL(shots.value[replaceIdx.value].url)
      shots.value[replaceIdx.value] = { file: f, url }
      viewIdx.value = replaceIdx.value // 回看确认替换结果
      replaceIdx.value = -1
    } else {
      shots.value.push({ file: f, url })
    }
    return
  }
  close()
  emit('update:modelValue', false)
  emit('capture', f)
}

/** 浏览器摄像头错误 → 用户可读文案 */
function cameraErrorToChinese(err: unknown): string {
  const raw = `${(err as Error)?.message || (err as Error)?.name || ''}`
  if (raw.includes('NotAllowedError')) return t('form.cameraErrNotAllowed')
  if (raw.includes('NotReadableError') || raw.includes('AbortError')) return t('form.cameraErrOccupied')
  if (raw.includes('OverconstrainedError')) return t('form.cameraErrResolution')
  if (raw.includes('NotFoundError')) return t('form.cameraErrNotFound')
  if (raw.includes('NotSupportedError')) return t('form.cameraErrNotSupported')
  if (raw.includes('SecurityError')) return t('form.cameraErrSecurity')
  if (raw.includes('Requested device not found')) return t('form.cameraErrDeviceNotFound')
  return t('form.cameraErrFallback')
}

onUnmounted(() => {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop())
    stream = null
  }
  if (shotUrl.value.startsWith('blob:')) URL.revokeObjectURL(shotUrl.value)
})
</script>

<template>
  <!-- 全屏取景浮层：参照原生相机 —— 中间快门键，取消/重拍/翻转左右两侧按需显示 -->
  <Teleport to="body">
    <div v-if="props.modelValue" class="camc-mask" @click.self="cancel">
      <div ref="camcStageRef" class="camc-stage" tabindex="-1">
        <!-- 4:3 取景框：与原生相机一致，完整显示相机画面（不铺满全屏）。
             全屏铺满会裁掉 4:3 帧左右两侧、只露出中间竖条，取景范围 ≠ 出图范围，
             且让人误以为画面很大、要举很高才能拍完整 -->
        <div class="camc-viewport">
          <!-- video 常驻 DOM（v-show），避免重拍/翻转后元素重建导致 srcObject 丢失 -->
          <video
            v-show="!shotUrl && viewIdx < 0"
            ref="videoRef"
            class="camc-video"
            :class="{ 'camc-mirror': streamKind === 'user' }"
            autoplay
            playsinline
            muted
          />
          <!-- 刚拍待确认 -->
          <img v-if="shotUrl" :src="shotUrl" class="camc-shot" />
          <!-- 连拍回看：队列第 viewIdx 张，左右箭头切换 -->
          <template v-else-if="viewIdx >= 0">
            <img :src="shots[viewIdx].url" class="camc-shot" />
            <button
              v-if="viewIdx > 0"
              type="button"
              class="camc-nav camc-nav-prev"
              :aria-label="t('form.prevPhoto')"
              @click="reviewPrev"
            >
              ‹
            </button>
            <button
              v-if="viewIdx < shots.length - 1"
              type="button"
              class="camc-nav camc-nav-next"
              :aria-label="t('form.nextPhoto')"
              @click="reviewNext"
            >
              ›
            </button>
          </template>
          <div v-if="!cameraReady && !shotUrl && viewIdx < 0" class="camc-status">{{ t('form.cameraStarting') }}</div>
        </div>

        <!-- 连拍胶卷（multiple 模式）：缩略图回看 + 完成交付 -->
        <div v-if="props.multiple" class="camc-strip">
          <div class="camc-thumbs">
            <button
              v-for="(s, i) in shots"
              :key="s.url"
              type="button"
              class="camc-thumb"
              :class="{ active: i === viewIdx }"
              :aria-label="`${t('form.review')} ${i + 1}/${shots.length}`"
              @click="reviewShot(i)"
            >
              <img :src="s.url" alt="" />
            </button>
          </div>
          <button type="button" class="camc-done" :disabled="!shots.length" @click="finishShots">
            {{ t('form.done') }}<span v-if="shots.length">({{ shots.length }})</span>
          </button>
        </div>

        <!-- 底部工具栏：中间快门 + 左右侧键 -->
        <div class="camc-bar">
          <!-- 回看队列某张：左重拍该张 / 中继续拍 / 右删除 -->
          <template v-if="viewIdx >= 0">
            <button type="button" class="camc-side" @click="retakeShot">{{ t('form.retake') }}</button>
            <button type="button" class="camc-shutter camc-shutter-confirm" @click="backToViewfinder">
              {{ t('form.continueShot') }}
            </button>
            <button type="button" class="camc-side" @click="deleteShot">{{ t('form.delete') }}</button>
          </template>
          <!-- 已拍待确认：左重拍 / 中「使用」 / 右取消（替换中为返回） -->
          <template v-else-if="shotUrl">
            <button type="button" class="camc-side" @click="retake">{{ t('form.retake') }}</button>
            <button type="button" class="camc-shutter camc-shutter-confirm" @click="useShot">
              {{ t('form.use') }}
            </button>
            <button type="button" class="camc-side" @click="cancel">
              {{ replaceIdx >= 0 ? t('form.back') : t('form.cancel') }}
            </button>
          </template>
          <!-- 取景：左取消（替换中为返回）/ 中快门 / 右翻转（无前置摄像头时右侧留空占位） -->
          <template v-else>
            <button type="button" class="camc-side" @click="cancel">
              {{ replaceIdx >= 0 ? t('form.back') : t('form.cancel') }}
            </button>
            <button
              type="button"
              class="camc-shutter"
              :disabled="!cameraReady"
              :aria-label="t('form.takePhoto')"
              @click="takeShot"
            />
            <button v-if="showFlip" type="button" class="camc-side" @click="flip">{{ t('form.flip') }}</button>
            <span v-else class="camc-side camc-side-blank" />
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 全屏取景（Teleport 到 body） */
.camc-mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-top, 9999);
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.camc-stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* 取景框垂直水平居中；工具栏 position:absolute 不参与流式布局 */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
/* 4:3 取景框：宽撑满；横屏等高度受限场景按比例收窄。由 stage 的 flex 居中 */
.camc-viewport {
  width: 100%;
  max-width: calc(100vh * 4 / 3);
  aspect-ratio: 4 / 3;
  background: #000;
}
.camc-video,
.camc-shot {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.camc-video.camc-mirror {
  transform: scaleX(-1);
}
.camc-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: clamp(14px, 1.8vw, 15px);
  background: #000;
}

/* 底部工具栏：三等分布局保证快门居中 */
.camc-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(28px + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-7);
  z-index: 2;
}

/* 连拍胶卷（multiple）：位于工具栏上方，缩略图横向滚动 + 完成按钮 */
.camc-strip {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(28px + 56px + 20px + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-5);
  z-index: 2;
}
.camc-thumbs {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  overflow-x: auto;
  scrollbar-width: none;
  padding: 4px;
}
.camc-thumbs::-webkit-scrollbar {
  display: none;
}
.camc-thumb {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: rgba(255, 255, 255, 0.12);
  cursor: pointer;
}
.camc-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.camc-thumb.active {
  border-color: #3b82f6;
}
.camc-done {
  flex-shrink: 0;
  height: 40px;
  padding: 0 18px;
  border: none;
  border-radius: 20px;
  background: #3b82f6;
  color: #fff;
  font-size: clamp(13px, 1.8vw, 15px);
  font-weight: 600;
  cursor: pointer;
}
.camc-done:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.camc-done:active {
  opacity: 0.85;
}

/* 回看左右切换箭头（叠在取景框两侧） */
.camc-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}
.camc-nav:active {
  background: rgba(0, 0, 0, 0.65);
}
.camc-nav-prev {
  left: 12px;
}
.camc-nav-next {
  right: 12px;
}
/* 左右侧键：同一尺寸占位，保证快门绝对居中 */
.camc-side {
  width: 56px;
  height: 56px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: clamp(13px, 1.8vw, 15px);
  cursor: pointer;
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.camc-side:active {
  background: rgba(255, 255, 255, 0.3);
}
.camc-side-blank {
  background: transparent;
  pointer-events: none;
}
/* 中间快门：原生相机风大圆白圈 */
.camc-shutter {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 4px solid #fff;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  position: relative;
}
.camc-shutter::after {
  content: '';
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.12);
}
.camc-shutter:active {
  transform: scale(0.94);
}
.camc-shutter:disabled {
  opacity: 0.5;
}
.camc-shutter-confirm {
  border-color: #3b82f6;
  background: #3b82f6;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}
.camc-shutter-confirm::after {
  display: none;
}
</style>
