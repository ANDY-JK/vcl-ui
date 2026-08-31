<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'
import Card from '@/components/data/Card.vue'
import { useBarcodeScanner, CameraCapture, beepSuccess } from '@/components/index'

const route = useRoute()
const router = useRouter()

const scanType = computed(() => (route.params.type as string) || '')

const typeConfig: Record<string, { label: string; icon: string; color: string; desc: string }> = {
  inbound: { label: '入库扫码', icon: 'download', color: '#4F6EF7', desc: '扫描或输入商品条码，完成入库操作' },
  outbound: { label: '出库扫码', icon: 'upload', color: '#F59E0B', desc: '扫描或输入商品条码，完成出库操作' },
  check: { label: '盘点扫码', icon: 'circle-check', color: '#22AD5F', desc: '扫描商品条码，核对库存数量' },
  transfer: { label: '调拨扫码', icon: 'rotate-cw', color: '#8B5CF6', desc: '扫描商品条码，完成库位调拨' },
  query: { label: '扫码查询', icon: 'search', color: '#06B6D4', desc: '扫描商品条码，快速查看商品信息' },
}

const current = computed(
  () => typeConfig[scanType.value] || { label: '扫码', icon: 'search', color: '#4F6EF7', desc: '选择扫码类型' },
)

const mode = ref<'scan' | 'input' | 'result'>('scan')
const manualCode = ref('')
const scanResult = ref<any>(null)

// ---- 真实扫码 ----
const {
  videoRef: scanVideoRef,
  canvasRef: scanCanvasRef,
  scanning: scanActive,
  error: scanError,
  start: startScan,
  stop: stopScan,
  scanPhoto,
} = useBarcodeScanner({
  onScan: (code) => {
    beepSuccess()
    // 模拟查询到商品信息
    mode.value = 'result'
    scanResult.value = {
      code,
      name: '扫描商品',
      category: '待录入',
      stock: 0,
      location: '待录入',
      price: 0,
    }
    stopScan()
  },
})

// 页面可见时启动扫码，离开时停止
watch(
  mode,
  async (v) => {
    if (v === 'scan') {
      await nextTick()
      startScan()
    } else {
      stopScan()
    }
  },
  { immediate: true },
)

// ---- 拍照识别 ----
const photoInput = ref<HTMLInputElement | null>(null)
const photoScanning = ref(false)
async function onPhoto(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  photoScanning.value = true
  try {
    const res = await scanPhoto(f)
    if (res.length) {
      const code = res[0]
      mode.value = 'result'
      scanResult.value = {
        code,
        name: '拍照识别商品',
        category: '待录入',
        stock: 0,
        location: '待录入',
        price: 0,
      }
    } else {
      scanResult.value = null
      mode.value = 'scan'
      showAlert('未识别到条码，请重试')
    }
  } catch {
    showAlert('图片识别失败')
  } finally {
    photoScanning.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

// ---- CameraCapture 页面内拍照 ----
const cameraVisible = ref(false)
function onCamCapture(file: File) {
  cameraVisible.value = false
  photoScanning.value = true
  scanPhoto(file)
    .then((res) => {
      if (res.length) {
        const code = res[0]
        mode.value = 'result'
        scanResult.value = {
          code,
          name: '拍照识别商品',
          category: '待录入',
          stock: 0,
          location: '待录入',
          price: 0,
        }
      } else {
        showAlert('未识别到条码，请重试')
      }
    })
    .catch(() => showAlert('图片识别失败'))
    .finally(() => {
      photoScanning.value = false
    })
}

function manualSubmit() {
  if (!manualCode.value.trim()) return
  mode.value = 'result'
  scanResult.value = {
    code: manualCode.value.trim(),
    name: '手动输入商品',
    category: '待录入',
    stock: 0,
    location: '待录入',
    price: 0,
  }
}

function reset() {
  mode.value = 'scan'
  manualCode.value = ''
  scanResult.value = null
}

function confirm() {
  reset()
  router.back()
}

function showAlert(msg: string) {
  alert(msg)
}
</script>

<template>
  <div class="page">
    <!-- 类型头 -->
    <div class="type-bar" :style="{ background: current.color }">
      <div class="type-icon-bg">
        <IconSvg :type="current.icon" size="lg" color="white" />
      </div>
      <div>
        <div class="type-label">
          {{ current.label }}
        </div>
        <div class="type-desc">
          {{ current.desc }}
        </div>
      </div>
    </div>

    <!-- 扫码模式 -->
    <div v-if="mode === 'scan'" class="scan-area">
      <!-- 真实摄像头扫码区 -->
      <div class="scanner-frame" :class="{ scanning: scanActive }">
        <div v-if="!scanActive && !scanError" class="scan-idle">
          <span class="spinner" />
          <span>启动摄像头...</span>
        </div>
        <div v-show="scanActive" class="scan-live">
          <video ref="scanVideoRef" class="scan-video" autoplay playsinline muted />
          <span class="mask top" /><span class="mask bot" /><span class="mask left" /><span class="mask right" />
          <span class="cnr tl" /><span class="cnr tr" /><span class="cnr bl" /><span class="cnr br" />
          <span class="beam" />
          <span class="scanning-txt">扫描中</span>
        </div>
        <canvas ref="scanCanvasRef" style="display: none" />
        <div v-if="scanError" class="scan-err">
          <p>{{ scanError }}</p>
          <button @click="startScan()">重试</button>
        </div>
      </div>

      <div class="or-divider">
        <span>或</span>
      </div>

      <!-- 拍照识别 -->
      <div class="photo-section">
        <button class="photo-btn" :disabled="photoScanning" @click="cameraVisible = true">
          <IconSvg v-if="!photoScanning" type="camera" size="sm" />
          <span v-if="photoScanning" class="spinner sm" />
          {{ photoScanning ? '识别中...' : '拍照识别' }}
        </button>
        <button class="photo-btn outline" @click="photoInput?.click()">
          <IconSvg type="image" size="sm" />
          从相册选
        </button>
        <input ref="photoInput" type="file" accept="image/*" style="display: none" @change="onPhoto" />
      </div>

      <div class="or-divider">
        <span>或手动输入</span>
      </div>

      <div class="manual-section">
        <div class="input-row">
          <input
            v-model="manualCode"
            type="text"
            class="code-input"
            placeholder="手动输入商品条码"
            @keyup.enter="manualSubmit"
          />
          <button class="submit-btn" :disabled="!manualCode.trim()" @click="manualSubmit">查询</button>
        </div>
      </div>
    </div>

    <!-- 扫码结果 -->
    <div v-else-if="mode === 'result' && scanResult" class="result-area">
      <div class="result-header">
        <IconSvg type="circle-check" size="lg" color="var(--color-success)" />
        <span>识别成功</span>
      </div>

      <Card title="商品信息" style="margin-bottom: 10px">
        <div class="result-grid">
          <div class="result-item">
            <span class="result-label">条码</span>
            <span class="result-value">{{ scanResult.code }}</span>
          </div>
          <div class="result-item">
            <span class="result-label">名称</span>
            <span class="result-value fw600">{{ scanResult.name }}</span>
          </div>
          <div class="result-item">
            <span class="result-label">分类</span>
            <span class="result-value">{{ scanResult.category }}</span>
          </div>
          <div class="result-item">
            <span class="result-label">库存</span>
            <span class="result-value stock">{{ scanResult.stock }}</span>
          </div>
          <div class="result-item">
            <span class="result-label">库位</span>
            <span class="result-value">{{ scanResult.location }}</span>
          </div>
          <div class="result-item">
            <span class="result-label">单价</span>
            <span class="result-value price">¥{{ scanResult.price }}</span>
          </div>
        </div>
      </Card>

      <div class="result-actions">
        <button class="r-btn outline" @click="reset">重新扫码</button>
        <button class="r-btn primary" @click="confirm">确认{{ current.label }}</button>
      </div>
    </div>

    <!-- CameraCapture 页面内拍照组件 -->
    <CameraCapture v-model="cameraVisible" @capture="onCamCapture" @error="showAlert" />
  </div>
</template>

<style scoped>
.page {
  padding: 12px;
}

.type-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  margin: -12px -12px 16px;
  color: #fff;
  border-radius: 0 0 12px 12px;
}
.type-icon-bg {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
}
.type-label {
  font-size: 17px;
  font-weight: 600;
}
.type-desc {
  font-size: 12px;
  opacity: 0.8;
  margin-top: 2px;
}

/* 扫码区 */
.scan-area {
  text-align: center;
}
.scanner-frame {
  width: 100%;
  aspect-ratio: 4/3;
  max-width: 320px;
  margin: 20px auto;
  border: 2px solid var(--color-border);
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  background: #000;
  transition: border-color 200ms;
}
.scanner-frame.scanning {
  border-color: var(--color-primary);
}

.scan-idle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  font-size: 12px;
}
.scan-live {
  position: absolute;
  inset: 0;
}
.scan-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.scan-err {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  justify-content: center;
  height: 100%;
  color: var(--color-warning);
  font-size: 12px;
  padding: 12px;
  text-align: center;
}
.scan-err button {
  padding: 4px 12px;
  border: 1px solid var(--color-warning);
  border-radius: 6px;
  background: transparent;
  color: var(--color-warning);
  font-size: 12px;
  cursor: pointer;
}

/* 扫描遮罩和边框 */
.mask {
  position: absolute;
  background: rgba(0, 0, 0, 0.4);
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
}

.or-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0;
  color: var(--color-text-muted);
  font-size: 12px;
}
.or-divider::before,
.or-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-border-light);
}

.photo-section {
  display: flex;
  gap: 8px;
  justify-content: center;
}
.photo-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}
.photo-btn:active {
  transform: scale(0.97);
}
.photo-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.photo-btn.outline {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.input-row {
  display: flex;
  gap: 8px;
}
.code-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  outline: none;
  color: var(--color-text);
  font-family: inherit;
  background: var(--color-surface);
}
.code-input:focus {
  border-color: var(--color-primary);
}
.submit-btn {
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  font-family: inherit;
}
.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 结果区 */
.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-success);
}
.result-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.result-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.result-label {
  font-size: 11px;
  color: var(--color-text-muted);
}
.result-value {
  font-size: 13px;
  color: var(--color-text);
}
.result-value.fw600 {
  font-weight: 600;
}
.result-value.stock {
  font-weight: 600;
  color: var(--color-primary);
}
.result-value.price {
  font-weight: 600;
  color: var(--color-danger);
}

.result-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
.r-btn {
  flex: 1;
  padding: 12px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}
.r-btn.outline {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
}
.r-btn.primary {
  border: none;
  background: var(--color-primary);
  color: #fff;
}

/* spinner */
.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--color-border-light);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.spinner.sm {
  width: 14px;
  height: 14px;
  border-width: 2px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
