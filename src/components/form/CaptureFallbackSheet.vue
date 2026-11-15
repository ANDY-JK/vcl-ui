<script setup lang="ts">
/**
 * CaptureFallbackSheet — 采集「最后兜底」底部弹层（内容见 CaptureFallbackPanel）。
 *
 * 用在「页面内相机与系统相机都不可用/被取消」的场合（如 CameraCapture 拍照、外部扫码弹层）。
 * 只负责弹层外壳：遮罩、标题栏、焦点陷阱、开合动画；内容与业务语义交给 CaptureFallbackPanel。
 * CodeCapture 不用本弹层 —— 它在自己的卡片内换页，避免两层弹层叠加。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'
import { useEscClose } from '@/components/_internal/useEscClose'
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

/**
 * ESC 关闭（#507）：本组件声明 `role="dialog" aria-modal="true"`，对话框的键盘契约第一条
 * 就是 Escape 关闭；库里 `ModalShell` / `Drawer` / `Popover` / `NotificationCenter`
 * **全都**走这个共享 composable，只有这里以前没挂 —— 键盘用户唯一出路是 Tab 到 ✕。
 *
 * 可见/可关闭两个谓词都交给它：`busy` 时 `isClosable()` 为 false，Esc 被**自身**吞掉
 * （不会穿透去关掉下层弹层），与"识别中不许关"的语义一致。
 */
const { mount: mountEsc, unmount: unmountEsc } = useEscClose(
  () => props.modelValue,
  () => !props.busy,
  close,
)
onMounted(mountEsc)
onUnmounted(unmountEsc)
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
          <!-- busy 时真禁用（#507）：`close()` 里的 early-return 只挡住"效果"，
               按钮看上去仍可点、读屏仍念"取消，按钮" —— 按下去静默无事最难报。 -->
          <button type="button" class="capfb-x" :aria-label="t('form.cancel')" :disabled="props.busy" @click="close">
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
<style src="./capture-fallback-sheet.css"></style>
