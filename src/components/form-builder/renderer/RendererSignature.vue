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

  /**
   * 外部判定为无效（不带文案）：挂到**组容器**上（#346）。
   * 这三处都没有单一可聚焦控件（签名是 canvas、地图是内嵌地图、开关列表是子组件的多个开关），
   * 错误描述的是整组，所以挂容器。
   */
  invalid?: boolean
  /** 外部错误元素的 id：挂到 aria-describedby，读屏可回查「为什么无效」 */
  describedby?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [v: unknown]
}>()

/** 签名 canvas ref */
const signatureCanvasRef = ref<HTMLCanvasElement>()
let signatureDrawing = false
/**
 * 本次起笔是否真的落下过墨迹（第 183 轮）。
 *
 * `pointerdown` 只 `moveTo`、不 `stroke`；只有 `pointermove` 才真正画线。
 * 因此「单击 / 手抖单点」（down 后直接 up）画布上什么都没有，若照旧无条件
 * `toDataURL`，就会把一张全透明 PNG 写成字段值 —— required 校验通过、
 * 提交上来却是空白签名。与同文件「避免空图覆盖原签名」的意图相悖。
 */
let signatureHasStroke = false

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
  signatureHasStroke = false
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
  signatureHasStroke = true
}

/**
 * 像素级"画布上有没有墨迹"检测（TD-81 收口）。
 *
 * hasStroke 只能证明"调过 stroke"，证明不了"真的留下了墨迹"：
 * 压感笔/半透明笔刷 alpha≈0 的笔画、以及把 lineWidth 调成 0 的自定义宿主，
 * 都会让 toDataURL 产出一张**全透明 PNG** —— 字段值非空、required 通过，
 * 提交上来却是"看不见的签名"。收笔时用 getImageData 扫 alpha 通道兜底：
 * 全透明即视为空白，不回写（与"单击不回写"同一语义：空白签名不是签名）。
 *
 * 为什么用 getImageData 而不是逐笔记录：压感笔的 alpha 由浏览器合成，
 * JS 侧拿不到"这一笔实际画出了什么"；而 400×120 的画布一次扫描约 192KB，
 * 只在收笔瞬间跑一次，开销可忽略。
 */
function canvasHasInk(cv: HTMLCanvasElement): boolean {
  const ctx = cv.getContext('2d')
  if (!ctx) return false
  const { data } = ctx.getImageData(0, 0, cv.width, cv.height)
  // 只看 alpha：签名是纯色笔画，颜色通道无关紧要；间隔 4 采样（每像素 4 字节）已经足够
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return true
  }
  return false
}

function endSignature(): void {
  if (!signatureDrawing) return
  signatureDrawing = false
  // 只回写真正画过的那一笔（第 183 轮）：单击只 moveTo 未 stroke，画布仍是空的，
  // 此时写 dataURL 等于把「空白签名」提交成有效值
  if (!signatureHasStroke) return
  signatureHasStroke = false
  // 像素级兜底（TD-81）：hasStroke 只证明调过 stroke，压感笔 alpha≈0 的"看不见的一笔"
  // 会被 toDataURL 写成全透明 PNG —— 字段值非空、required 通过，提交上来却是空白签名。
  // 全透明画布与"单击"同语义：不回写，保持 modelValue 不变。
  const canvas = signatureCanvasRef.value
  if (!canvas || !canvasHasInk(canvas)) return
  emit('update:modelValue', canvas.toDataURL('image/png'))
}

function clearSignature(): void {
  const canvas = signatureCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  // 清除即作废"本笔"（第 183 轮）：否则绘画中途点清除后，随后的 pointerup
  // 会因 hasStroke 仍为 true 把空画布再 toDataURL 一遍，覆盖掉刚写入的 ''
  signatureDrawing = false
  signatureHasStroke = false
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
  <div
    class="fb-signature-wrap"
    role="group"
    :aria-label="field.label"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedby"
  >
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
@media (hover: hover) {
  .fb-signature-clear:hover {
    color: var(--vcl-color-danger-on-surface);
  }
}
</style>
