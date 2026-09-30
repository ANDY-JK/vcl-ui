<script setup lang="ts">
/**
 * CodeCapture / 采集兜底链演示
 *
 * 展示「用户只点一次，链路自己下探」的完整闭环：
 *   页面内相机扫码 → 系统相机拍照识别 → 上传图片识别 / 手工输入
 * 并给出能力探测面板与「强制降级」开关，方便在桌面端复现各级兜底效果。
 */
import { ref, computed, onMounted } from 'vue'
import { CodeCapture, CameraCapture } from '@/components/index'
import {
  detectCaptureCapability,
  resolveEntryLevel,
  captureChainFrom,
  type CaptureCapability,
  type CaptureLevel,
} from '@/components/form/utils/capture-fallback'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'
import Tag from '@/components/basic/Tag.vue'

const cap = ref<CaptureCapability | null>(null)
const entry = ref<CaptureLevel>('inpage')
onMounted(() => {
  cap.value = detectCaptureCapability()
  entry.value = resolveEntryLevel(cap.value)
})

const chain = computed(() => captureChainFrom(entry.value, { allowUpload: true, allowManual: true }))

const LEVEL_LABEL: Record<CaptureLevel, string> = {
  inpage: '页面内相机',
  system: '系统相机 / 相册',
  upload: '上传图片识别',
  manual: '手工输入',
}

// ── 扫码实例（自动兜底链） ──
const scanOpen = ref(false)
const scanFormats = ref<'all' | 'qr' | 'barcode'>('all')
const scanLog = ref<string[]>([])
function onScan(code: string) {
  scanLog.value = [...scanLog.value, code]
}

// ── 拍照实例（含最后兜底：系统相机不行就弹上传面板） ──
const camOpen = ref(false)
const camShot = ref('')
const camMsg = ref('')
function onCamCapture(f: File) {
  camShot.value = f.name
  camMsg.value = ''
}
function onCamError(msg: string) {
  camMsg.value = msg
}
</script>

<template>
  <div class="demo">
    <h2 class="title">CodeCapture · 采集兜底链</h2>
    <p class="desc">
      用户只点一次「扫码」，之后自动下探，不需要在来源之间做选择：<br />
      <b>页面内相机</b>（不切后台、无刷新）→ 失败/被拒 → <b>系统相机拍照识别</b> → 仍不成 → <b>上传图片识别</b> /
      <b>手工输入</b>。拍照组件同理，最末一级是上传面板。
    </p>

    <!-- 能力探测 -->
    <Card title="环境能力探测（detectCaptureCapability）" title-as="h2">
      <p class="card-hint">
        入口级由能力决定：不具备页面内取流条件（非 HTTPS / 无
        getUserMedia）时，直接跳到系统相机，避免注定失败的权限纠缠。
      </p>
      <ul v-if="cap" class="cap-list">
        <li>
          <span>安全上下文（HTTPS / localhost）</span
          ><Tag :variant="cap.secure ? 'success' : 'danger'" :text="cap.secure ? '是' : '否'" />
        </li>
        <li>
          <span>getUserMedia 可用</span
          ><Tag :variant="cap.hasUserMedia ? 'success' : 'danger'" :text="cap.hasUserMedia ? '是' : '否'" />
        </li>
        <li>
          <span>微信内置浏览器</span
          ><Tag :variant="cap.isWeChat ? 'warning' : 'default'" :text="cap.isWeChat ? '是' : '否'" />
        </li>
        <li>
          <span>触屏设备</span><Tag :variant="cap.isTouch ? 'warning' : 'default'" :text="cap.isTouch ? '是' : '否'" />
        </li>
      </ul>
      <div class="chain-row">
        <span class="chain-label">本次实际链路：</span>
        <template v-for="(l, i) in chain" :key="l">
          <Tag :variant="l === entry ? 'primary' : 'default'" :text="LEVEL_LABEL[l]" />
          <span v-if="i < chain.length - 1" class="chain-arrow">→</span>
        </template>
      </div>
    </Card>

    <!-- 扫码 -->
    <Card title="扫码（自动兜底）" title-as="h2" style="margin-top: calc(16px * var(--vcl-scale))">
      <p class="card-hint">
        点「开始扫码」后链路自动运行。想复现兜底：在浏览器里拒绝摄像头权限 → 会自动走系统相机； 无线程环境/桌面无摄像头
        → 直接弹「上传识别 + 手工输入」面板。底部也可随时手动切上传/输入。
      </p>
      <div class="row">
        <Button text="开始扫码" icon="scan" @click="scanOpen = true" />
        <div class="fmt">
          <label><input v-model="scanFormats" type="radio" value="all" /> 通用</label>
          <label><input v-model="scanFormats" type="radio" value="qr" /> 仅二维码</label>
          <label><input v-model="scanFormats" type="radio" value="barcode" /> 仅条码</label>
        </div>
      </div>
      <div v-if="scanLog.length" class="capfb-result">已识别 {{ scanLog.length }} 条：{{ scanLog.join(', ') }}</div>
    </Card>

    <!-- 拍照 -->
    <Card title="拍照（自动兜底）" title-as="h2" style="margin-top: calc(16px * var(--vcl-scale))">
      <p class="card-hint">页面内取景 → 相机不可用自动调系统相机 → 系统相机也拿不到（取消/不可用）→ 自动弹上传面板。</p>
      <Button text="打开拍照" icon="camera" @click="camOpen = true" />
      <div v-if="camShot" class="result">已拍：{{ camShot }}</div>
      <div v-if="camMsg" class="result err">{{ camMsg }}</div>
    </Card>

    <CodeCapture v-model="scanOpen" :formats="scanFormats" @scan="onScan" />
    <CameraCapture v-model="camOpen" @capture="onCamCapture" @error="onCamError" />
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
  line-height: 1.7;
}
.card-hint {
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  margin-bottom: calc(12px * var(--vcl-scale));
  line-height: 1.6;
}
.cap-list {
  list-style: none;
  margin: 0 0 calc(12px * var(--vcl-scale));
  padding: 0;
}
.cap-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(12px * var(--vcl-scale));
  padding: calc(6px * var(--vcl-scale)) 0;
  border-bottom: 1px solid var(--vcl-color-border-light);
  font-size: calc(13px * var(--vcl-scale));
}
.cap-list li:last-child {
  border-bottom: none;
}
.chain-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: calc(6px * var(--vcl-scale));
  font-size: calc(13px * var(--vcl-scale));
}
.chain-label {
  color: var(--vcl-color-text-muted);
}
.chain-arrow {
  color: var(--vcl-color-text-muted);
}
.row {
  display: flex;
  align-items: center;
  gap: calc(16px * var(--vcl-scale));
  flex-wrap: wrap;
}
.fmt {
  display: flex;
  gap: calc(12px * var(--vcl-scale));
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
}
.fmt label {
  display: flex;
  align-items: center;
  gap: calc(4px * var(--vcl-scale));
  cursor: pointer;
}
.capfb-result {
  margin-top: calc(12px * var(--vcl-scale));
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-text-secondary);
  word-break: break-all;
}
.capfb-result.err {
  color: var(--vcl-color-danger);
}
</style>
