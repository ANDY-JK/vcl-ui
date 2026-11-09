<script setup lang="ts">
/**
 * CaptureFallbackPanel — 采集「最后兜底」面板内容（无遮罩、无 Teleport、无弹层语义）。
 *
 * 只描述「上：选图；下：手工输入」这块内容，由宿主决定怎么承载：
 * - CaptureFallbackSheet：底部弹层（相机整条不可用时）
 * - CodeCapture：直接嵌进自己的卡片换页（取景 ↔ 兜底），避免出现「两层弹层叠加」
 *
 * 选图走共享引擎的 openSystemCapture（与拍照/扫码同一套系统选择器）：
 * 宽度自适应的一条虚线胶囊，比 Upload 的 card 变体（固定 110×110 方块）更合身；
 * 桌面弹文件框、移动端弹系统选择器（自带「拍摄 / 相册」入口）。
 */
import { computed, ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { openSystemCapture } from './utils/capture-fallback'
import Input from '@/components/form/Input.vue'
import Button from '@/components/basic/Button.vue'
import IconSvg from '@/components/basic/IconSvg.vue'

const t = useT()

interface Props {
  /** scan = 上传识别 + 手工输入；photo = 仅上传（相册/文件） */
  mode?: 'scan' | 'photo'
  /** 整面板禁用（上传/输入均不可操作） */
  disabled?: boolean
  /** 识别中（控件禁用 + 显示进度提示） */
  busy?: boolean
  /** 识别失败等错误提示（留在面板内，方便直接改用输入） */
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
})

const emit = defineEmits<{
  /** 用户选好文件：宿主负责识别 / 交付 */
  files: [files: File[]]
  /** scan 模式手工输入提交 */
  submit: [code: string]
  /** 重试上一级采集（宿主决定怎么重开：页面内相机 / 系统相机） */
  retry: []
}>()

const uploadHint = computed(() => props.uploadHint || t('form.captureUploadHint'))
const placeholder = computed(() => props.placeholder || t('form.captureManualPlaceholder'))
const locked = computed(() => props.disabled || props.busy)

/* ── 选图：共享引擎的系统选择器（去掉残留临时 input 由引擎负责） ── */
async function pickFiles() {
  if (locked.value) return
  const files = await openSystemCapture({
    accept: props.accept,
    capture: false, // 不强制相机：让系统弹「拍摄 / 相册 / 文件」，把选择权留给用户
    multiple: props.multiple,
  })
  if (files.length) emit('files', files)
}

/* ── 手工输入（仅 scan 模式） ── */
const inputText = ref('')
function submitInput() {
  const v = inputText.value.trim()
  if (!v || locked.value) return
  emit('submit', v)
}
/** 宿主清空面板时同步清掉输入（避免二次打开残留上次内容） */
function reset() {
  inputText.value = ''
}
defineExpose({ reset })
</script>

<template>
  <div class="capfb-panel">
    <p v-if="props.hint" class="capfb-hint">{{ props.hint }}</p>

    <!-- 上：选图（系统选择器，移动端自带「拍摄 / 相册」入口） -->
    <button type="button" class="capfb-pick" :disabled="locked" @click="pickFiles">
      <IconSvg type="camera" size="lg" color="currentColor" />
      <span>{{ uploadHint }}</span>
    </button>

    <!-- 下：手工输入（原型兜底终态底行：手输框 · 提交 · 重试） -->
    <template v-if="props.mode === 'scan'">
      <div class="capfb-or">
        <span>{{ t('form.captureOrInput') }}</span>
      </div>
      <div class="capfb-input">
        <Input
          v-model="inputText"
          type="text"
          :placeholder="placeholder"
          :disabled="locked"
          clearable
          @keyup.enter="submitInput"
        />
        <Button :text="t('form.captureSubmit')" :disabled="locked || !inputText.trim()" @click="submitInput" />
        <Button :text="t('form.retry')" variant="ghost" :disabled="props.busy" @click="emit('retry')" />
      </div>
    </template>

    <p v-if="props.error" class="capfb-err">{{ props.error }}</p>
    <p v-if="props.busy" class="capfb-busy"><span class="capfb-spinner" />{{ t('form.captureDecoding') }}</p>
  </div>
</template>

<!-- 全局样式：面板会被 Teleport（sheet）或嵌进浮层卡片（CodeCapture），用前缀类名避免作用域问题 -->
<style src="./capture-fallback-panel.css"></style>
