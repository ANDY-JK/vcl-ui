<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useBarcodeScanner } from '@/components/form/utils/useBarcodeScanner'
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

// ---- 内嵌实例（唯一一个）：formats 分流 通用/仅二维码/仅条形码，Ref 实时切换不用重启 ----
const scanFormat = ref<'all' | 'qr' | 'barcode'>('all')
const allCodes = ref<string[]>([])
const starting1 = ref(false)
const {
  videoRef: v1,
  canvasRef: c1,
  scanning: s1,
  error: e1,
  start: start1,
  stop: stop1,
} = useBarcodeScanner({
  formats: scanFormat,
  onScan: (c) => (allCodes.value = [...allCodes.value, c]),
})
/** 启动包装：启动期间先挂载相机分支（start 等流回来时 video 必须已存在，否则报未挂载） */
async function toggle1() {
  if (s1.value) {
    stop1()
    return
  }
  starting1.value = true
  try {
    await start1()
  } finally {
    starting1.value = false
  }
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
</script>

<template>
  <div class="demo">
    <h2 class="title">useBarcodeScanner</h2>
    <p class="desc">
      纯 TS composable——消费方自己创建 video / canvas / UI。<br />
      <code>formats</code> 分流二维码/条形码/通用（可实时切换）；<code>prefix</code>/<code>length</code> 做内容过滤。
    </p>

    <!-- 内嵌实例（唯一一个）：saas 小程序同款渐变卡片，未启动=入口按钮，启动=相机嵌卡；
         入口按钮与相机框同尺寸 + 停止条槽位隐形占位 → 三态卡片尺寸恒定不跳变 -->
    <div class="scan-hero">
      <template v-if="!s1 && !starting1">
        <button type="button" class="scan-open" @click="toggle1">
          <span class="scan-open-icon" aria-hidden="true">
            <span class="scan-corner tl" /><span class="scan-corner tr" />
            <span class="scan-corner bl" /><span class="scan-corner br" />
            <span class="scan-line" />
          </span>
          <span class="scan-open-text">开始扫码</span>
        </button>
        <button type="button" v-if="e1" class="scan-err scan-err--on-hero" @click="toggle1">
          {{ e1 }} · 点击重试
        </button>
        <button v-else type="button" class="scan-exit scan-exit--ghost" aria-hidden="true" tabindex="-1">
          停止扫码
        </button>
      </template>
      <template v-else>
        <div class="scan-inline">
          <div class="scan-box scan-box--embedded">
            <div class="scan-live">
              <video ref="v1" class="scan-video" autoplay playsinline muted />
              <span v-if="starting1" class="scan-starting"><span class="spinner" /><span>启动中...</span></span>
            </div>
            <canvas ref="c1" style="display: none" />
          </div>
          <button type="button" class="scan-exit" @click="toggle1">停止扫码</button>
        </div>
      </template>
      <!-- 格式分流：白字自绘勾选，融在渐变卡内（saas scan-auto 式） -->
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
      <div class="scan-sub">扫描串码 / 条码 · 切换格式实时生效</div>
    </div>
    <!-- 结果列表放卡片外：新码入列不撑卡（尺寸恒定） -->
    <div v-if="allCodes.length" class="result result--hero-out">
      已识别 {{ allCodes.length }} 条：{{ allCodes.join(', ') }}
    </div>

    <div class="grid-4">
      <!-- 拍照上传 -->
      <Card title="拍照上传识别">
        <p class="card-hint">用 scanPhoto(file) 识别，不需要摄像头。</p>
        <div class="upload-box" @click="fileInput?.click()">
          <div v-if="photoScanning"><span class="spinner" /><span>识别中...</span></div>
          <template v-else>
            <IconSvg type="camera" size="lg" color="var(--color-text-muted)" /><span>点击选择照片</span>
          </template>
        </div>
        <input ref="fileInput" type="file" accept="image/*" style="display: none" @change="onPhoto" />
        <div
          v-if="photoLast"
          class="result"
          :style="{ color: photoLast === '未识别' ? 'var(--color-danger)' : 'var(--color-text-secondary)' }"
        >
          {{ photoLast }}
        </div>
        <div v-if="photoCodes.length" class="result">共 {{ photoCodes.length }} 条：{{ photoCodes.join(', ') }}</div>
      </Card>
    </div>

    <!-- 弹窗演示 -->
    <Card title="弹窗完整演示" style="margin-top: 16px">
      <p class="card-hint">
        自定义 modal + tab（扫码/输入/上传）+ 反馈（声音/语音/通知）。
        <b>多码指针</b>：画面里同时出现多个码时，每个码画虚线框、码内容挂在框下方，
        离取景框中心最近的框<b style="color: #22c55e">绿色高亮</b>并自动录入；
        点击任意虚线框可改选那个码（扫码器 multiMode 可切 center/manual）。
      </p>
      <div
        style="
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 8px;
          font-size: 12px;
          color: var(--color-text-muted);
        "
      >
        <label style="display: flex; align-items: center; gap: 4px; cursor: pointer"><input v-model="soundOn" type="checkbox" /> 蜂鸣</label>
        <label style="display: flex; align-items: center; gap: 4px; cursor: pointer"><input v-model="voiceOn" type="checkbox" /> 语音</label>
        <label style="display: flex; align-items: center; gap: 4px; cursor: pointer"><input v-model="notifyOn" type="checkbox" /> 通知</label>
      </div>
      <button class="btn" @click="openModal"><IconSvg type="scan" size="sm" /> 打开扫码弹窗</button>
      <span v-if="modalCodes.length" style="margin-left: 8px; font-size: 13px; color: var(--color-primary)">{{ modalCodes.length }} 条</span>
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
            <span class="mask top" /><span class="mask bot" /><span class="mask left" /><span
              class="mask right"
            />
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
          <IconSvg type="edit" size="lg" color="var(--color-text-muted)" /><input
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
            <IconSvg type="camera" size="lg" color="var(--color-text-muted)" /><span>点击拍照识别</span>
          </template>
        </div>
        <input ref="modalFileInput" type="file" accept="image/*" style="display: none" @change="onModalPhoto" />
      </template>
      <Transition name="toast-pop">
        <div v-if="lastResult" class="toast" :class="lastValid ? 'ok' : 'fail'">
          <IconSvg :type="lastValid ? 'check' : 'x'" size="sm" /><span>{{ lastResult }}</span><span class="toast-tag">{{ lastValid ? '有效' : '无效' }}</span>
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
    <Card title="CameraCapture 页面内拍照" style="margin-top: 16px">
      <p class="card-hint">
        页面内全屏取景拍照（原生相机布局：中间快门 +
        左右侧键按需显示），不调起系统相机，避免页面切后台被浏览器重建刷新。
      </p>
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap">
        <button class="btn" @click="cameraVisible = true">📷 打开拍照</button>
        <span v-if="camShotName" style="font-size: 12px; color: var(--color-text-muted)">已拍：{{ camShotName }}</span>
        <span v-if="camError" style="font-size: 12px; color: var(--color-danger)">{{ camError }}</span>
      </div>
      <img v-if="camShotUrl" :src="camShotUrl" class="cam-shot" alt="拍照结果" />
      <pre class="code-block" style="margin-top: 12px"><code>import { CameraCapture } from 'vcl-ui'

const open = ref(false)
const onCapture = (file: File) => { /* file 即拍照结果 */ }

// 模板：&lt;CameraCapture v-model="open" @capture="onCapture" /&gt;</code></pre>
      <table class="doc-table" style="margin-top: 12px">
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
    <Card title="极简用法" style="margin-top: 16px">
      <pre class="code-block"><code>import { useBarcodeScanner } from 'vcl-ui'

const { start, stop, videoRef, canvasRef, scanning, error } = useBarcodeScanner({
  onScan: (code) => console.log('扫到:', code),
})

// 模板：&lt;video ref="videoRef" /&gt; &lt;canvas ref="canvasRef" /&gt;
// start() 开始扫描  stop() 停止</code></pre>
    </Card>

    <Card title="API" style="margin-top: 16px">
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
      <table class="doc-table" style="margin-top: 12px">
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
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;
}
.desc {
  color: var(--color-text-muted);
  margin-bottom: 24px;
  font-size: 14px;
  line-height: 1.6;
}
.card-hint {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-bottom: 12px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}
.btn:hover {
  background: var(--color-primary-hover);
}
/* 内嵌实例（非四列栅格时防止撑满整页）：取景框限制在常见扫码器尺寸 */
/* 提权选择器：基础 .scan-box 定义在后面（width:100%），双类名保证 360px 稳定生效 */
.scan-box.scan-box--embedded {
  width: 360px;
  max-width: 100%;
  margin: 0 auto;
}
/* ══════ saas 小程序同款渐变扫码卡 ══════
   对齐 mp-app/pages/tenant/scan.vue：主色渐变卡 + 入口按钮态/相机嵌卡态 + 白字勾选
   尺寸恒定：三态共用同一内容宽（360px 取景区）与同高的停止条槽位，卡片不跳变 */
.scan-hero {
  margin-bottom: 24px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: linear-gradient(160deg, var(--color-primary) 0%, #6d8cff 100%);
  border-radius: 14px;
}
/* 入口按钮 = 相机取景区的同尺寸占位（360×270），切换状态时卡片尺寸不变 */
.scan-open {
  width: 360px;
  max-width: 100%;
  height: 270px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.14);
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.35);
  cursor: pointer;
  font-family: inherit;
}
.scan-open:hover {
  background: rgba(255, 255, 255, 0.22);
}
.scan-open-icon {
  position: relative;
  width: 56px;
  height: 56px;
}
.scan-corner {
  position: absolute;
  width: 16px;
  height: 16px;
  border-color: #fff;
  border-style: solid;
  border-width: 0;
}
.scan-corner.tl {
  top: 0;
  left: 0;
  border-top-width: 2.5px;
  border-left-width: 2.5px;
  border-top-left-radius: 5px;
}
.scan-corner.tr {
  top: 0;
  right: 0;
  border-top-width: 2.5px;
  border-right-width: 2.5px;
  border-top-right-radius: 5px;
}
.scan-corner.bl {
  bottom: 0;
  left: 0;
  border-bottom-width: 2.5px;
  border-left-width: 2.5px;
  border-bottom-left-radius: 5px;
}
.scan-corner.br {
  bottom: 0;
  right: 0;
  border-bottom-width: 2.5px;
  border-right-width: 2.5px;
  border-bottom-right-radius: 5px;
}
.scan-line {
  position: absolute;
  left: 3px;
  right: 3px;
  top: 4px;
  height: 2px;
  border-radius: 1px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 0 5px rgba(255, 255, 255, 0.9);
  animation: scan-sweep 2.2s ease-in-out infinite;
}
@keyframes scan-sweep {
  0% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(38px);
  }
  100% {
    transform: translateY(0);
  }
}
.scan-open-text {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}
.scan-inline {
  width: 100%;
}
.scan-exit {
  width: 360px;
  max-width: 100%;
  margin: 8px auto 0;
  padding: 9px 0;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  font-family: inherit;
}
.scan-exit:hover {
  background: rgba(255, 255, 255, 0.32);
}
/* 隐形占位：未启动态保留停止条槽位，切态时卡片尺寸不跳变 */
.scan-exit--ghost {
  visibility: hidden;
  cursor: default;
}
.scan-exit--ghost:hover {
  background: rgba(255, 255, 255, 0.22);
}
/* 启动中：相机框内遮罩提示 */
.scan-starting {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 13px;
  z-index: 2;
}
.fmt-row {
  display: flex;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
}
.fmt-check {
  display: flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
}
.fmt-check-box {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.25);
  border: 1.5px solid rgba(255, 255, 255, 0.85);
  transition: background var(--transition-fast);
}
.fmt-check.checked .fmt-check-box {
  background: #fff;
}
.fmt-check.checked .fmt-check-box::after {
  content: '✓';
  display: block;
  font-size: 10px;
  line-height: 11px;
  color: var(--color-primary);
  text-align: center;
}
.fmt-check-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.92);
}
.fmt-check.checked .fmt-check-text {
  color: #fff;
  font-weight: 600;
}
.scan-sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  text-align: center;
}
/* 报错行与停止条同槽位同尺寸（360×35 单行胶囊）→ 出错也不跳卡 */
.scan-err--on-hero {
  width: 360px;
  max-width: 100%;
  height: 35px;
  margin: 8px auto 0;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.result--hero-out {
  margin: -14px 0 24px;
  font-size: 13px;
  color: var(--color-text-secondary);
  background: var(--color-bg-alt);
  border-radius: 10px;
  padding: 8px 12px;
  word-break: break-all;
}
.grid-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
@media (max-width: 1024px) {
  .grid-4 {
    grid-template-columns: repeat(2, 1fr);
  }
}
.result {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  word-break: break-all;
  max-height: 48px;
  overflow-y: auto;
}

/* 扫描区 */
.scan-box {
  position: relative;
  width: 100%;
  aspect-ratio: 4/3;
  border-radius: 10px;
  overflow: hidden;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}
.scan-idle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--color-text-muted);
  font-size: 12px;
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
  gap: 6px;
  color: var(--color-warning);
  font-size: 12px;
  padding: 12px;
  text-align: center;
}
.scan-err button {
  padding: 4px 12px;
  border: 1px solid var(--color-warning);
  border-radius: 6px;
  background: #fff;
  color: var(--color-warning-text);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.scanning-txt {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: #22c55e;
  background: rgba(0, 0, 0, 0.45);
  padding: 2px 8px;
  border-radius: 8px;
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
  font-size: 10px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  padding: 1px 5px;
  border-radius: 4px;
  white-space: nowrap;
  max-width: 200%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.code-box.primary .code-box-label {
  background: #22c55e;
  color: #052e16;
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
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #22c55e;
  color: #052e16;
  box-shadow:
    var(--shadow-md),
    0 0 0 2px rgba(255, 255, 255, 0.85);
  transition:
    background var(--transition-fast),
    transform var(--transition-fast);
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
  margin-top: 6px;
  max-width: 150px;
  font-size: 11px;
  color: #fff;
  background: rgba(0, 0, 0, 0.65);
  padding: 2px 7px;
  border-radius: 5px;
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
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #fff;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(6px);
  padding: 5px 12px;
  border-radius: 999px;
  z-index: 4;
  white-space: nowrap;
}
.frozen-resume {
  border: none;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  cursor: pointer;
}
.frozen-resume:hover {
  background: var(--color-primary);
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
  width: 18px;
  height: 18px;
  border-color: var(--color-primary);
  border-style: solid;
  pointer-events: none;
  z-index: 2;
}
.cnr.tl {
  top: calc(35% + 8px);
  left: calc(17.5% + 8px);
  border-width: 2px 0 0 2px;
  border-radius: 3px 0 0 0;
}
.cnr.tr {
  top: calc(35% + 8px);
  right: calc(17.5% + 8px);
  border-width: 2px 2px 0 0;
  border-radius: 0 3px 0 0;
}
.cnr.bl {
  bottom: calc(35% + 8px);
  left: calc(17.5% + 8px);
  border-width: 0 0 2px 2px;
  border-radius: 0 0 0 3px;
}
.cnr.br {
  bottom: calc(35% + 8px);
  right: calc(17.5% + 8px);
  border-width: 0 2px 2px 0;
  border-radius: 0 0 3px 0;
}
.beam {
  position: absolute;
  left: 17.5%;
  right: 17.5%;
  height: 2px;
  background: var(--color-primary);
  opacity: 0.5;
  pointer-events: none;
  z-index: 2;
  animation: beam-sweep 2s ease-in-out infinite;
  box-shadow: 0 0 4px var(--color-primary);
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
  width: 24px;
  height: 24px;
  border: 3px solid var(--color-border-light);
  border-top-color: var(--color-primary);
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
  border-radius: 10px;
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  border: 2px dashed var(--color-border);
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}
.upload-box:active {
  transform: scale(0.98);
}

/* CameraCapture 拍照结果缩略图 */
.cam-shot {
  width: 100%;
  max-width: 360px;
  aspect-ratio: 4/3;
  object-fit: cover;
  border-radius: 10px;
  margin-top: 12px;
  border: 1px solid var(--color-border);
}

/* 输入 */
.input-area {
  width: 100%;
  aspect-ratio: 4/3;
  border-radius: 10px;
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
}
.input-big {
  width: 100%;
  max-width: 280px;
  padding: 12px 16px;
  border: 2px solid var(--color-primary);
  border-radius: 8px;
  font-size: 18px;
  font-family: monospace;
  letter-spacing: 1px;
  text-align: center;
  outline: none;
  color: var(--color-text);
  background: var(--color-surface);
}
.input-big:focus {
  box-shadow: 0 0 0 3px var(--color-primary-light);
}
.modal-box .upload-box {
  margin-bottom: 0;
}

/* toast */
.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  max-width: 100%;
  overflow: hidden;
}
.toast-tag {
  font-size: 11px;
  opacity: 0.7;
  flex-shrink: 0;
  margin-left: auto;
}
.toast.ok {
  background: var(--color-success-bg);
  color: var(--color-success-text);
}
.toast.fail {
  background: var(--color-danger-bg);
  color: var(--color-danger);
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
  padding: 0 16px;
  max-height: 160px;
  overflow-y: auto;
  border-top: 1px solid var(--color-border-light);
  padding-top: 12px;
}
.list-head {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
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
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-family: monospace;
}
.code-list li:nth-child(odd) {
  background: var(--color-bg);
}
.code-list li button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}
.code-list li button:hover {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

/* 标签栏 */
.tab-bar {
  display: flex;
  border-top: 1px solid var(--color-border-light);
}
.tab-bar button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px 0;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}
.tab-bar button.active {
  color: var(--color-primary);
}
.tab-bar button:active {
  transform: scale(0.95);
}

/* 代码块 */
.code-block {
  background: var(--color-bg);
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 13px;
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
  font-size: 13px;
  border-collapse: collapse;
}
.doc-table th {
  text-align: left;
  padding: 4px 8px;
  border-bottom: 2px solid var(--color-border);
}
.doc-table td {
  padding: 3px 8px;
  border-bottom: 1px solid var(--color-border-light);
}
.doc-table tr:last-child td {
  border-bottom: none;
}
</style>
