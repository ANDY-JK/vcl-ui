<script setup lang="ts">
// 电子签字字段 — canvas 手写签名，绘制结束回写 dataURL，挂载时回显已有签名
import { ref, onMounted } from 'vue'
import { useT } from '@/components/_internal/i18n'
import type { FormField } from '../types'

const t = useT()

const props = defineProps<{
  /** 字段定义 */
  field: FormField
  /** 当前值（dataURL 字符串） */
  modelValue: unknown
}>()

const emit = defineEmits<{
  'update:modelValue': [v: unknown]
}>()

/** 签名 canvas ref */
const signatureCanvasRef = ref<HTMLCanvasElement>()
let signatureDrawing = false

/** 把指针事件坐标换算为 canvas 内部像素坐标（canvas 属性尺寸与 CSS 显示尺寸可能不一致） */
function signaturePoint(e: PointerEvent): { x: number; y: number } {
  const canvas = signatureCanvasRef.value!
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
}

function startSignature(e: PointerEvent): void {
  signatureDrawing = true
  const canvas = signatureCanvasRef.value
  if (!canvas) return
  // 指针捕获：笔迹滑出画布不丢笔（否则 pointermove 不再派发，线断在边界）
  try {
    canvas.setPointerCapture(e.pointerId)
  } catch {
    /* 老内核不支持则退化为 pointerleave 收笔 */
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.strokeStyle = '#1e293b'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  const p = signaturePoint(e)
  ctx.moveTo(p.x, p.y)
}

function drawSignature(e: PointerEvent): void {
  if (!signatureDrawing) return
  const canvas = signatureCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const p = signaturePoint(e)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
}

function endSignature(): void {
  if (!signatureDrawing) return
  signatureDrawing = false
  // 绘制结束即回写 dataURL，保证提交时签名字段有值
  const canvas = signatureCanvasRef.value
  if (canvas) emit('update:modelValue', canvas.toDataURL('image/png'))
}

function clearSignature(): void {
  const canvas = signatureCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  emit('update:modelValue', '')
}

/** 回显已有签名（编辑/预览场景，modelValue 为 dataURL 时画到 canvas） */
function loadSignatureImage(): void {
  const dataUrl = props.modelValue
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return
  const canvas = signatureCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const img = new Image()
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  }
  img.src = dataUrl
}

onMounted(() => {
  loadSignatureImage()
})
</script>

<template>
  <div class="fb-signature-wrap">
    <canvas
      ref="signatureCanvasRef"
      class="fb-signature-canvas"
      width="400"
      height="120"
      @pointerdown="startSignature"
      @pointermove="drawSignature"
      @pointerup="endSignature"
      @pointerleave="endSignature"
    />
    <button class="fb-signature-clear" type="button" @click="clearSignature">{{ t('formBuilder.clear') }}</button>
  </div>
</template>

<style scoped>
.fb-signature-wrap {
  position: relative;
  border: 1px dashed var(--vcl-color-border, #e2e8f0);
  border-color: var(--fb-field-border, var(--vcl-color-border, #e2e8f0));
  border-radius: var(--fb-radius, calc(6px * var(--vcl-scale)));
  min-height: calc(80px * var(--vcl-scale));
  background: var(--vcl-color-bg-alt, #f8fafc);
  width: var(--fb-control-width, 100%);
}
.fb-signature-canvas {
  display: block;
  width: 100%;
  height: calc(120px * var(--vcl-scale));
  cursor: crosshair;
  /* 手机签名时阻止页面跟随滚动/下拉刷新，否则笔迹中断 */
  touch-action: none;
}
.fb-signature-clear {
  position: absolute;
  top: calc(6px * var(--vcl-scale));
  right: calc(6px * var(--vcl-scale));
  padding: 2px calc(10px * var(--vcl-scale));
  border: none;
  border-radius: calc(4px * var(--vcl-scale));
  background: var(--vcl-color-bg, #fff);
  color: var(--vcl-color-text-muted, #64748b);
  font-size: var(--vcl-fs-11);
  cursor: pointer;
}
.fb-signature-clear:hover {
  color: var(--vcl-color-danger-on-surface);
}
</style>
