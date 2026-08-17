<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'
import Card from '@/components/data/Card.vue'

const route = useRoute()
const router = useRouter()

const scanType = computed(() => (route.params.type as string) || '')

const typeConfig: Record<string, { label: string; icon: string; color: string; desc: string }> = {
  inbound:  { label: '入库扫码', icon: 'download', color: '#4F6EF7', desc: '扫描或输入商品条码，完成入库操作' },
  outbound: { label: '出库扫码', icon: 'upload', color: '#F59E0B', desc: '扫描或输入商品条码，完成出库操作' },
  check:    { label: '盘点扫码', icon: 'circle-check', color: '#22AD5F', desc: '扫描商品条码，核对库存数量' },
  transfer: { label: '调拨扫码', icon: 'rotate-cw', color: '#8B5CF6', desc: '扫描商品条码，完成库位调拨' },
  query:    { label: '扫码查询', icon: 'search', color: '#06B6D4', desc: '扫描商品条码，快速查看商品信息' },
}

const current = computed(() => typeConfig[scanType.value] || { label: '扫码', icon: 'search', color: '#4F6EF7', desc: '选择扫码类型' })

const mode = ref<'scan' | 'input' | 'result'>('scan')
const manualCode = ref('')
const scanResult = ref<any>(null)
const scanning = ref(false)

function simulateScan() {
  scanning.value = true
  // 模拟扫码延迟
  setTimeout(() => {
    scanning.value = false
    mode.value = 'result'
    scanResult.value = {
      code: 'SKU-1001',
      name: '无线鼠标 Pro',
      category: '电子产品',
      stock: 342,
      location: 'A区-3排-12号',
      price: 89,
    }
  }, 1500)
}

function manualSubmit() {
  if (!manualCode.value.trim()) return
  mode.value = 'result'
  scanResult.value = {
    code: manualCode.value.trim(),
    name: '机械键盘 K8',
    category: '电子产品',
    stock: 128,
    location: 'B区-1排-5号',
    price: 459,
  }
}

function reset() {
  mode.value = 'scan'
  manualCode.value = ''
  scanResult.value = null
}

function confirm() {
  // TODO: 提交扫码结果
  reset()
  router.back()
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
        <div class="type-label">{{ current.label }}</div>
        <div class="type-desc">{{ current.desc }}</div>
      </div>
    </div>

    <!-- 扫码模式 -->
    <div v-if="mode === 'scan'" class="scan-area">
      <div class="scanner-frame" :class="{ scanning }" @click="simulateScan">
        <div class="scanner-inner">
          <IconSvg v-if="!scanning" type="search" size="lg" color="var(--color-text-muted)" />
          <div v-else class="scan-line" />
        </div>
        <p class="scanner-tip">{{ scanning ? '识别中...' : '点击扫码区域模拟扫描' }}</p>
      </div>

      <div class="or-divider"><span>或</span></div>

      <div class="manual-section">
        <div class="input-row">
          <input
            v-model="manualCode"
            type="text"
            class="code-input"
            placeholder="手动输入商品条码"
            @keyup.enter="manualSubmit"
          />
          <button class="submit-btn" :disabled="!manualCode.trim()" @click="manualSubmit">
            查询
          </button>
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
  </div>
</template>

<style scoped>
.page { padding: 12px; }

.type-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 16px; margin: -12px -12px 16px;
  color: #fff; border-radius: 0 0 12px 12px;
}
.type-icon-bg {
  display: flex; align-items: center; justify-content: center;
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255,255,255,0.2); flex-shrink: 0;
}
.type-label { font-size: 17px; font-weight: 600; }
.type-desc { font-size: 12px; opacity: 0.8; margin-top: 2px; }

/* 扫码区 */
.scan-area { text-align: center; }
.scanner-frame {
  width: 200px; height: 200px; margin: 20px auto;
  border: 2px dashed var(--color-border); border-radius: 16px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  cursor: pointer; transition: all 200ms;
  position: relative; overflow: hidden;
}
.scanner-frame:hover { border-color: var(--color-primary); }
.scanner-frame.scanning { border-color: var(--color-primary); border-style: solid; }
.scanner-tip { font-size: 12px; color: var(--color-text-muted); margin-top: 12px; }

.scanner-inner {
  position: relative; width: 64px; height: 64px;
  display: flex; align-items: center; justify-content: center;
}
.scan-line {
  position: absolute; left: 0; right: 0; height: 2px;
  background: var(--color-primary);
  animation: scanAnim 1.2s ease-in-out infinite;
}
@keyframes scanAnim {
  0%, 100% { top: 0; }
  50% { top: 100%; }
}

.or-divider {
  display: flex; align-items: center; gap: 12px;
  margin: 16px 0; color: var(--color-text-muted); font-size: 12px;
}
.or-divider::before, .or-divider::after {
  content: ''; flex: 1; height: 1px; background: var(--color-border-light);
}

.input-row { display: flex; gap: 8px; }
.code-input {
  flex: 1; padding: 10px 12px; border: 1px solid var(--color-border);
  border-radius: var(--radius-md); font-size: 14px; outline: none;
  color: var(--color-text); font-family: inherit;
}
.code-input:focus { border-color: var(--color-primary); }
.submit-btn {
  padding: 10px 20px; border: none; border-radius: var(--radius-md);
  background: var(--color-primary); color: #fff; font-size: 14px;
  cursor: pointer; font-family: inherit;
}
.submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 结果区 */
.result-header {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 0; font-size: 16px; font-weight: 600; color: var(--color-success);
}
.result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.result-item { display: flex; flex-direction: column; gap: 2px; }
.result-label { font-size: 11px; color: var(--color-text-muted); }
.result-value { font-size: 13px; color: var(--color-text); }
.result-value.fw600 { font-weight: 600; }
.result-value.stock { font-weight: 600; color: var(--color-primary); }
.result-value.price { font-weight: 600; color: var(--color-danger); }

.result-actions { display: flex; gap: 10px; margin-top: 16px; }
.r-btn {
  flex: 1; padding: 12px; border-radius: var(--radius-md);
  font-size: 14px; font-weight: 500; cursor: pointer; font-family: inherit;
}
.r-btn.outline { border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); }
.r-btn.primary { border: none; background: var(--color-primary); color: #fff; }
</style>
