<script setup lang="ts">
/**
 * CaptureFallbackSheet — 采集「最后兜底」底部弹层（内容见 CaptureFallbackPanel）。
 *
 * 用在「页面内相机与系统相机都不可用/被取消」的场合（如 CameraCapture 拍照、外部扫码弹层）。
 * 只负责弹层外壳：遮罩、标题栏、焦点陷阱、开合动画；内容与业务语义交给 CaptureFallbackPanel。
 * CodeCapture 不用本弹层 —— 它在自己的卡片内换页，避免两层弹层叠加。
 */
import { computed, ref, watch } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'
import CaptureFallbackPanel from './CaptureFallbackPanel.vue'
import IconSvg from '@/components/basic/IconSvg.vue'

const t = useT()

interface Props {
  /** 显隐（v-model） */
  modelValue: boolean
  /** 同 CaptureFallbackPanel：scan = 上传识别 + 手工输入；photo = 仅上传 */
  mode?: 'scan' | 'photo'
  /** 整面板禁用（转发自面板） */
  disabled?: boolean
  /** 识别中（控件禁用 + 显示进度提示） */
  busy?: boolean
  /** 识别失败等错误提示 */
  error?: string
  /** 上传条文案 */
  uploadHint?: string
  /** 面板顶部说明（通常由宿主传入降级原因） */
  hint?: string
  /** 手工输入占位 */
  placeholder?: string
  /** 上传接受的文件类型（默认 image/*） */
  accept?: string
  /** 允许多选文件 */
  multiple?: boolean
  /** 弹层标题（空串用内置 i18n） */
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'scan',
  disabled: false,
  busy: false,
  error: '',
  uploadHint: '',
  hint: '',
  placeholder: '',
  accept: 'image/*',
  multiple: false,
  title: '',
})

const emit = defineEmits<{
  /** v-model——显隐 */
  'update:modelValue': [v: boolean]
  /** 用户选好文件：宿主负责识别 / 交付（转发自面板） */
  files: [files: File[]]
  /** scan 模式手工输入提交（转发自面板） */
  submit: [code: string]
  /** 重试上一级采集（转发自 CaptureFallbackPanel，宿主自行接线） */
  retry: []
  /** 关闭弹层 */
  close: []
}>()

/** 弹层容器（Teleport 到 body），供焦点陷阱限定范围 */
const sheetRef = ref<HTMLElement | null>(null)
const panelRef = ref<InstanceType<typeof CaptureFallbackPanel> | null>(null)
useFocusTrap({
  visible: computed(() => props.modelValue),
  getContainer: () => sheetRef.value,
  autofocus: 'container',
})

const title = computed(() => props.title || t('form.captureFallbackTitle'))

watch(
  () => props.modelValue,
  (v) => {
    if (!v) panelRef.value?.reset()
  },
)

function close() {
  if (props.busy) return
  emit('update:modelValue', false)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="props.modelValue" class="capfb-mask" @click.self="close">
      <div
        ref="sheetRef"
        class="capfb-sheet"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        @click.stop
      >
        <div class="capfb-head">
          <span class="capfb-title">{{ title }}</span>
          <button type="button" class="capfb-x" :aria-label="t('form.cancel')" @click="close">
            <IconSvg type="x" size="sm" />
          </button>
        </div>

        <CaptureFallbackPanel
          ref="panelRef"
          :mode="props.mode"
          :disabled="props.disabled"
          :busy="props.busy"
          :error="props.error"
          :upload-hint="props.uploadHint"
          :hint="props.hint"
          :placeholder="props.placeholder"
          :accept="props.accept"
          :multiple="props.multiple"
          @files="emit('files', $event)"
          @submit="emit('submit', $event)"
          @retry="emit('retry')"
        />
      </div>
    </div>
  </Teleport>
</template>

<!-- 样式全局：弹层 Teleport 到 body，与本库其它浮层一致用前缀类名 -->
<style>
.capfb-mask {
  position: fixed;
  inset: 0;
  z-index: var(--vcl-z-top, 9999);
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.capfb-sheet {
  width: 100%;
  max-width: calc(480px * var(--vcl-scale));
  max-height: 92vh;
  overflow-y: auto;
  background: var(--vcl-color-bg);
  border-radius: calc(14px * var(--vcl-scale)) calc(14px * var(--vcl-scale)) 0 0;
  padding: var(--vcl-space-3) var(--vcl-space-4) calc(16px * var(--vcl-scale) + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: var(--vcl-space-3);
  outline: none;
}
/* 桌面（精确指针）：底部小弹层不合身，改居中对话框；触屏保持底部动作面板（原生习惯） */
@media (hover: hover) and (pointer: fine) {
  .capfb-mask {
    align-items: center;
    background: rgba(0, 0, 0, 0.45);
  }
  .capfb-sheet {
    width: min(420px * var(--vcl-scale), calc(100vw - 32px * var(--vcl-scale)));
    max-height: min(600px * var(--vcl-scale), calc(100vh - 48px * var(--vcl-scale)));
    border-radius: calc(16px * var(--vcl-scale));
    padding: var(--vcl-space-3) var(--vcl-space-4) var(--vcl-space-4);
    box-shadow: var(--vcl-shadow-lg);
  }
}
.capfb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.capfb-title {
  font-size: calc(16px * var(--vcl-scale));
  font-weight: 600;
  color: var(--vcl-color-text);
}
.capfb-x {
  width: calc(32px * var(--vcl-scale));
  height: calc(32px * var(--vcl-scale));
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--vcl-color-text-muted);
  cursor: pointer;
}
.capfb-x:hover {
  background: var(--vcl-color-bg-alt);
}
</style>
