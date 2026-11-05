<script setup lang="ts">
import { reportWarn } from '@/components/_internal/runtime-observer'
// ⛔ 保护 — 页面内拍照组件，参照原生相机布局：中间快门键，取消/重拍/翻转等
//    侧键左右按需显示。替代系统相机调起（避免页面切后台被浏览器杀进程重建刷新）。
//    需我确认：布局结构、采集参数（4:3 高清）、拍照后交付方式（capture 事件）
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'
import { useCaptureFallback } from './utils/useCaptureFallback'
import CaptureFallbackSheet from './CaptureFallbackSheet.vue'
import { cancelPendingSystemCapture } from './utils/capture-fallback'

/** play() 后个别内核 metadata 仍未就绪（videoWidth=0），补测一次的间隔 */
const _METADATA_RETRY_MS = 150

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
   * 底部胶卷可回看/左右切换/重拍某张/删除，顶部「完成」经 finish 一次性交付 File[]。
   * 降级系统相机时无法连拍（每次一张，仍走 capture 事件逐张交付）。
   */
  multiple?: boolean
  /**
   * 计划拍摄的照片名称（按拍摄顺序对应，如 ['门头照','铭牌特写']）。
   * 显示在顶部提示/胶卷/回看中，并写入交付文件名（name-时间戳.jpg）；未传则自动「照片1、照片2…」
   */
  shotNames?: string[]
  /** 最后兜底：系统相机也拿不到照片（取消/不可用）时自动弹上传面板，默认 true */
  fallbackSheet?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  quality: 0.9,
  fallbackOnError: true,
  multiple: false,
  shotNames: () => [],
  fallbackSheet: true,
})

// P2-5：弹层焦点陷阱 —— 打开时焦点移入工具栏，Tab 循环不逃逸，关闭恢复
// 注意：必须在 props 声明之后调用（computed 内引用 props.modelValue，先声明会导致 TDZ ReferenceError）
useFocusTrap({
  visible: computed(() => props.modelValue),
  getContainer: () => camcStageRef.value,
  autofocus: 'container',
})

const emit = defineEmits<{
  /** v-model——显隐 */
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
  /** 照片名称（shotNames 对应项或自动「照片n」），写入文件名并展示 */
  name: string
}
const shots = ref<CamShot[]>([])
/** ≥0：正在回看队列第 viewIdx 张（左右切换/重拍/删除） */
const viewIdx = ref(-1)
/** ≥0：取景是为替换第 replaceIdx 张（快门确认后替换该位，而非追加） */
const replaceIdx = ref(-1)

/** 第 i 张（0 基）的照片名称：计划名称优先，超出计划自动编号 */
function shotNameAt(i: number): string {
  return props.shotNames[i] || t('form.photoN', { n: i + 1 })
}

/** 顶部提示文案：替换中显示重拍目标，回看显示当前名称，取景显示下一张计划 */
const slotChipText = computed(() => {
  if (replaceIdx.value >= 0 && replaceIdx.value < shots.value.length) {
    return t('form.reshootSlot', { name: shots.value[replaceIdx.value].name })
  }
  if (viewIdx.value >= 0 && viewIdx.value < shots.value.length) {
    return shots.value[viewIdx.value].name
  }
  const next = shots.value.length
  if (props.shotNames.length && next < props.shotNames.length) {
    return t('form.nextSlot', { name: props.shotNames[next], i: next + 1, n: props.shotNames.length })
  }
  return t('form.shotCountN', { n: next })
})

/** 安全释放一个 blob URL（#433）：只撤 blob:，且撤不掉不抛。
 *  - 队列里可能混入**宿主的非 blob URL**（自定义 url / 已上传的 http 地址），
 *    对它们调 revokeObjectURL 在部分内核会抛 TypeError —— 一次抛错会把整个
 *    清理循环打断，后面的 URL 全部泄漏（deleteShot / clearShots / 卸载兜底都踩这个坑）；
 *  - revoke 本身在极老 WebView 上不存在或不可用。撤不掉只影响回收时机，不该阻断流程。 */
function revokeShotUrl(url: string | undefined): void {
  if (!url || !url.startsWith('blob:')) return
  try {
    URL.revokeObjectURL(url)
  } catch {
    /* 忽略：只影响内存回收时机 */
  }
}

function clearShot() {
  revokeShotUrl(shotUrl.value)
  shotUrl.value = ''
  shotFile.value = null
}

function clearShots() {
  shots.value.forEach((s) => revokeShotUrl(s.url))
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
  revokeShotUrl(shots.value[i].url)
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
    reportWarn('[CameraCapture] 相机不可用:', e)
    handleCameraUnavailable(cameraErrorToChinese(e))
  }
}

/** 系统相机 + 上传兜底面板编排：取到照片经 capture 交付，取不到自动弹上传面板 */
const { sheetVisible, captureViaSystem, onSheetFiles } = useCaptureFallback({
  onFile: (f) => emit('capture', f),
  allowSheet: () => props.fallbackSheet,
})

/** 页面内相机不可用：默认降级调起设备系统相机，避免用户不给权限就拍不了 */
function handleCameraUnavailable(msg: string) {
  if (props.fallbackOnError) {
    close()
    emit('update:modelValue', false)
    emit('error', t('form.cameraSwitched', { msg }))
    void captureViaSystem()
  } else {
    emit('error', msg)
    emit('update:modelValue', false)
  }
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
    }, _METADATA_RETRY_MS)
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
      revokeShotUrl(shotUrl.value)
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
      revokeShotUrl(shots.value[replaceIdx.value].url)
      // 替换位沿用原名称；文件重命名带名称（交付后上传列表可读）
      const name = shots.value[replaceIdx.value].name
      shots.value[replaceIdx.value] = { file: renameWithShotName(f, name), url, name }
      viewIdx.value = replaceIdx.value // 回看确认替换结果
      replaceIdx.value = -1
    } else {
      const i = shots.value.length
      shots.value.push({ file: renameWithShotName(f, shotNameAt(i)), url, name: shotNameAt(i) })
    }
    return
  }
  close()
  emit('update:modelValue', false)
  emit('capture', f)
}

/** 按照片名重命名交付文件（保留 jpeg 扩展名），供上传列表/打包下载显示可读名称 */
function renameWithShotName(f: File, name: string): File {
  return new File([f], `${name}-${Date.now()}.jpg`, { type: f.type || 'image/jpeg' })
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
  cancelPendingSystemCapture() // 系统采集仍挂着（旧内核无 cancel）时强制按「取消」收尾
  if (stream) {
    stream.getTracks().forEach((t) => t.stop())
    stream = null
  }
  revokeShotUrl(shotUrl.value)
  // 队列照片的 blob URL 只在 close() 里释放；父级在开启状态下卸载组件（v-if/路由切换）会整批泄漏
  clearShots()
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

        <!-- 连拍顶部条（multiple）：左当前拍照名称/进度，右「完成」交付 -->
        <div v-if="props.multiple" class="camc-topbar">
          <span class="camc-slot-chip" :title="slotChipText">{{ slotChipText }}</span>
          <button type="button" class="camc-done" :disabled="!shots.length" @click="finishShots">
            {{ t('form.done') }}<span v-if="shots.length">({{ shots.length }})</span>
          </button>
        </div>

        <!-- 连拍胶卷（multiple 模式）：缩略图回看，每张带名称 -->
        <div v-if="props.multiple" class="camc-strip">
          <div class="camc-thumbs">
            <div v-for="(s, i) in shots" :key="s.url" class="camc-shot-item">
              <button
                type="button"
                class="camc-thumb"
                :class="{ active: i === viewIdx }"
                :aria-label="`${t('form.review')} ${s.name}`"
                @click="reviewShot(i)"
              >
                <img :src="s.url" alt="" />
              </button>
              <span class="camc-shot-name" :title="s.name">{{ s.name }}</span>
            </div>
          </div>
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
    <!-- 最后兜底：系统相机也取不到照片时自动弹上传面板 -->
    <CaptureFallbackSheet
      v-model="sheetVisible"
      mode="photo"
      :title="t('form.captureFallbackTitle')"
      :upload-hint="t('form.captureUploadHint')"
      @files="onSheetFiles"
    />
  </Teleport>
</template>
<style src="./camera-capture-scoped.css" scoped></style>
