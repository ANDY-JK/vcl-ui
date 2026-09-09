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

// ---- 实例 1：无过滤，接受所有条码 ----
const allCodes = ref<string[]>([])
const {
  videoRef: v1,
  canvasRef: c1,
  scanning: s1,
  error: e1,
  start: start1,
  stop: stop1,
} = useBarcodeScanner({
  onScan: (c) => (allCodes.value = [...allCodes.value, c]),
})

// ---- 实例 2：前缀 S + 11 位 ----
const sCodes = ref<string[]>([])
const {
  videoRef: v2,
  canvasRef: c2,
  scanning: s2,
  error: e2,
  start: start2,
  stop: stop2,
} = useBarcodeScanner({
  prefix: 'S',
  length: 11,
  onScan: (c) => (sCodes.value = [...sCodes.value, c]),
})

// ---- 实例 3：仅长度 8 位（如 EAN-8） ----
const ean8Codes = ref<string[]>([])
const {
  videoRef: v3,
  canvasRef: c3,
  scanning: s3,
  error: e3,
  start: start3,
  stop: stop3,
} = useBarcodeScanner({
  length: 8,
  onScan: (c) => (ean8Codes.value = [...ean8Codes.value, c]),
})

// ---- 实例 4：拍照上传 ----
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
} = useBarcodeScanner({
  prefix: 'S',
  length: 11,
  onScan: (c) => {
    modalCodes.value = [...modalCodes.value, c]
    lastResult.value = c
    lastValid.value = true
    feedback(c)
  },
})

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
      传 prefix/length → 只回调符合条件的；不传 → 全部回调。
    </p>

    <!-- 四列实例 -->
    <div class="grid-4">
      <Card title="无过滤">
        <p class="card-hint">不传 prefix/length，所有条码都接受。</p>
        <div class="scan-box">
          <div v-if="!s1 && !e1" class="scan-idle"><span class="spinner" /><span>待启动</span></div>
          <div v-show="s1" class="scan-live">
            <video ref="v1" class="scan-video" autoplay playsinline muted />
          </div>
          <canvas ref="c1" style="display: none" />
          <div v-if="e1" class="scan-err">
            <p>{{ e1 }}</p>
            <button @click="start1">重试</button>
          </div>
        </div>
        <button class="btn" @click="s1 ? stop1() : start1()">
          {{ s1 ? '停止' : '开始' }}
        </button>
        <div v-if="allCodes.length" class="result">{{ allCodes.length }} 条：{{ allCodes.join(', ') }}</div>
      </Card>

      <Card title="prefix='S' length=11">
        <p class="card-hint">仅接受 S 开头且恰好 11 位。</p>
        <div class="scan-box">
          <div v-if="!s2 && !e2" class="scan-idle"><span class="spinner" /><span>待启动</span></div>
          <div v-show="s2" class="scan-live">
            <video ref="v2" class="scan-video" autoplay playsinline muted />
          </div>
          <canvas ref="c2" style="display: none" />
          <div v-if="e2" class="scan-err">
            <p>{{ e2 }}</p>
            <button @click="start2">重试</button>
          </div>
        </div>
        <button class="btn" @click="s2 ? stop2() : start2()">
          {{ s2 ? '停止' : '开始' }}
        </button>
        <div v-if="sCodes.length" class="result">{{ sCodes.length }} 条：{{ sCodes.join(', ') }}</div>
      </Card>

      <Card title="length=8（无前缀）">
        <p class="card-hint">仅校验 8 位长度，适合 EAN-8。</p>
        <div class="scan-box">
          <div v-if="!s3 && !e3" class="scan-idle"><span class="spinner" /><span>待启动</span></div>
          <div v-show="s3" class="scan-live">
            <video ref="v3" class="scan-video" autoplay playsinline muted />
          </div>
          <canvas ref="c3" style="display: none" />
          <div v-if="e3" class="scan-err">
            <p>{{ e3 }}</p>
            <button @click="start3">重试</button>
          </div>
        </div>
        <button class="btn" @click="s3 ? stop3() : start3()">
          {{ s3 ? '停止' : '开始' }}
        </button>
        <div v-if="ean8Codes.length" class="result">{{ ean8Codes.length }} 条：{{ ean8Codes.join(', ') }}</div>
      </Card>

      <!-- 4. 拍照上传 -->
      <Card title="拍照上传（prefix='S' length=11）">
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
      <p class="card-hint">自定义 modal + tab（扫码/输入/上传）+ 反馈（声音/语音/通知）。</p>
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
          <div v-show="s5" class="scan-live">
            <video ref="v5" class="scan-video" autoplay playsinline muted />
            <span class="mask top" /><span class="mask bot" /><span class="mask left" /><span
              class="mask right"
            />
            <span class="cnr tl" /><span class="cnr tr" /><span class="cnr bl" /><span class="cnr br" />
            <span class="beam" />
            <span class="scanning-txt">扫描中</span>
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
          <td><code>onScan</code></td>
          <td>(code: string) => void</td>
          <td>识别到有效条码时回调</td>
        </tr>
      </table>
      <table class="doc-table" style="margin-top: 12px">
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
