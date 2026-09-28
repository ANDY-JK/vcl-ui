<script setup lang="ts">
/**
 * CodeCapture — 扫码采集（自动兜底链）。
 *
 * 用户只点一次「扫码」，之后链路自己下探，无需在来源之间做选择：
 *   ① 页面内相机实时扫码（不切后台、无刷新）
 *   ② 相机不可用 / 被拒 / 被占用 → 自动调系统相机拍一张，再识别
 *   ③ 系统级也不成（无摄像头 / 非 HTTPS / 用户取消）或识别不到 →
 *      卡片内直接翻到兜底页：上面上传组件选图识别，下面输入框手工输入
 *
 * 「相机整条不可用」直接进③（避免注定失败的权限纠缠）。
 * 兜底页是同一张卡片内的翻页（不是叠第二层弹层），所以不会出现两层遮罩压暗。
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'
import { useBarcodeScanner, warmBarcodeDecoder, type BarcodeFormats } from './utils/useBarcodeScanner'
import {
  detectCaptureCapability,
  openSystemCapture,
  cancelPendingSystemCapture,
  type CaptureFailReason,
} from './utils/capture-fallback'
import CaptureFallbackPanel from './CaptureFallbackPanel.vue'
import IconSvg from '@/components/basic/IconSvg.vue'

const t = useT()

interface Props {
  /** 显隐（v-model） */
  modelValue: boolean
  /** 识别格式：all / qr / barcode，可传 Ref 实时切换 */
  formats?: BarcodeFormats
  /** 条码前缀过滤 */
  prefix?: string
  /** 条码长度过滤 */
  length?: number
  /** 连扫模式：扫到不关闭、结果累积，关闭时经 finish 一次性交付 */
  multiple?: boolean
  /** 是否启用自动兜底链（失败后自动下探系统相机），默认 true；关掉则失败仅报错，兜底面板保留手动入口 */
  autoFallback?: boolean
  /** 扫码浮层标题（空串用内置 i18n） */
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  formats: 'all',
  prefix: undefined,
  length: undefined,
  multiple: false,
  autoFallback: true,
  title: '',
})

const emit = defineEmits<{
  /** v-model——显隐 */
  'update:modelValue': [v: boolean]
  /** 识别到一条码（逐条交付） */
  scan: [code: string]
  /** multiple 模式关闭时一次性交付全部结果 */
  finish: [codes: string[]]
  /** 降级/失败提示（相机不可用、识别失败等） */
  error: [msg: string]
  /** 关闭浮层 */
  close: []
}>()

/** 浮层容器（Teleport 到 body），供焦点陷阱限定范围 */
const stageRef = ref<HTMLElement | null>(null)
useFocusTrap({
  visible: computed(() => props.modelValue),
  getContainer: () => stageRef.value,
  autofocus: 'container',
})

const title = computed(() => props.title || t('form.scanCode'))

/** 页面内取流能力（决定 idle 态是否展示「扫码」入口：没有取流能力时它只会把人送回兜底页） */
const canInpage = computed(() => detectCaptureCapability().canInpage)

const {
  start,
  stop,
  scanPhoto,
  error: scanError,
  failReason,
  videoRef,
  canvasRef,
  detections,
  triggerDetection,
  paused,
  pause,
  resume,
  torchOn,
  torchSupported,
  toggleTorch,
} = useBarcodeScanner({
  formats: props.formats,
  prefix: props.prefix,
  length: props.length,
  onScan: (code) => {
    codes.value = [...new Set([...codes.value, code])]
    emit('scan', code)
    if (!props.multiple) close()
  },
})

/** idle=未启动 starting=启动中 live=实时扫描 recognizing=拍照识别中 sheet=兜底页 */
const phase = ref<'idle' | 'starting' | 'live' | 'recognizing' | 'sheet'>('idle')
const codes = ref<string[]>([])
const tip = ref('')
/** 兜底页显隐（卡片内翻页，非弹层） */
const sheetVisible = ref(false)

/** 实时态是否定格（多码时冻结画面选码） */
watch(detections, (list) => {
  if (!paused.value && list.length >= 2) pause()
})

/** 检测框 canvas 像素坐标 → 相对取景区百分比 */
function boxStyle(d: { x: number; y: number; width: number; height: number }) {
  const cw = canvasRef.value?.width || 1
  const ch = canvasRef.value?.height || 1
  return {
    left: (d.x / cw) * 100 + '%',
    top: (d.y / ch) * 100 + '%',
    width: (d.width / cw) * 100 + '%',
    height: (d.height / ch) * 100 + '%',
  }
}

/* ════════ 打开 / 关闭：进入自动兜底链 ════════ */

watch(
  () => props.modelValue,
  (v) => {
    if (v) void open()
    else void teardown()
  },
)

async function open() {
  codes.value = []
  tip.value = ''
  const cap = detectCaptureCapability()
  if (!cap.canInpage) {
    // 相机整条不可用：直接进兜底面板（上传 + 手工输入）
    tip.value = t('form.scanSwitchedToManual', { msg: t('form.cameraUnavailable') })
    openSheet()
    return
  }
  await startInpage()
}

async function startInpage() {
  phase.value = 'starting'
  await nextTick()
  await start()
  if (scanError.value) {
    onInpageFail(scanError.value, (failReason.value || 'unknown') as CaptureFailReason)
    return
  }
  phase.value = 'live'
}

/** 页面内取流失败 → 自动下探（系统相机 → 兜底面板） */
function onInpageFail(msg: string, reason: CaptureFailReason) {
  emit('error', msg)
  if (!props.autoFallback) {
    phase.value = 'idle'
    return
  }
  if (reason === 'notfound' || reason === 'unsupported' || reason === 'insecure') {
    // 没有摄像头 / 不支持 / 非安全上下文：系统相机同样无望，直接兜底
    tip.value = t('form.scanSwitchedToManual', { msg })
    openSheet()
    return
  }
  // 权限拒绝 / 被占用：触屏继续下探系统相机（走系统权限，往往仍能出图）；
  // 桌面不自动弹系统选择器（弹了选择器取消后又要弹面板=让用户选两遍），直接进兜底面板
  if (detectCaptureCapability().isTouch) {
    tip.value = t('form.scanSwitchedToUpload', { msg })
    void trySystemPhoto()
  } else {
    tip.value = t('form.scanSwitchedToManual', { msg })
    openSheet()
  }
}

/** 系统相机拍一张再识别；用户取消或识别不到 → 兜底面板 */
async function trySystemPhoto() {
  phase.value = 'recognizing'
  const files = await openSystemCapture({ accept: 'image/*', capture: 'environment' })
  if (!props.modelValue) return // 弹层已关闭/卸载（含 pending 被强制结算）：不再下探
  if (files.length) {
    const hit = await recognize(files)
    if (hit) return
  }
  openSheet()
}

/**
 * 相册选图识别（实时扫码页底部入口，小程序同款）。
 * 容错：用户取消 → 无感回到实时取景；未识别出 → 留在 idle 态展示提示与手动入口。
 */
async function pickFromAlbum() {
  await stop() // 从实时/定格态进入：先停流，识别完按结果决定去向
  const files = await openSystemCapture({ accept: 'image/*', capture: false, multiple: true })
  if (!props.modelValue) return
  if (!files.length) {
    await startInpage()
    return
  }
  const hit = await recognize(files)
  if (hit && props.multiple && detectCaptureCapability().canInpage) await startInpage() // 连扫：回取景继续
}

/** 逐张识别，命中即交付；返回是否至少识别出一条 */
async function recognize(files: File[]): Promise<boolean> {
  phase.value = 'recognizing'
  let hit = false
  for (const f of files) {
    try {
      const res = await scanPhoto(f)
      if (res.length) {
        hit = true
        const fresh = res.filter((c) => !codes.value.includes(c))
        codes.value = [...codes.value, ...fresh]
        res.forEach((c) => emit('scan', c))
      }
    } catch {
      /* 单张识别失败不阻塞下一张 */
    }
  }
  phase.value = 'idle'
  if (!hit) {
    tip.value = t('form.captureNotRecognized')
    emit('error', t('form.captureNotRecognized'))
  } else if (!props.multiple) {
    close()
  }
  return hit
}

/* ════════ 兜底页（卡片内翻页） ════════ */

function openSheet() {
  if (props.modelValue) void stop()
  paused.value = false
  sheetVisible.value = true
  phase.value = 'sheet'
  // 走不到取景的兜底链路（无摄像头/非安全上下文）在这里第一次需要解码器：
  // 提前起模块，用户选完图不再等它（实测冷启动首解 0.84s，4 并发 3.39s，繁忙时更久）
  void warmBarcodeDecoder()
}

const sheetBusy = ref(false)
const sheetError = ref('')

async function onSheetFiles(files: File[]) {
  sheetBusy.value = true
  sheetError.value = ''
  const hit = await recognize(files)
  sheetBusy.value = false
  if (hit) {
    sheetVisible.value = false
    if (!props.multiple) close()
  } else {
    sheetError.value = t('form.captureNotRecognized')
  }
}

/** 手输码是否通过前缀/长度过滤（与扫码 ok() 同一契约，保证字段值形状一致） */
function manualOk(v: string): boolean {
  if (props.prefix && !v.startsWith(props.prefix)) return false
  if (props.length && props.length > 0 && v.length !== props.length) return false
  return true
}

function onSheetSubmit(code: string) {
  if (!manualOk(code)) {
    sheetError.value = t('form.captureManualMismatch')
    return
  }
  codes.value = [...new Set([...codes.value, code])]
  emit('scan', code)
  sheetVisible.value = false
  if (!props.multiple) close()
}

/** 从兜底页返回：还有取流能力就回实时扫描，否则回未启动态（保留「扫码/上传」入口） */
async function onSheetBack() {
  sheetVisible.value = false
  sheetError.value = ''
  if (detectCaptureCapability().canInpage) await startInpage()
  else phase.value = 'idle'
}

/* ════════ 用户操作 ════════ */

/** 底部「重新扫描」：从页面内相机重新开始整条链 */
async function restart() {
  tip.value = ''
  sheetVisible.value = false
  phase.value = 'idle'
  const cap = detectCaptureCapability()
  if (!cap.canInpage) {
    openSheet()
    return
  }
  await startInpage()
}

function pickArrow(text: string) {
  triggerDetection(text)
  resume()
}

function removeCode(i: number) {
  codes.value.splice(i, 1)
}

function close() {
  const final = [...codes.value]
  emit('update:modelValue', false)
  emit('close')
  if (props.multiple && final.length) emit('finish', final)
}

async function teardown() {
  cancelPendingSystemCapture() // 系统采集仍挂着（旧内核无 cancel）时强制按「取消」收尾
  sheetVisible.value = false
  sheetBusy.value = false
  tip.value = ''
  phase.value = 'idle'
  await stop()
}

onUnmounted(() => {
  cancelPendingSystemCapture()
  void stop()
})
</script>

<template>
  <!-- 全屏扫码浮层：布局对标 CameraCapture（黑色全屏 + 4:3 取景居中 + 顶栏/底栏），
       视觉交互对标微信/支付宝小程序扫码页（角框+扫描线+相册/手电筒底栏） -->
  <Teleport to="body">
    <div v-if="props.modelValue" class="codecap-mask" @click.self="close">
      <div ref="stageRef" class="codecap-stage" tabindex="-1" role="dialog" aria-modal="true" :aria-label="title">
        <!-- 顶栏：左关闭 / 中标题（小程序返回键位） -->
        <div class="codecap-topbar">
          <button type="button" class="codecap-iconbtn" :aria-label="t('form.cancel')" @click="close">
            <IconSvg type="x" size="sm" />
          </button>
          <span class="codecap-title" :title="title">{{ title }}</span>
          <span class="codecap-topbar-spacer" />
        </div>

        <!-- 取景区：与 CameraCapture 同尺寸（4:3，宽随屏高收敛）；兜底页在同一区域翻页 -->
        <div class="codecap-viewport" :class="{ 'codecap-viewport--page': sheetVisible }">
          <div v-show="!sheetVisible" class="codecap-live" :class="{ 'is-frozen': paused }">
            <video ref="videoRef" class="codecap-video" autoplay playsinline muted />
            <!-- 实时检测框（点击可改选该码） -->
            <template v-if="!paused">
              <button
                v-for="(d, i) in detections"
                :key="'live-' + i"
                type="button"
                class="codecap-box"
                :class="{ primary: d.primary }"
                :style="boxStyle(d)"
                :title="d.text"
                @click="triggerDetection(d.text)"
              >
                <span class="codecap-box-label" :title="d.text">{{ d.text }}</span>
              </button>
            </template>
            <!-- 多码定格选码 -->
            <template v-else>
              <button
                v-for="(d, i) in detections"
                :key="'frozen-' + i"
                type="button"
                class="codecap-frozen"
                :style="{
                  left: ((d.x + d.width / 2) / (canvasRef?.width || 1)) * 100 + '%',
                  top: ((d.y + d.height / 2) / (canvasRef?.height || 1)) * 100 + '%',
                }"
                :aria-label="'识别 ' + d.text"
                @click="pickArrow(d.text)"
              >
                <span class="codecap-frozen-badge"><IconSvg type="arrow-down" size="sm" color="currentColor" /></span>
                <span class="codecap-frozen-chip" :title="d.text">{{ d.text }}</span>
              </button>
              <div class="codecap-frozen-bar">
                <span>{{ t('form.scanCode') }} · {{ detections.length }}</span>
                <button type="button" @click="resume">{{ t('form.scanResume') }}</button>
              </div>
            </template>
            <span class="codecap-cnr tl" /><span class="codecap-cnr tr" /><span class="codecap-cnr bl" /><span
              class="codecap-cnr br"
            />
            <span v-if="!paused" class="codecap-beam" />
            <!-- 取景提示（定格时让位给冻结条） -->
            <p v-if="!paused && !detections.length" class="codecap-hint">{{ t('form.scanHint') }}</p>
          </div>
          <canvas ref="canvasRef" style="display: none" />

          <!-- 启动中 / 识别中 -->
          <div v-if="!sheetVisible && (phase === 'starting' || phase === 'recognizing')" class="codecap-overlay">
            <span class="codecap-spinner" />
            <span>{{ phase === 'recognizing' ? t('form.captureDecoding') : t('form.scanStarting') }}</span>
          </div>

          <!-- 未启动（已取到结果 / 相机整条不可用时的入口） -->
          <div v-if="!sheetVisible && phase === 'idle'" class="codecap-idle">
            <p v-if="tip" class="codecap-tip">{{ tip }}</p>
            <p v-else class="codecap-tip">{{ t('form.captureFallbackTip') }}</p>
            <div class="codecap-actions">
              <!-- 无取流能力时「扫码」只会把人送回兜底页，与上传按钮等价，不再展示 -->
              <button v-if="canInpage" type="button" class="codecap-btn" @click="restart">
                <IconSvg type="scan" size="sm" />{{ t('form.scanCode') }}
              </button>
              <button type="button" class="codecap-btn" @click="openSheet">
                <IconSvg type="upload" size="sm" />{{ t('form.captureUploadHint') }}
              </button>
            </div>
          </div>

          <!-- 兜底页：上上传组件、下手工输入+重试（同一区域翻页，不叠弹层） -->
          <div v-if="sheetVisible" class="codecap-fallback">
            <CaptureFallbackPanel
              mode="scan"
              :busy="sheetBusy"
              :error="sheetError"
              :hint="tip"
              @files="onSheetFiles"
              @submit="onSheetSubmit"
              @retry="restart"
            />
            <div class="codecap-fallback-foot">
              <button type="button" class="codecap-back" @click="onSheetBack">
                <IconSvg type="arrow-left" size="sm" />{{ t('form.back') }}
              </button>
            </div>
          </div>
        </div>

        <!-- 底部工具栏：相册识别 | 提示占位 | 手电筒（不支持时隐藏，保持三栏平衡） -->
        <div v-if="!sheetVisible" class="codecap-bar">
          <button type="button" class="codecap-tool" @click="pickFromAlbum">
            <IconSvg type="image" size="md" />
            <span>{{ t('form.scanAlbum') }}</span>
          </button>
          <span class="codecap-tool-blank" />
          <button
            v-if="torchSupported"
            type="button"
            class="codecap-tool"
            :class="{ 'is-on': torchOn }"
            :aria-pressed="torchOn"
            @click="toggleTorch"
          >
            <IconSvg type="zap" size="md" />
            <span>{{ t('form.scanTorch') }}</span>
          </button>
          <span v-else class="codecap-tool-blank" />
        </div>

        <!-- 已识别结果：浮在底栏上方（连扫模式回看/删除） -->
        <div v-if="!sheetVisible && codes.length" class="codecap-results">
          <div class="codecap-results-head">
            <span>{{ t('form.scanRecognized') }} · {{ codes.length }}</span>
            <button type="button" @click="codes = []">{{ t('form.scanClear') }}</button>
          </div>
          <ul>
            <li v-for="(c, i) in codes" :key="c">
              <span>{{ c }}</span>
              <button type="button" :aria-label="t('form.delete')" @click="removeCode(i)">
                <IconSvg type="x" size="sm" />
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<!-- 全局样式：浮层 Teleport 到 body，与本库其它浮层一致用前缀类名 -->
<style>
@import './code-capture.css';
</style>
