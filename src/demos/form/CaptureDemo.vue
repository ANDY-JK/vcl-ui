<script setup lang="ts">
/**
 * CaptureDemo — 拍照 / 扫码采集合并演示（单入口，替代此前三个分散页面）。
 *
 * 三段同页从上往下即推荐用法顺序（section 保持独立文件，各守 800 行约束，此处只做编排）：
 *   ① CaptureFallbackDemo — 自动兜底链（业务首选：CodeCapture 扫码 / CameraCapture 拍照，点一次链路自己下探）
 *   ② CameraCaptureDemo   — 拍照组件本体（连拍 / 交付 / Props / Events）
 *   ③ BarcodeScannerDemo  — useBarcodeScanner 低阶引擎（渐变卡自绘 UI / 弹窗完整演示 / API）
 *
 * 注意：capture-fallback e2e 依赖「①在 DOM 序最前」——「开始扫码」按钮定位用 .first()，
 * 调整段落顺序前先核对 tests/e2e/capture-fallback.spec.ts。
 */
import CaptureFallbackDemo from './CaptureFallbackDemo.vue'
import CameraCaptureDemo from './CameraCaptureDemo.vue'
import BarcodeScannerDemo from './BarcodeScannerDemo.vue'
</script>

<template>
  <div class="demo">
    <p class="demo-desc">
      拍照 / 扫码采集全家桶：业务侧用<b>自动兜底链</b>（用户只点一次，链路自己下探：页面内相机 → 系统相机 → 上传 →
      手工输入）；要自绘 UI 用低阶 <code>useBarcodeScanner</code>。三段同页，从上往下即推荐顺序。
    </p>

    <section id="cap-fallback" class="cap-section">
      <CaptureFallbackDemo />
    </section>

    <section id="cap-camera" class="cap-section">
      <CameraCaptureDemo />
    </section>

    <section id="cap-engine" class="cap-section">
      <BarcodeScannerDemo />
    </section>
  </div>
</template>

<style scoped>
.demo-desc {
  color: var(--color-text-muted);
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.7;
}
code {
  background: var(--color-bg-alt);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
}
/* 段落分隔：虚线 + 大间距（各段自带 h2 标题，这里只做视觉切分） */
.cap-section {
  padding-top: 28px;
  margin-top: 20px;
  border-top: 1px dashed var(--color-border);
}
.cap-section:first-of-type {
  padding-top: 12px;
  margin-top: 0;
  border-top: none;
}
</style>
