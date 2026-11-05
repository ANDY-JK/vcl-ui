<script setup lang="ts">
import { ref, computed, nextTick, watch, onUnmounted } from 'vue'
import { useBarcodeScanner } from '@/components/form/utils/useBarcodeScanner'
import { openSystemCapture } from '@/components/form/utils/capture-fallback'
import { beepSuccess, speak, notify, unlockAudio, unlockVoice, CameraCapture } from '@/components/index'
import IconSvg from '@/components/basic/IconSvg.vue'
import Card from '@/components/data/Card.vue'
import ModalBox from '@/components/layout/ModalBox.vue'

// 反馈开关
const soundOn = ref(true)
const voiceOn = ref(false)
const notifyOn = ref(false)

function feedback(code: string) {
  if (soundOn.value) beepSuccess()
  if (voiceOn.value) speak(code)
  if (notifyOn.value) notify('扫码成功', code)
}

// ---- 内嵌实例（唯一一个）：三态等高渐变卡，观感/兜底对齐「小程序通用组件」BarcodeScanner 定版 ----
// formats 分流（通用/仅二维码/仅条形码）实时切换，且决定取景装饰形状（通用不画装饰）
const scanFormat = ref<'all' | 'qr' | 'barcode'>('all')
const allCodes = ref<string[]>([])
const starting1 = ref(false)
/** 卡内反馈胶囊（粘滞显示不横跳，对齐原型 setFeedback） */
const feedback1 = ref('')
let feedbackTimer1: ReturnType<typeof setTimeout> | null = null
function setFeedback1(text: string, holdMs: number, force = false) {
  if (!force && feedback1.value) return
  feedback1.value = text
  if (feedbackTimer1) clearTimeout(feedbackTimer1)
  feedbackTimer1 = setTimeout(() => {
    feedback1.value = ''
    feedbackTimer1 = null
  }, holdMs)
}
const {
  videoRef: v1,
  canvasRef: c1,
  scanning: s1,
  error: e1,
  start: start1,
  stop: stop1,
  torchSupported: torch1,
  torchOn: torchOn1,
  toggleTorch: torchToggle1,
  scanPhoto: photo1,
} = useBarcodeScanner({
  formats: scanFormat,
  onScan: (c) => {
    allCodes.value = [...allCodes.value, c]
    setFeedback1('已识别', 900, true)
  },
})
/** 启动包装：启动期间先挂载相机分支（start 等流回来时 video 必须已存在，否则报未挂载） */
async function toggle1() {
  if (s1.value) {
    feedback1.value = ''
    stop1()
    return
  }
  feedback1.value = ''
  starting1.value = true
  try {
    await start1()
  } finally {
    starting1.value = false
  }
}
/** 取景装饰形状：仅限定单一码型时画（二维码=方形窗、条形码=宽条槽），通用不画——对齐原型 viewShape */
const viewShape = computed<'qr' | 'barcode' | 'none'>(() =>
  scanFormat.value === 'qr' ? 'qr' : scanFormat.value === 'barcode' ? 'barcode' : 'none',
)
/** 触屏才有「系统扫码」（拉系统相机拍一张识别）；桌面用「选图识别」替代 */
const isCoarse1 = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
/** 兜底/选图共用一个隐藏 input：相机不可用就住在卡内（上传识别 + 手输），不弹系统选择器 */
const fallbackInput1 = ref<HTMLInputElement | null>(null)
const fallbackUploading1 = ref(false)
async function recognize1(files: File[]) {
  fallbackUploading1.value = true
  try {
    const fresh: string[] = []
    for (const f of files) {
      try {
        const res = await photo1(f)
        fresh.push(...res.filter((c) => !allCodes.value.includes(c)))
      } catch {
        /* 单张失败不阻塞下一张 */
      }
    }
    if (fresh.length) {
      allCodes.value = [...allCodes.value, ...fresh]
      setFeedback1('已识别', 900, true)
    } else {
      setFeedback1('未识别', 1200, true)
    }
  } finally {
    fallbackUploading1.value = false
  }
}
function onFallbackPicked(e: Event) {
  const el = e.target as HTMLInputElement
  const files = el.files ? [...el.files] : []
  el.value = ''
  if (files.length) void recognize1(files)
}
/** 触屏「系统扫码」：调系统相机拍一张 → 同一引擎识别，结果照常入列 */
async function systemScan1() {
  const files = await openSystemCapture({ accept: 'image/*', capture: 'environment' })
  if (files.length) void recognize1(files)
}
/** 兜底手输：直接入列（demo 未限定 prefix/length） */
const manual1 = ref('')
function submitManual1() {
  const v = manual1.value.trim()
  if (!v) return
  allCodes.value = [...allCodes.value, v]
  manual1.value = ''
  setFeedback1('已提交', 900, true)
}

// ---- 拍照上传 ----
const photoCodes = ref<string[]>([])
const photoScanning = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const photoLast = ref('')
// 拍照不需要摄像头流，用 scanPhoto 就行
const { scanPhoto } = useBarcodeScanner({ prefix: 'S', length: 11 })
async function onPhoto(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  photoScanning.value = true
  try {
    const res = await scanPhoto(f)
    if (res.length) {
      photoCodes.value = [...photoCodes.value, ...res]
      photoLast.value = res[0]
    } else photoLast.value = '未识别'
  } catch {
    photoLast.value = '未识别'
  }
  photoScanning.value = false
  ;(e.target as HTMLInputElement).value = ''
}

// ---- 实例 5：弹窗完整演示 ----
const modalCodes = ref<string[]>([])
const visible = ref(false)
const activeTab = ref<'scan' | 'input' | 'upload'>('scan')
const manualInput = ref('')
const modalPhotoScanning = ref(false)
const modalFileInput = ref<HTMLInputElement | null>(null)
const lastResult = ref('')
const lastValid = ref(true)

const {
  start: start5,
  stop: stop5,
  scanPhoto: scan5,
  scanning: s5,
  error: e5,
  videoRef: v5,
  canvasRef: c5,
  detections: detections5,
  triggerDetection: trigger5,
  paused: paused5,
  pause: pause5,
  resume: resume5,
} = useBarcodeScanner({
  // 不设 prefix/length：任意条码/二维码都能识别（想看过滤效果看上面实例 2/3）
  onScan: (c) => {
    modalCodes.value = [...modalCodes.value, c]
    lastResult.value = c
    lastValid.value = true
    feedback(c)
  },
})

/** 多码定格选码：实时扫描中检测到 ≥2 个码 → 定格画面，每个码留箭头图标，点选识别 */
watch(detections5, (list) => {
  if (!paused5.value && list.length >= 2) pause5()
})
/** 点某个码的箭头 → 识别该码（onScan 入列）→ 恢复实时扫描 */
function pickArrow(text: string) {
  trigger5(text)
  resume5()
}
/** 放弃选码，恢复实时扫描 */
function cancelPick() {
  resume5()
}

/** 检测框 canvas 像素坐标 → 相对 scan-live 容器的百分比定位 */
import type { BarcodeDetection } from '@/components/form/utils/useBarcodeScanner'
function boxStyle(d: BarcodeDetection) {
  const cw = c5.value?.width || 1
  const ch = c5.value?.height || 1
  return {
    left: (d.x / cw) * 100 + '%',
    top: (d.y / ch) * 100 + '%',
    width: (d.width / cw) * 100 + '%',
    height: (d.height / ch) * 100 + '%',
  }
}

/** 选码图标定位：锚在码的中心（箭头尖 + 文字牌整体悬于中心上方） */
function markerStyle(d: BarcodeDetection) {
  const cw = c5.value?.width || 1
  const ch = c5.value?.height || 1
  return {
    left: ((d.x + d.width / 2) / cw) * 100 + '%',
    top: ((d.y + d.height / 2) / ch) * 100 + '%',
  }
}

async function openModal() {
  // 用户手势中解锁音频——之后 onScan 里的蜂鸣/语音才能自由播放
  unlockAudio()
  unlockVoice()
  visible.value = true
  activeTab.value = 'scan'
  lastResult.value = ''
  await nextTick()
  start5()
}
watch(visible, async (v) => {
  if (!v) await stop5()
})
function tabTo(t: typeof activeTab.value) {
  if (activeTab.value === 'scan' && t !== 'scan') stop5()
  else if (t === 'scan' && activeTab.value !== 'scan') lastResult.value = ''
  activeTab.value = t
}
function submitManual() {
  const v = manualInput.value.trim()
  if (!v) return
  modalCodes.value = [...modalCodes.value, v]
  lastResult.value = v
  lastValid.value = true
  manualInput.value = ''
}
function removeCode(idx: number) {
  modalCodes.value.splice(idx, 1)
}
async function onModalPhoto(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  modalPhotoScanning.value = true
  try {
    const res = await scan5(f)
    if (res.length) {
      modalCodes.value = [...modalCodes.value, ...res]
      lastResult.value = res[0]
      lastValid.value = true
    } else {
      lastResult.value = '未识别'
      lastValid.value = false
    }
  } catch {
    lastResult.value = '未识别'
    lastValid.value = false
  }
  modalPhotoScanning.value = false
  ;(e.target as HTMLInputElement).value = ''
}

// ---- CameraCapture 拍照组件 ----
const cameraVisible = ref(false)
const camShotUrl = ref('')
const camShotName = ref('')
const camError = ref('')
function onCamCapture(f: File) {
  if (camShotUrl.value.startsWith('blob:')) URL.revokeObjectURL(camShotUrl.value)
  camShotUrl.value = URL.createObjectURL(f)
  camShotName.value = f.name
  camError.value = ''
}
function onCamError(msg: string) {
  camError.value = msg
}

// 卸载时释放最后一张（#436）：拍照演示页在"再拍一张"时会撤旧的，
// 但用户直接切走/关页时这最后一张就没人管了 —— 一张原图几十 MB。
onUnmounted(() => {
  if (camShotUrl.value.startsWith('blob:')) URL.revokeObjectURL(camShotUrl.value)
})
</script>

<template>
  <div class="demo">
    <h2 class="title">useBarcodeScanner</h2>
    <p class="desc">
      纯 TS composable——消费方自己创建 video / canvas / UI。<br />
      <code>formats</code> 分流二维码/条形码/通用（可实时切换）；<code>prefix</code>/<code>length</code> 做内容过滤。
    </p>

    <!-- 内嵌实例（唯一一个）：三段式等高渐变卡（主块 120px + 底行 44px），观感/兜底对齐
         「小程序通用组件」BarcodeScanner 定版：未开始=卡上取景框入口，启动=相机嵌进同一张卡，
         相机不可用=兜底终态住卡内（上传识别 + 手输行），全程不弹系统选择器。
         取景装饰随 formats 变形：仅二维码=方形窗，仅条形码=宽条槽（横扫线），通用不画。
         与「拍照上传识别」并排一行（省竖向空间），窄屏自动换行 -->
    <div class="hero-row">
      <div class="hero-col">
        <div class="scan-hero">
          <!-- 兜底终态（启动失败/相机不可用）：上传块占主块 + 手输行落底行，卡片高度不变 -->
          <template v-if="!s1 && !starting1 && e1">
            <button
              type="button"
              class="bs-up"
              :class="{ uploading: fallbackUploading1 }"
              :disabled="fallbackUploading1"
              @click="fallbackInput1?.click()"
            >
              <span v-if="fallbackUploading1" class="bs-up-busy"><span class="spinner" /><span>识别中...</span></span>
              <template v-else>
                <IconSvg type="upload" size="md" color="currentColor" />
                <span class="bs-up-text">上传码图片识别</span>
              </template>
            </button>
            <div class="bs-foot">
              <div class="bs-manual">
                <input
                  v-model="manual1"
                  class="bs-manual-input"
                  type="text"
                  placeholder="输入码内容"
                  @keyup.enter="submitManual1"
                />
                <button type="button" class="bs-manual-btn" @click="submitManual1">提交</button>
                <button type="button" class="bs-manual-retry" @click="toggle1">重试</button>
              </div>
            </div>
          </template>

          <!-- 未开始：玻璃面板入口（图标 + 文案 + 副标题同块），底行 = 格式勾选 -->
          <template v-else-if="!s1 && !starting1">
            <button type="button" class="bs-open" @click="toggle1">
              <span class="bs-open-icon" aria-hidden="true">
                <span class="bs-cnr tl" /><span class="bs-cnr tr" /> <span class="bs-cnr bl" /><span
                  class="bs-cnr br"
                />
                <span class="bs-open-line" />
              </span>
              <span class="bs-open-text">开始扫码</span>
              <span class="bs-open-sub">连续扫码 · 扫到即录入，无需退出</span>
            </button>
            <div class="bs-foot">
              <div class="fmt-row" role="radiogroup" aria-label="识别格式">
                <button
                  v-for="f in [
                    { v: 'all', t: '通用' },
                    { v: 'qr', t: '仅二维码' },
                    { v: 'barcode', t: '仅条形码' },
                  ]"
                  :key="f.v"
                  type="button"
                  class="fmt-check"
                  :class="{ checked: scanFormat === f.v }"
                  role="radio"
                  :aria-checked="scanFormat === f.v"
                  @click="scanFormat = f.v as 'all' | 'qr' | 'barcode'"
                >
                  <span class="fmt-check-box" />
                  <span class="fmt-check-text">{{ f.t }}</span>
                </button>
              </div>
            </div>
          </template>

          <!-- 取景态：相机嵌进同一张卡（深色取景块），底行 = 开灯/系统扫码(触屏)/选图识别(桌面)/关闭 -->
          <template v-else>
            <div class="bs-frame">
              <video ref="v1" class="bs-camera" autoplay playsinline muted />
              <canvas ref="c1" style="display: none" />
              <span v-if="starting1" class="bs-idle"><span class="spinner" /><span>启动中...</span></span>
              <!-- 取景装饰：仅单一码型时画（通用不画，只留提示胶囊） -->
              <template v-if="!starting1 && viewShape !== 'none'">
                <span class="bs-shade" />
                <span class="bs-viewbox" :class="`bs-viewbox--${viewShape}`">
                  <span class="bs-cnr tl" /><span class="bs-cnr tr" /> <span class="bs-cnr bl" /><span
                    class="bs-cnr br"
                  />
                  <span class="bs-beam" />
                </span>
              </template>
              <span v-if="!starting1" class="bs-hint">对准条码 · 连续扫码无需退出</span>
              <span v-if="feedback1" class="bs-feedback">{{ feedback1 }}</span>
            </div>
            <div class="bs-foot">
              <div class="bs-actions">
                <button v-if="torch1" type="button" class="bs-action-btn" @click="torchToggle1">
                  {{ torchOn1 ? '关灯' : '开灯' }}
                </button>
                <button v-if="isCoarse1" type="button" class="bs-action-btn" @click="systemScan1">系统扫码</button>
                <button v-else type="button" class="bs-action-btn" @click="fallbackInput1?.click()">选图识别</button>
                <button type="button" class="bs-action-btn bs-action-btn--outline" @click="toggle1">关闭</button>
              </div>
            </div>
          </template>
        </div>
        <!-- 隐藏选图 input：兜底终态/取景态「选图识别」共用（三态常驻，避免互斥态拿不到 ref） -->
        <input ref="fallbackInput1" type="file" accept="image/*" style="display: none" @change="onFallbackPicked" />
        <!-- 结果列表放卡片外：新码入列不撑卡（尺寸恒定） -->
        <div v-if="allCodes.length" class="result result--hero-out">
          已识别 {{ allCodes.length }} 条：{{ allCodes.join(', ') }}
        </div>
      </div>

      <div class="hero-side">
        <!-- 拍照上传 -->
        <Card title="拍照上传识别" title-as="h2">
          <p class="card-hint">用 scanPhoto(file) 识别，不需要摄像头。</p>
          <div class="upload-box" @click="fileInput?.click()">
            <div v-if="photoScanning"><span class="spinner" /><span>识别中...</span></div>
            <template v-else>
              <IconSvg type="camera" size="lg" color="var(--vcl-color-text-muted)" /><span>点击选择照片</span>
            </template>
          </div>
          <input ref="fileInput" type="file" accept="image/*" style="display: none" @change="onPhoto" />
          <div
            v-if="photoLast"
            class="result"
            :style="{ color: photoLast === '未识别' ? 'var(--vcl-color-danger)' : 'var(--vcl-color-text-secondary)' }"
          >
            {{ photoLast }}
          </div>
          <div v-if="photoCodes.length" class="result">共 {{ photoCodes.length }} 条：{{ photoCodes.join(', ') }}</div>
        </Card>
      </div>
    </div>

    <!-- 弹窗演示 -->
    <Card title="弹窗完整演示" title-as="h2" style="margin-top: calc(16px * var(--vcl-scale))">
      <p class="card-hint">
        自定义 modal + tab（扫码/输入/上传）+ 反馈（声音/语音/通知）。
        <b>多码指针</b>：画面里同时出现多个码时，每个码画虚线框、码内容挂在框下方， 离取景框中心最近的框<b
          style="color: #22c55e"
          >绿色高亮</b
        >并自动录入； 点击任意虚线框可改选那个码（扫码器 multiMode 可切 center/manual）。
      </p>
      <div
        style="
          display: flex;
          gap: calc(12px * var(--vcl-scale));
          align-items: center;
          margin-bottom: calc(8px * var(--vcl-scale));
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
        "
      >
        <label style="display: flex; align-items: center; gap: calc(4px * var(--vcl-scale)); cursor: pointer"
          ><input v-model="soundOn" type="checkbox" /> 蜂鸣</label
        >
        <label style="display: flex; align-items: center; gap: calc(4px * var(--vcl-scale)); cursor: pointer"
          ><input v-model="voiceOn" type="checkbox" /> 语音</label
        >
        <label style="display: flex; align-items: center; gap: calc(4px * var(--vcl-scale)); cursor: pointer"
          ><input v-model="notifyOn" type="checkbox" /> 通知</label
        >
      </div>
      <button class="btn" @click="openModal"><IconSvg type="scan" size="sm" /> 打开扫码弹窗</button>
      <span
        v-if="modalCodes.length"
        style="
          margin-left: calc(8px * var(--vcl-scale));
          font-size: calc(13px * var(--vcl-scale));
          color: var(--vcl-color-primary-on-surface);
        "
        >{{ modalCodes.length }} 条</span
      >
    </Card>

    <!-- Modal -->
    <ModalBox v-model:visible="visible" title="扫码" size="sm">
      <template v-if="activeTab === 'scan'">
        <div class="scan-box">
          <div v-if="!s5 && !e5" class="scan-idle"><span class="spinner" /><span>启动摄像头...</span></div>
          <div v-show="s5" class="scan-live" :class="{ 'is-frozen': paused5 }">
            <video ref="v5" class="scan-video" autoplay playsinline muted />
            <!-- 实时扫描中：检测框（primary = 离取景中心最近，自动选中的那个） -->
            <template v-if="!paused5">
              <button
                v-for="(d, i) in detections5"
                :key="'live-' + i"
                type="button"
                class="code-box"
                :class="{ primary: d.primary }"
                :style="boxStyle(d)"
                :title="d.text"
                @click="trigger5(d.text)"
              >
                <span class="code-box-label">{{ d.text }}</span>
              </button>
            </template>
            <!-- 多码定格选码（微信/支付宝式）：动态变静态，每码一个箭头图标，点图标即识别该码 -->
            <template v-else>
              <button
                v-for="(d, i) in detections5"
                :key="'frozen-' + i"
                type="button"
                class="code-marker"
                :style="markerStyle(d)"
                :aria-label="'识别 ' + d.text"
                @click="pickArrow(d.text)"
              >
                <span class="code-marker-badge"><IconSvg type="arrow-down" size="sm" color="currentColor" /></span>
                <span class="code-marker-tip" />
                <span class="code-marker-chip">{{ d.text }}</span>
              </button>
              <div class="frozen-bar">
                已定格 {{ detections5.length }} 个码 — 点击码上的箭头选择要识别的
                <button type="button" class="frozen-resume" @click="cancelPick">重新扫描</button>
              </div>
            </template>
            <span class="mask top" /><span class="mask bot" /><span class="mask left" /><span class="mask right" />
            <span class="cnr tl" /><span class="cnr tr" /><span class="cnr bl" /><span class="cnr br" />
            <span v-if="!paused5" class="beam" />
            <span v-if="!paused5" class="scanning-txt">扫描中</span>
          </div>
          <canvas ref="c5" style="display: none" />
          <div v-if="e5" class="scan-err">
            <p>{{ e5 }}</p>
            <button @click="start5()">重试</button>
          </div>
        </div>
      </template>
      <template v-else-if="activeTab === 'input'">
        <div class="input-area">
          <IconSvg type="edit" size="lg" color="var(--vcl-color-text-muted)" /><input
            v-model="manualInput"
            class="input-big"
            placeholder="输入条码编号回车"
            @keyup.enter="submitManual"
          />
        </div>
      </template>
      <template v-else>
        <div class="upload-box" @click="modalFileInput?.click()">
          <div v-if="modalPhotoScanning"><span class="spinner" /><span>识别中...</span></div>
          <template v-else>
            <IconSvg type="camera" size="lg" color="var(--vcl-color-text-muted)" /><span>点击拍照识别</span>
          </template>
        </div>
        <input ref="modalFileInput" type="file" accept="image/*" style="display: none" @change="onModalPhoto" />
      </template>
      <Transition name="toast-pop">
        <div v-if="lastResult" class="toast" :class="lastValid ? 'ok' : 'fail'">
          <IconSvg :type="lastValid ? 'check' : 'x'" size="sm" /><span>{{ lastResult }}</span
          ><span class="toast-tag">{{ lastValid ? '有效' : '无效' }}</span>
        </div>
      </Transition>
      <div v-if="modalCodes.length" class="code-list">
        <div class="list-head">已扫描 {{ modalCodes.length }} 条</div>
        <ul>
          <li v-for="(c, i) in modalCodes" :key="c">
            {{ c
            }}<button @click="removeCode(i)">
              <IconSvg type="x" size="sm" />
            </button>
          </li>
        </ul>
      </div>
      <div class="tab-bar">
        <button :class="{ active: activeTab === 'scan' }" @click="tabTo('scan')">
          <IconSvg type="scan" size="sm" />扫码
        </button>
        <button :class="{ active: activeTab === 'input' }" @click="tabTo('input')">
          <IconSvg type="edit" size="sm" />输入
        </button>
        <button :class="{ active: activeTab === 'upload' }" @click="tabTo('upload')">
          <IconSvg type="image" size="sm" />上传
        </button>
      </div>
    </ModalBox>

    <!-- CameraCapture 拍照组件 -->
    <Card title="CameraCapture 页面内拍照" title-as="h2" style="margin-top: calc(16px * var(--vcl-scale))">
      <p class="card-hint">
        页面内全屏取景拍照（原生相机布局：中间快门 +
        左右侧键按需显示），不调起系统相机，避免页面切后台被浏览器重建刷新。
      </p>
      <div style="display: flex; align-items: center; gap: calc(12px * var(--vcl-scale)); flex-wrap: wrap">
        <button class="btn" @click="cameraVisible = true">📷 打开拍照</button>
        <span v-if="camShotName" style="font-size: calc(12px * var(--vcl-scale)); color: var(--vcl-color-text-muted)"
          >已拍：{{ camShotName }}</span
        >
        <span v-if="camError" style="font-size: calc(12px * var(--vcl-scale)); color: var(--vcl-color-danger)">{{
          camError
        }}</span>
      </div>
      <img v-if="camShotUrl" :src="camShotUrl" class="cam-shot" alt="拍照结果" />
      <pre
        class="code-block"
        style="margin-top: calc(12px * var(--vcl-scale))"
      ><code>import { CameraCapture } from 'vcl-ui'

const open = ref(false)
const onCapture = (file: File) => { /* file 即拍照结果 */ }

// 模板：&lt;CameraCapture v-model="open" @capture="onCapture" /&gt;</code></pre>
      <table class="doc-table" style="margin-top: calc(12px * var(--vcl-scale))">
        <tbody>
          <tr>
            <th>Props / Emits</th>
            <th>类型</th>
            <th>说明</th>
          </tr>
          <tr>
            <td><code>v-model</code></td>
            <td>boolean</td>
            <td>显隐控制</td>
          </tr>
          <tr>
            <td><code>capture</code></td>
            <td>(file: File)</td>
            <td>确认使用照片时交付 File</td>
          </tr>
          <tr>
            <td><code>error</code></td>
            <td>(msg: string)</td>
            <td>相机不可用（权限/无摄像头/非 HTTPS），调用方决定是否回退</td>
          </tr>
          <tr>
            <td><code>quality</code></td>
            <td>number</td>
            <td>JPEG 质量 0-1，默认 0.9</td>
          </tr>
          <tr>
            <td><code>fallbackOnError</code></td>
            <td>boolean</td>
            <td>页面内相机不可用（权限拒绝/无摄像头/非 HTTPS）时自动降级调起设备系统相机，默认 true</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <!-- 极简代码示例 -->
    <Card title="极简用法" title-as="h2" style="margin-top: calc(16px * var(--vcl-scale))">
      <pre class="code-block"><code>import { useBarcodeScanner } from 'vcl-ui'

const { start, stop, videoRef, canvasRef, scanning, error } = useBarcodeScanner({
  onScan: (code) => console.log('扫到:', code),
})

// 模板：&lt;video ref="videoRef" /&gt; &lt;canvas ref="canvasRef" /&gt;
// start() 开始扫描  stop() 停止</code></pre>
    </Card>

    <Card title="API" title-as="h2" style="margin-top: calc(16px * var(--vcl-scale))">
      <table class="doc-table">
        <tbody>
          <tr>
            <th>Options</th>
            <th>类型</th>
            <th>说明</th>
          </tr>
          <tr>
            <td><code>prefix</code></td>
            <td>string</td>
            <td>条码前缀过滤，不传/空=接受所有</td>
          </tr>
          <tr>
            <td><code>length</code></td>
            <td>number</td>
            <td>条码长度过滤，不传/0=不校验</td>
          </tr>
          <tr>
            <td><code>formats</code></td>
            <td>'all' | 'qr' | 'barcode'（可传 Ref 实时切换）</td>
            <td>识别格式分流：all=二维码+条形码全识别；qr=仅二维码家族；barcode=仅一维条码家族。默认 'all'</td>
          </tr>
          <tr>
            <td><code>onScan</code></td>
            <td>(code: string) => void</td>
            <td>识别到有效条码时回调</td>
          </tr>
        </tbody>
      </table>
      <table class="doc-table" style="margin-top: calc(12px * var(--vcl-scale))">
        <tbody>
          <tr>
            <th>返回</th>
            <th>类型</th>
            <th>说明</th>
          </tr>
          <tr>
            <td><code>start()</code></td>
            <td>Promise</td>
            <td>打开摄像头开始扫描</td>
          </tr>
          <tr>
            <td><code>stop()</code></td>
            <td>Promise</td>
            <td>停止扫描释放摄像头</td>
          </tr>
          <tr>
            <td><code>scanPhoto(file)</code></td>
            <td>Promise&lt;string[]&gt;</td>
            <td>拍照识别，返回条码数组</td>
          </tr>
          <tr>
            <td><code>scanning</code></td>
            <td>Ref&lt;boolean&gt;</td>
            <td>是否正在扫描</td>
          </tr>
          <tr>
            <td><code>error</code></td>
            <td>Ref&lt;string&gt;</td>
            <td>错误信息</td>
          </tr>
          <tr>
            <td><code>videoRef</code></td>
            <td>Ref</td>
            <td>绑定到 &lt;video&gt; 元素</td>
          </tr>
          <tr>
            <td><code>canvasRef</code></td>
            <td>Ref</td>
            <td>绑定到 &lt;canvas&gt; 元素</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <!-- CameraCapture 组件实例 -->
    <CameraCapture v-model="cameraVisible" @capture="onCamCapture" @error="onCamError" />
  </div>
</template>

<style scoped>
.title {
  font-size: calc(22px * var(--vcl-scale));
  font-weight: 700;
  margin-bottom: calc(4px * var(--vcl-scale));
}
.desc {
  color: var(--vcl-color-text-muted);
  margin-bottom: calc(24px * var(--vcl-scale));
  font-size: calc(14px * var(--vcl-scale));
  line-height: 1.6;
}
.card-hint {
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  margin-bottom: calc(12px * var(--vcl-scale));
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: calc(6px * var(--vcl-scale));
  padding: calc(8px * var(--vcl-scale)) calc(16px * var(--vcl-scale));
  border: none;
  border-radius: calc(8px * var(--vcl-scale));
  background: var(--vcl-color-primary);
  color: #fff;
  font-size: calc(13px * var(--vcl-scale));
  cursor: pointer;
  font-family: inherit;
}
.btn:hover {
  background: var(--vcl-color-primary-hover);
}
/* ══════ 渐变扫码卡（对齐「小程序通用组件」BarcodeScanner 定版） ══════
   三段式等高：主块 120px（入口/取景/兜底共用）+ 底行 44px（勾选/操作键/手输行）+ 卡内距。
   紧凑小程序组件风：卡片 336px 与拍照识别卡并排一行；三态结构等高，卡片不跳变 */
.hero-row {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: calc(16px * var(--vcl-scale));
  flex-wrap: wrap;
  margin-bottom: calc(24px * var(--vcl-scale));
}
/* 左列锁扫码卡宽度：识别结果行与卡片对齐 */
.hero-col {
  flex: 0 0 336px;
  max-width: 100%;
}
/* 右列拍照识别卡与扫码卡等宽对称；窄屏换行后自然占满 */
.hero-side {
  flex: 0 0 336px;
  max-width: 100%;
}
/* 上传框矮胶囊（对齐兜底面板选图条形态），不随卡片变宽撑大方块 */
.hero-side .upload-box {
  aspect-ratio: auto;
  min-height: calc(96px * var(--vcl-scale));
  margin: 0 auto calc(8px * var(--vcl-scale));
  padding: calc(12px * var(--vcl-scale));
}
.scan-hero {
  width: calc(336px * var(--vcl-scale));
  max-width: 100%;
  margin: 0 auto;
  padding: calc(8px * var(--vcl-scale));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(5px * var(--vcl-scale));
  background: linear-gradient(160deg, var(--vcl-color-primary) 0%, #6d8cff 100%);
  border-radius: calc(14px * var(--vcl-scale));
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
  box-sizing: border-box;
}
/* ── 主块槽位（120px）：入口 / 取景 / 兜底 上传块共用，三态等高由结构保证 ── */
/* 未开始：玻璃面板入口（取景框 + 主文案 + 副标题同块） */
.bs-open {
  width: 100%;
  height: calc(120px * var(--vcl-scale));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(6px * var(--vcl-scale));
  border: none;
  border-radius: calc(10px * var(--vcl-scale));
  background: rgba(255, 255, 255, 0.14);
  box-shadow: inset 0 1px 8px rgba(255, 255, 255, 0.18);
  cursor: pointer;
  font-family: inherit;
}
.bs-open:hover {
  opacity: 0.9;
}
.bs-open-icon {
  position: relative;
  width: calc(40px * var(--vcl-scale));
  height: calc(40px * var(--vcl-scale));
}
.bs-open-line {
  position: absolute;
  left: calc(3px * var(--vcl-scale));
  right: calc(3px * var(--vcl-scale));
  top: calc(4px * var(--vcl-scale));
  height: 2px;
  border-radius: 1px;
  background: var(--vcl-color-surface);
  box-shadow: 0 0 5px rgba(255, 255, 255, 0.9);
  animation: bs-open-sweep 2.2s ease-in-out infinite;
}
@keyframes bs-open-sweep {
  0% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(32px);
  }
  100% {
    transform: translateY(0);
  }
}
.bs-open-text {
  font-size: calc(16px * var(--vcl-scale));
  font-weight: 600;
  color: #fff;
}
.bs-open-sub {
  max-width: 86%;
  font-size: calc(10px * var(--vcl-scale));
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.85);
  text-align: center;
}
/* 取景块：深色定高，相机嵌进同一张卡 */
.bs-frame {
  position: relative;
  width: 100%;
  height: calc(120px * var(--vcl-scale));
  border-radius: calc(10px * var(--vcl-scale));
  overflow: hidden;
  background: #111827;
}
.bs-camera {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.bs-idle {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(8px * var(--vcl-scale));
  background: #111827;
  color: #fff;
  font-size: calc(12px * var(--vcl-scale));
  z-index: 2;
}
/* 取景装饰（仅单一码型）：压暗遮罩 + 镂空取景窗（形状随码型）+ 绿色辉光扫描线 */
.bs-shade {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  pointer-events: none;
}
.bs-viewbox {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  border-radius: calc(8px * var(--vcl-scale));
  box-shadow: 0 0 0 1000px rgba(0, 0, 0, 0.45);
  pointer-events: none;
}
/* 二维码：方形取景窗（75px 方） */
.bs-viewbox--qr {
  width: calc(75px * var(--vcl-scale));
  height: calc(75px * var(--vcl-scale));
}
/* 条形码：横向长条槽（210×55px），四角只留左右端角，扫描线横贯左右微扫 */
.bs-viewbox--barcode {
  width: calc(210px * var(--vcl-scale));
  max-width: 88%;
  height: calc(55px * var(--vcl-scale));
}
.bs-viewbox--barcode .bs-beam {
  left: calc(4px * var(--vcl-scale));
  right: calc(4px * var(--vcl-scale));
  top: 50%;
  transform: translateY(-50%);
  animation-name: bs-beam-h;
}
.bs-viewbox--barcode .bs-cnr {
  width: calc(15px * var(--vcl-scale));
  height: calc(55px * var(--vcl-scale));
  border-radius: 0;
}
.bs-viewbox--barcode .bs-cnr.tl {
  border-top-width: 2.5px;
  border-left-width: 2.5px;
  border-bottom-width: 2.5px;
  border-top-left-radius: 7px;
  border-bottom-left-radius: 7px;
}
.bs-viewbox--barcode .bs-cnr.tr {
  border-top-width: 2.5px;
  border-right-width: 2.5px;
  border-bottom-width: 2.5px;
  border-top-right-radius: 7px;
  border-bottom-right-radius: 7px;
}
.bs-viewbox--barcode .bs-cnr.bl,
.bs-viewbox--barcode .bs-cnr.br {
  display: none;
}
.bs-cnr {
  position: absolute;
  width: calc(17px * var(--vcl-scale));
  height: calc(17px * var(--vcl-scale));
  border-color: #fff;
  border-style: solid;
  border-width: 0;
  pointer-events: none;
}
.bs-cnr.tl {
  top: 0;
  left: 0;
  border-top-width: 2.5px;
  border-left-width: 2.5px;
  border-top-left-radius: 7px;
}
.bs-cnr.tr {
  top: 0;
  right: 0;
  border-top-width: 2.5px;
  border-right-width: 2.5px;
  border-top-right-radius: 7px;
}
.bs-cnr.bl {
  bottom: 0;
  left: 0;
  border-bottom-width: 2.5px;
  border-left-width: 2.5px;
  border-bottom-left-radius: 7px;
}
.bs-cnr.br {
  bottom: 0;
  right: 0;
  border-bottom-width: 2.5px;
  border-right-width: 2.5px;
  border-bottom-right-radius: 7px;
}
/* 绿色辉光扫描线（SaaS 同款）：二维码态竖扫（行程 59px）；条形码态槽内左右微扫 */
.bs-beam {
  position: absolute;
  left: calc(7px * var(--vcl-scale));
  right: calc(7px * var(--vcl-scale));
  top: calc(7px * var(--vcl-scale));
  height: 2px;
  border-radius: 1px;
  background: rgba(34, 173, 95, 0.9);
  box-shadow: 0 0 6px rgba(34, 173, 95, 0.9);
  pointer-events: none;
  animation: bs-beam 2.2s ease-in-out infinite;
}
@keyframes bs-beam {
  0% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(59px);
  }
  100% {
    transform: translateY(0);
  }
}
@keyframes bs-beam-h {
  0% {
    transform: translateY(-50%) translateX(-1px);
  }
  50% {
    transform: translateY(-50%) translateX(1px);
  }
  100% {
    transform: translateY(-50%) translateX(-1px);
  }
}
/* 顶部提示胶囊 / 底部反馈胶囊（粘滞文案） */
.bs-hint,
.bs-feedback {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  max-width: 90%;
  padding: 2px calc(7px * var(--vcl-scale));
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: calc(9px * var(--vcl-scale));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
.bs-hint {
  top: 2%;
}
.bs-feedback {
  bottom: 8%;
}
/* 兜底终态：上传块占主块（表面底 + 虚线边），识别中盖 spinner */
.bs-up {
  width: 100%;
  height: calc(120px * var(--vcl-scale));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(6px * var(--vcl-scale));
  border: 2px dashed rgba(255, 255, 255, 0.55);
  border-radius: calc(10px * var(--vcl-scale));
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
  font-family: inherit;
}
.bs-up:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}
.bs-up:disabled {
  cursor: wait;
}
.bs-up-text {
  font-size: calc(12px * var(--vcl-scale));
  font-weight: 500;
}
.bs-up-busy {
  display: flex;
  align-items: center;
  gap: calc(6px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
}
/* ── 底行槽位（44px）：格式勾选 / 操作键 / 手输行 三态共用 ── */
.bs-foot {
  width: 100%;
  height: calc(44px * var(--vcl-scale));
}
/* 入口态底行：格式勾选（决定取景装饰形状） */
.fmt-row {
  height: 100%;
  display: flex;
  gap: calc(14px * var(--vcl-scale));
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
}
.fmt-check {
  display: flex;
  align-items: center;
  gap: calc(5px * var(--vcl-scale));
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
}
/* 勾选框对齐原型 .bs-check：选中＝白底 + 主色内描边（实心方，不手画对勾笔画） */
.fmt-check-box {
  position: relative;
  box-sizing: border-box;
  width: calc(16px * var(--vcl-scale));
  height: calc(16px * var(--vcl-scale));
  border-radius: calc(4px * var(--vcl-scale));
  border: 1.5px solid rgba(255, 255, 255, 0.85);
  transition:
    background var(--vcl-transition-fast),
    box-shadow var(--vcl-transition-fast);
}
.fmt-check.checked .fmt-check-box {
  background: var(--vcl-color-surface);
  border-color: #fff;
  box-shadow: inset 0 0 0 3px var(--vcl-color-primary);
}
.fmt-check-text {
  font-size: calc(11px * var(--vcl-scale));
  color: rgba(255, 255, 255, 0.92);
}
.fmt-check.checked .fmt-check-text {
  color: #fff;
  font-weight: 600;
}
/* 取景态底行：三枚等宽矩形键占满一行（规格对齐兜底手输行，渐变卡上半透明白） */
.bs-actions {
  width: 100%;
  height: 100%;
  display: flex;
  gap: calc(6px * var(--vcl-scale));
}
.bs-action-btn {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: calc(6px * var(--vcl-scale));
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: calc(11px * var(--vcl-scale));
  font-family: inherit;
  cursor: pointer;
}
.bs-action-btn:hover {
  background: rgba(255, 255, 255, 0.26);
}
.bs-action-btn--outline {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.55);
}
.bs-action-btn--outline:hover {
  background: rgba(255, 255, 255, 0.12);
}
/* 兜底终态底行：手输行（输入框 + 提交 + 重试，等高 44px） */
.bs-manual {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  gap: calc(6px * var(--vcl-scale));
}
.bs-manual-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
  padding: 0 calc(10px * var(--vcl-scale));
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: calc(6px * var(--vcl-scale));
  background: var(--vcl-color-surface);
  color: var(--vcl-color-text);
  font-size: calc(13px * var(--vcl-scale));
  font-family: inherit;
  outline: none;
}
.bs-manual-input::placeholder {
  color: var(--vcl-color-text-muted);
}
.bs-manual-btn {
  flex-shrink: 0;
  width: calc(56px * var(--vcl-scale));
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: calc(6px * var(--vcl-scale));
  background: var(--vcl-color-primary);
  color: #fff;
  font-size: calc(12px * var(--vcl-scale));
  font-family: inherit;
  cursor: pointer;
}
.bs-manual-btn:hover {
  background: var(--vcl-color-primary-hover);
}
.bs-manual-retry {
  flex-shrink: 0;
  width: calc(56px * var(--vcl-scale));
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: calc(6px * var(--vcl-scale));
  background: transparent;
  color: #fff;
  font-size: calc(12px * var(--vcl-scale));
  font-family: inherit;
  cursor: pointer;
}
.bs-manual-retry:hover {
  background: rgba(255, 255, 255, 0.12);
}
.result--hero-out {
  width: calc(336px * var(--vcl-scale));
  max-width: 100%;
  margin: calc(8px * var(--vcl-scale)) auto 0;
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-text-secondary);
  background: var(--vcl-color-bg-alt);
  border-radius: calc(10px * var(--vcl-scale));
  padding: calc(8px * var(--vcl-scale)) calc(12px * var(--vcl-scale));
  box-sizing: border-box;
  word-break: break-all;
}
.result {
  margin-top: calc(8px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
  color: var(--vcl-color-text-secondary);
  word-break: break-all;
  max-height: calc(48px * var(--vcl-scale));
  overflow-y: auto;
}

/* 扫描区 */
.scan-box {
  position: relative;
  width: 100%;
  aspect-ratio: 4/3;
  border-radius: calc(10px * var(--vcl-scale));
  overflow: hidden;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: calc(8px * var(--vcl-scale));
}
.scan-idle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(6px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  font-size: calc(12px * var(--vcl-scale));
}
.scan-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.scan-live {
  position: absolute;
  inset: 0;
}
.scan-err {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(6px * var(--vcl-scale));
  color: var(--vcl-color-warning);
  font-size: calc(12px * var(--vcl-scale));
  padding: calc(12px * var(--vcl-scale));
  text-align: center;
}
.scan-err button {
  padding: calc(4px * var(--vcl-scale)) calc(12px * var(--vcl-scale));
  border: 1px solid var(--vcl-color-warning);
  border-radius: calc(6px * var(--vcl-scale));
  background: var(--vcl-color-surface);
  color: var(--vcl-color-warning-text);
  font-size: calc(12px * var(--vcl-scale));
  cursor: pointer;
  font-family: inherit;
}
.scanning-txt {
  position: absolute;
  bottom: calc(12px * var(--vcl-scale));
  left: 50%;
  transform: translateX(-50%);
  font-size: calc(11px * var(--vcl-scale));
  color: #22c55e;
  background: rgba(0, 0, 0, 0.45);
  padding: 2px calc(8px * var(--vcl-scale));
  border-radius: calc(8px * var(--vcl-scale));
  pointer-events: none;
  animation: pulse 1.5s ease-in-out infinite;
}
/* 多码检测框：虚线框 + 码文本标签；primary = 自动选中的（实线高亮） */
.code-box {
  position: absolute;
  border: 2px dashed rgba(255, 255, 255, 0.75);
  background: rgba(0, 0, 0, 0.12);
  cursor: pointer;
  z-index: 3;
  padding: 0;
}
.code-box.primary {
  border: 2px solid #22c55e;
}
.code-box-label {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 2px;
  font-size: calc(10px * var(--vcl-scale));
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  padding: 1px calc(5px * var(--vcl-scale));
  border-radius: calc(4px * var(--vcl-scale));
  white-space: nowrap;
  max-width: 200%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.code-box.primary .code-box-label {
  background: #22c55e;
  color: var(--vcl-color-success-text);
}
/* ══════ 定格选码态 ══════ */
/* 画面压暗：与实时态明确区分，选框/箭头在暗底上更醒目 */
.scan-live.is-frozen .scan-video {
  filter: brightness(0.62) saturate(0.85);
}
.scan-live.is-frozen .beam,
.scan-live.is-frozen .scanning-txt {
  display: none;
}
/* 选码图标（微信/支付宝式）：箭头徽章 + 下箭头尖 + 码文本牌，整体锚在码中心，
   尖端落在码中心点上；整体为点击目标 */
.code-marker {
  position: absolute;
  transform: translate(-50%, calc(-100% - 6px));
  display: flex;
  flex-direction: column;
  align-items: center;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  z-index: 4;
  font-family: inherit;
}
.code-marker-badge {
  width: calc(30px * var(--vcl-scale));
  height: calc(30px * var(--vcl-scale));
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #22c55e;
  color: var(--vcl-color-success-text);
  box-shadow:
    var(--vcl-shadow-md),
    0 0 0 2px rgba(255, 255, 255, 0.85);
  transition:
    background var(--vcl-transition-fast),
    transform var(--vcl-transition-fast);
}
/* 徽章下的箭头尖：指向码中心 */
.code-marker-tip {
  width: 0;
  height: 0;
  border: 6px solid transparent;
  border-top-color: #22c55e;
  margin-top: -1px;
}
/* 码文本牌：紧跟箭头尖下方，方便确认要识别的是哪个 */
.code-marker-chip {
  margin-top: calc(6px * var(--vcl-scale));
  max-width: calc(150px * var(--vcl-scale));
  font-size: calc(11px * var(--vcl-scale));
  color: #fff;
  background: rgba(0, 0, 0, 0.65);
  padding: 2px calc(7px * var(--vcl-scale));
  border-radius: calc(5px * var(--vcl-scale));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.code-marker:hover .code-marker-badge,
.code-marker:focus-visible .code-marker-badge {
  background: #16a34a;
  color: #fff;
  transform: scale(1.15);
}
.code-marker:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
/* 定格提示条 */
.frozen-bar {
  position: absolute;
  bottom: calc(12px * var(--vcl-scale));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: calc(8px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
  color: #fff;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(6px);
  padding: calc(5px * var(--vcl-scale)) calc(12px * var(--vcl-scale));
  border-radius: 999px;
  z-index: 4;
  white-space: nowrap;
}
.frozen-resume {
  border: none;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: calc(12px * var(--vcl-scale));
  padding: calc(3px * var(--vcl-scale)) calc(10px * var(--vcl-scale));
  border-radius: 999px;
  cursor: pointer;
}
.frozen-resume:hover {
  background: var(--vcl-color-primary);
}
.mask {
  position: absolute;
  background: rgba(0, 0, 0, 0.35);
  pointer-events: none;
  z-index: 1;
}
.mask.top {
  top: 0;
  left: 0;
  right: 0;
  height: 35%;
}
.mask.bot {
  bottom: 0;
  left: 0;
  right: 0;
  height: 35%;
}
.mask.left {
  top: 35%;
  left: 0;
  width: 17.5%;
  bottom: 35%;
}
.mask.right {
  top: 35%;
  right: 0;
  width: 17.5%;
  bottom: 35%;
}
.cnr {
  position: absolute;
  width: calc(18px * var(--vcl-scale));
  height: calc(18px * var(--vcl-scale));
  border-color: var(--vcl-color-primary);
  border-style: solid;
  pointer-events: none;
  z-index: 2;
}
.cnr.tl {
  top: calc(35% + 8px * var(--vcl-scale));
  left: calc(17.5% + 8px * var(--vcl-scale));
  border-width: 2px 0 0 2px;
  border-radius: calc(3px * var(--vcl-scale)) 0 0 0;
}
.cnr.tr {
  top: calc(35% + 8px * var(--vcl-scale));
  right: calc(17.5% + 8px * var(--vcl-scale));
  border-width: 2px 2px 0 0;
  border-radius: 0 calc(3px * var(--vcl-scale)) 0 0;
}
.cnr.bl {
  bottom: calc(35% + 8px * var(--vcl-scale));
  left: calc(17.5% + 8px * var(--vcl-scale));
  border-width: 0 0 2px 2px;
  border-radius: 0 0 0 calc(3px * var(--vcl-scale));
}
.cnr.br {
  bottom: calc(35% + 8px * var(--vcl-scale));
  right: calc(17.5% + 8px * var(--vcl-scale));
  border-width: 0 2px 2px 0;
  border-radius: 0 0 calc(3px * var(--vcl-scale)) 0;
}
.beam {
  position: absolute;
  left: 17.5%;
  right: 17.5%;
  height: 2px;
  background: var(--vcl-color-primary);
  opacity: 0.5;
  pointer-events: none;
  z-index: 2;
  animation: beam-sweep 2s ease-in-out infinite;
  box-shadow: 0 0 4px var(--vcl-color-primary);
  top: 35%;
}
@keyframes beam-sweep {
  0% {
    top: 35%;
  }
  50% {
    top: 65%;
  }
  100% {
    top: 35%;
  }
}
@keyframes pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}
.spinner {
  width: calc(24px * var(--vcl-scale));
  height: calc(24px * var(--vcl-scale));
  border: 3px solid var(--vcl-color-border-light);
  border-top-color: var(--vcl-color-primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 上传 */
.upload-box {
  width: 100%;
  aspect-ratio: 4/3;
  border-radius: calc(10px * var(--vcl-scale));
  background: var(--vcl-color-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(8px * var(--vcl-scale));
  cursor: pointer;
  border: 2px dashed var(--vcl-color-border);
  font-size: calc(12px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  margin-bottom: calc(8px * var(--vcl-scale));
}
.upload-box:active {
  transform: scale(0.98);
}

/* CameraCapture 拍照结果缩略图 */
.cam-shot {
  width: 100%;
  max-width: calc(360px * var(--vcl-scale));
  aspect-ratio: 4/3;
  object-fit: cover;
  border-radius: calc(10px * var(--vcl-scale));
  margin-top: calc(12px * var(--vcl-scale));
  border: 1px solid var(--vcl-color-border);
}

/* 输入 */
.input-area {
  width: 100%;
  aspect-ratio: 4/3;
  border-radius: calc(10px * var(--vcl-scale));
  background: var(--vcl-color-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(16px * var(--vcl-scale));
  padding: calc(16px * var(--vcl-scale));
}
.input-big {
  width: 100%;
  max-width: calc(280px * var(--vcl-scale));
  padding: calc(12px * var(--vcl-scale)) calc(16px * var(--vcl-scale));
  border: 2px solid var(--vcl-color-primary);
  border-radius: calc(8px * var(--vcl-scale));
  font-size: calc(18px * var(--vcl-scale));
  font-family: monospace;
  letter-spacing: 1px;
  text-align: center;
  outline: none;
  color: var(--vcl-color-text);
  background: var(--vcl-color-surface);
}
.input-big:focus {
  box-shadow: 0 0 0 3px var(--vcl-color-primary-light);
}
.modal-box .upload-box {
  margin-bottom: 0;
}

/* toast */
.toast {
  display: flex;
  align-items: center;
  gap: calc(8px * var(--vcl-scale));
  margin-top: calc(12px * var(--vcl-scale));
  padding: calc(6px * var(--vcl-scale)) calc(12px * var(--vcl-scale));
  border-radius: calc(8px * var(--vcl-scale));
  font-size: calc(13px * var(--vcl-scale));
  max-width: 100%;
  overflow: hidden;
}
.toast-tag {
  font-size: calc(11px * var(--vcl-scale));
  opacity: 0.7;
  flex-shrink: 0;
  margin-left: auto;
}
.toast.ok {
  background: var(--vcl-color-success-bg);
  color: var(--vcl-color-success-text);
}
.toast.fail {
  background: var(--vcl-color-danger-bg);
  color: var(--vcl-color-danger);
}
.toast-pop-enter-active {
  animation: p-in 0.25s ease-out;
}
.toast-pop-leave-active {
  animation: p-in 0.2s ease-in reverse;
}
@keyframes p-in {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.96);
  }
}

/* 列表 */
.code-list {
  padding: 0 calc(16px * var(--vcl-scale));
  max-height: calc(160px * var(--vcl-scale));
  overflow-y: auto;
  border-top: 1px solid var(--vcl-color-border-light);
  padding-top: calc(12px * var(--vcl-scale));
}
.list-head {
  font-size: calc(13px * var(--vcl-scale));
  font-weight: 500;
  color: var(--vcl-color-text-secondary);
  margin-bottom: calc(8px * var(--vcl-scale));
}
.code-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.code-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(6px * var(--vcl-scale)) calc(12px * var(--vcl-scale));
  border-radius: calc(6px * var(--vcl-scale));
  font-size: calc(13px * var(--vcl-scale));
  font-family: monospace;
}
.code-list li:nth-child(odd) {
  background: var(--vcl-color-bg);
}
.code-list li button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(28px * var(--vcl-scale));
  height: calc(28px * var(--vcl-scale));
  border: none;
  border-radius: calc(6px * var(--vcl-scale));
  background: transparent;
  color: var(--vcl-color-text-muted);
  cursor: pointer;
}
.code-list li button:hover {
  background: var(--vcl-color-danger-bg);
  color: var(--vcl-color-danger);
}

/* 标签栏 */
.tab-bar {
  display: flex;
  border-top: 1px solid var(--vcl-color-border-light);
}
.tab-bar button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(4px * var(--vcl-scale));
  padding: calc(12px * var(--vcl-scale)) 0;
  border: none;
  background: transparent;
  color: var(--vcl-color-text-muted);
  font-size: calc(13px * var(--vcl-scale));
  cursor: pointer;
  font-family: inherit;
}
.tab-bar button.active {
  color: var(--vcl-color-primary-on-surface);
}
.tab-bar button:active {
  transform: scale(0.95);
}

/* 代码块 */
.code-block {
  background: var(--vcl-color-bg);
  padding: calc(12px * var(--vcl-scale)) calc(16px * var(--vcl-scale));
  border-radius: calc(8px * var(--vcl-scale));
  font-size: calc(13px * var(--vcl-scale));
  line-height: 1.8;
  overflow-x: auto;
  margin: 0;
}
.code-block code {
  font-family: monospace;
}

/* 文档 */
.doc-table {
  width: 100%;
  font-size: calc(13px * var(--vcl-scale));
  border-collapse: collapse;
}
.doc-table th {
  text-align: left;
  padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
  border-bottom: 2px solid var(--vcl-color-border);
}
.doc-table td {
  padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
  border-bottom: 1px solid var(--vcl-color-border-light);
}
.doc-table tr:last-child td {
  border-bottom: none;
}
</style>
