<script setup lang="ts">
// ⛔ 保护 — 页面内拍照组件，参照原生相机布局：中间快门键，取消/重拍/翻转等
//    侧键左右按需显示。替代系统相机调起（避免页面切后台被浏览器杀进程重建刷新）。
//    需我确认：布局结构、采集参数（4:3 高清）、拍照后交付方式（capture 事件）
import { ref, watch, nextTick, onUnmounted } from 'vue'

interface Props {
  /** 显隐控制（v-model） */
  modelValue?: boolean
  /** JPEG 输出质量 0-1，默认 0.9 */
  quality?: number
  /** 页面内相机不可用（权限拒绝/无摄像头/非 HTTPS）时自动降级调起设备系统相机，默认 true */
  fallbackOnError?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  quality: 0.9,
  fallbackOnError: true,
})

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  /** 确认使用照片（页面内拍照或降级系统相机拍照均交付 File） */
  capture: [file: File]
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

watch(
  () => props.modelValue,
  (v) => {
    if (v) start()
  },
  { immediate: true },
)

async function start() {
  cameraReady.value = false
  shotUrl.value = ''
  shotFile.value = null
  streamKind = 'environment'
  if (!navigator.mediaDevices?.getUserMedia) {
    handleCameraUnavailable('当前环境不支持页面内拍照')
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
    emit('error', `${msg}，已切换系统相机`)
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
  if (shotUrl.value.startsWith('blob:')) URL.revokeObjectURL(shotUrl.value)
  shotUrl.value = ''
  shotFile.value = null
}

function cancel() {
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
      else handleCameraUnavailable('画面截取失败')
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
    handleCameraUnavailable('画面截取失败')
    return
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  canvas.toBlob(
    (blob) => {
      if (!blob) {
        // 微信等受限环境 toBlob 可能回调 null：按了快门没反应会让用户困惑，降级系统相机
        handleCameraUnavailable('画面截取失败')
        return
      }
      // 文件名保留中文（用户可见/打包下载用）；存储层 sanitizeObjectKeyPart 会
      // 在生成对象键时 ASCII 化——Supabase 对象键不接受中文，但展示名不受影响
      shotFile.value = new File([blob], `拍照-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' })
      if (shotUrl.value.startsWith('blob:')) URL.revokeObjectURL(shotUrl.value)
      shotUrl.value = URL.createObjectURL(blob)
    },
    'image/jpeg',
    props.quality,
  )
}

function retake() {
  if (shotUrl.value.startsWith('blob:')) URL.revokeObjectURL(shotUrl.value)
  shotUrl.value = ''
  shotFile.value = null
}

function useShot() {
  if (!shotFile.value) return
  const f = shotFile.value
  close()
  emit('update:modelValue', false)
  emit('capture', f)
}

/** 浏览器摄像头错误 → 用户可读中文 */
function cameraErrorToChinese(err: unknown): string {
  const raw = `${(err as Error)?.message || (err as Error)?.name || ''}`
  if (raw.includes('NotAllowedError')) return '摄像头权限被拒绝，请在浏览器设置中允许后重试'
  if (raw.includes('NotReadableError') || raw.includes('AbortError')) return '摄像头被其他应用占用，请关闭后重试'
  if (raw.includes('OverconstrainedError')) return '摄像头不支持所需分辨率'
  if (raw.includes('NotFoundError')) return '未检测到可用摄像头'
  if (raw.includes('NotSupportedError')) return '当前浏览器不支持摄像头访问'
  if (raw.includes('SecurityError')) return '摄像头访问被安全策略阻止（请使用 HTTPS 或 localhost）'
  if (raw.includes('Requested device not found')) return '未找到摄像头设备，请连接摄像头后重试'
  return '相机启动失败，请重试'
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
      <div class="camc-stage">
        <!-- 4:3 取景框：与原生相机一致，完整显示相机画面（不铺满全屏）。
             全屏铺满会裁掉 4:3 帧左右两侧、只露出中间竖条，取景范围 ≠ 出图范围，
             且让人误以为画面很大、要举很高才能拍完整 -->
        <div class="camc-viewport">
          <!-- video 常驻 DOM（v-show），避免重拍/翻转后元素重建导致 srcObject 丢失 -->
          <video
            v-show="!shotUrl"
            ref="videoRef"
            class="camc-video"
            :class="{ 'camc-mirror': streamKind === 'user' }"
            autoplay
            playsinline
            muted
          />
          <img v-if="shotUrl" :src="shotUrl" class="camc-shot" />
          <div v-if="!cameraReady && !shotUrl" class="camc-status">正在启动相机…</div>
        </div>

        <!-- 底部工具栏：中间快门 + 左右侧键 -->
        <div class="camc-bar">
          <!-- 已拍：左重拍 / 中「使用」 / 右取消 -->
          <template v-if="shotUrl">
            <button type="button" class="camc-side" @click="retake">重拍</button>
            <button type="button" class="camc-shutter camc-shutter-confirm" @click="useShot">使用</button>
            <button type="button" class="camc-side" @click="cancel">取消</button>
          </template>
          <!-- 取景：左取消 / 中快门 / 右翻转（无前置摄像头时右侧留空占位） -->
          <template v-else>
            <button type="button" class="camc-side" @click="cancel">取消</button>
            <button type="button" class="camc-shutter" :disabled="!cameraReady" aria-label="拍照" @click="takeShot" />
            <button v-if="showFlip" type="button" class="camc-side" @click="flip">翻转</button>
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
  z-index: 9999;
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
