<script setup lang="ts">
// 富文本工具栏（simple/full 两档）— 纯展示 + 面板表单态，命令执行统一经 emit 由容器完成
// full 档面向「发文章」场景：标题/引用/代码块/对齐/颜色/链接/插图/表格/撤销重做/清格式 + 预览/全屏
// 图标走 IconSvg(lucide)；按钮 title 与 aria-label 全量 i18n
import { computed, ref } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useT } from '@/components/_internal/i18n'

type PanelName = 'color' | 'link' | 'image' | null

const props = defineProps<{
  mode: 'simple' | 'full'
  previewing?: boolean
  fullscreen?: boolean
  panel?: PanelName
}>()

const emit = defineEmits<{
  exec: [cmd: string, val?: string, opts?: { css?: boolean }]
  panel: [name: PanelName]
  link: [url: string, newTab: boolean]
  image: [src: string]
  table: []
  'inline-code': []
  unlink: []
  'toggle-preview': []
  'toggle-fullscreen': []
}>()

const t = useT()

/** 本地文件插图上限（dataURL 直存表单值，超限会撑爆存储）；URL 手输的 data:image 同口径受限 */
const IMAGE_MAX_BYTES = 2 * 1024 * 1024
const DATAURL_MAX_CHARS = 2.8 * 1024 * 1024
/** 链接/图片 URL 合法性：与消毒器 href/src 白名单口径一致，非法输入不给确认 */
const URL_RE = /^(https?:\/\/|mailto:|#)/i
/** 内容色板：用户写入文章正文的内容用色（等同 Word 字色板），非组件主题色，不走设计令牌 */
const TEXT_COLORS = ['#111827', '#dc2626', '#ea580c', '#16a34a', '#2563eb', '#9333ea']
const HIGHLIGHT_COLORS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8']

const linkUrl = ref('')
const linkNewTab = ref(true)
const imageUrl = ref('')
const imageError = ref('')
const fileRef = ref<HTMLInputElement | null>(null)

const linkValid = computed(() => URL_RE.test(linkUrl.value.trim()) || /^www\./i.test(linkUrl.value.trim()))
const imageValid = computed(() => isImageUrlOk(imageUrl.value.trim()))

/** 图片地址可用性：http(s) URL 直接放行，data:image 需在长度上限内（与文件上传 2MB 同口径） */
function isImageUrlOk(url: string): boolean {
  if (URL_RE.test(url)) return true
  return /^data:image\//i.test(url) && url.length <= DATAURL_MAX_CHARS
}

function togglePanel(name: Exclude<PanelName, null>): void {
  emit('panel', props.panel === name ? null : name)
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  return /^www\./i.test(trimmed) ? 'https://' + trimmed : trimmed
}

function confirmLink(): void {
  const url = normalizeUrl(linkUrl.value)
  if (!URL_RE.test(url)) return
  emit('link', url, linkNewTab.value)
  resetForm()
}

function confirmImage(): void {
  const url = imageUrl.value.trim()
  if (!isImageUrlOk(url)) return
  emit('image', url)
  resetForm()
}

function pickFile(): void {
  fileRef.value?.click()
}

/** 上传前校验：返回错误文案，空串表示通过 */
function imageFileError(file: File): string {
  if (!file.type.startsWith('image/')) return t('formBuilder.rtImageInvalid')
  if (file.size > IMAGE_MAX_BYTES) return t('formBuilder.rtImageTooLarge')
  return ''
}

function onFileChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const error = imageFileError(file)
  if (error) {
    imageError.value = error
    return
  }
  imageError.value = ''
  readImageFile(file)
}

function readImageFile(file: File): void {
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      emit('image', reader.result)
      resetForm()
    }
  }
  reader.onerror = () => {
    imageError.value = t('formBuilder.rtImageReadFailed')
  }
  reader.readAsDataURL(file)
}

function resetForm(): void {
  linkUrl.value = ''
  linkNewTab.value = true
  imageUrl.value = ''
  imageError.value = ''
}
</script>

<template>
  <div class="fb-rt-toolbar">
    <!-- simple 档：保持原有命令集（行为兼容），图标升级为 IconSvg -->
    <template v-if="mode === 'simple'">
      <button
        type="button"
        :title="t('formBuilder.rtBold')"
        :aria-label="t('formBuilder.rtBold')"
        @click="emit('exec', 'bold')"
      >
        <IconSvg type="bold" size="xs" />
      </button>
      <button
        type="button"
        :title="t('formBuilder.rtItalic')"
        :aria-label="t('formBuilder.rtItalic')"
        @click="emit('exec', 'italic')"
      >
        <IconSvg type="italic" size="xs" />
      </button>
      <button
        type="button"
        :title="t('formBuilder.rtUnderline')"
        :aria-label="t('formBuilder.rtUnderline')"
        @click="emit('exec', 'underline')"
      >
        <IconSvg type="underline" size="xs" />
      </button>
      <span class="fb-rt-sep" />
      <button
        type="button"
        :title="t('formBuilder.rtUl')"
        :aria-label="t('formBuilder.rtUl')"
        @click="emit('exec', 'insertUnorderedList')"
      >
        <IconSvg type="list" size="xs" />
      </button>
      <button
        type="button"
        :title="t('formBuilder.rtOl')"
        :aria-label="t('formBuilder.rtOl')"
        @click="emit('exec', 'insertOrderedList')"
      >
        <IconSvg type="list-ordered" size="xs" />
      </button>
      <span class="fb-rt-sep" />
      <button
        type="button"
        :title="t('formBuilder.rtH4')"
        :aria-label="t('formBuilder.rtH4')"
        @click="emit('exec', 'formatBlock', '<h4>')"
      >
        <IconSvg type="heading-4" size="xs" />
      </button>
      <button
        type="button"
        :title="t('formBuilder.rtParagraph')"
        :aria-label="t('formBuilder.rtParagraph')"
        @click="emit('exec', 'formatBlock', '<p>')"
      >
        <IconSvg type="pilcrow" size="xs" />
      </button>
    </template>

    <!-- full 档：文章编辑全量命令；预览态隐藏编辑组，保留预览/全屏切换 -->
    <template v-else>
      <template v-if="!previewing">
        <button
          type="button"
          :title="t('formBuilder.rtUndo')"
          :aria-label="t('formBuilder.rtUndo')"
          @click="emit('exec', 'undo')"
        >
          <IconSvg type="undo-2" size="xs" />
        </button>
        <button
          type="button"
          :title="t('formBuilder.rtRedo')"
          :aria-label="t('formBuilder.rtRedo')"
          @click="emit('exec', 'redo')"
        >
          <IconSvg type="redo-2" size="xs" />
        </button>
        <span class="fb-rt-sep" />
        <button
          type="button"
          :title="t('formBuilder.rtH1')"
          :aria-label="t('formBuilder.rtH1')"
          @click="emit('exec', 'formatBlock', '<h1>')"
        >
          <IconSvg type="heading-1" size="xs" />
        </button>
        <button
          type="button"
          :title="t('formBuilder.rtH2')"
          :aria-label="t('formBuilder.rtH2')"
          @click="emit('exec', 'formatBlock', '<h2>')"
        >
          <IconSvg type="heading-2" size="xs" />
        </button>
        <button
          type="button"
          :title="t('formBuilder.rtH3')"
          :aria-label="t('formBuilder.rtH3')"
          @click="emit('exec', 'formatBlock', '<h3>')"
        >
          <IconSvg type="heading-3" size="xs" />
        </button>
        <button
          type="button"
          :title="t('formBuilder.rtParagraph')"
          :aria-label="t('formBuilder.rtParagraph')"
          @click="emit('exec', 'formatBlock', '<p>')"
        >
          <IconSvg type="pilcrow" size="xs" />
        </button>
        <span class="fb-rt-sep" />
        <button
          type="button"
          :title="t('formBuilder.rtBold')"
          :aria-label="t('formBuilder.rtBold')"
          @click="emit('exec', 'bold')"
        >
          <IconSvg type="bold" size="xs" />
        </button>
        <button
          type="button"
          :title="t('formBuilder.rtItalic')"
          :aria-label="t('formBuilder.rtItalic')"
          @click="emit('exec', 'italic')"
        >
          <IconSvg type="italic" size="xs" />
        </button>
        <button
          type="button"
          :title="t('formBuilder.rtUnderline')"
          :aria-label="t('formBuilder.rtUnderline')"
          @click="emit('exec', 'underline')"
        >
          <IconSvg type="underline" size="xs" />
        </button>
        <button
          type="button"
          :title="t('formBuilder.rtStrike')"
          :aria-label="t('formBuilder.rtStrike')"
          @click="emit('exec', 'strikeThrough')"
        >
          <IconSvg type="strikethrough" size="xs" />
        </button>
        <span class="fb-rt-sep" />
        <button
          type="button"
          :title="t('formBuilder.rtColor')"
          :aria-label="t('formBuilder.rtColor')"
          :class="{ 'is-active': panel === 'color' }"
          @click="togglePanel('color')"
        >
          <IconSvg type="palette" size="xs" />
        </button>
        <span class="fb-rt-sep" />
        <button
          type="button"
          :title="t('formBuilder.rtUl')"
          :aria-label="t('formBuilder.rtUl')"
          @click="emit('exec', 'insertUnorderedList')"
        >
          <IconSvg type="list" size="xs" />
        </button>
        <button
          type="button"
          :title="t('formBuilder.rtOl')"
          :aria-label="t('formBuilder.rtOl')"
          @click="emit('exec', 'insertOrderedList')"
        >
          <IconSvg type="list-ordered" size="xs" />
        </button>
        <span class="fb-rt-sep" />
        <button
          type="button"
          :title="t('formBuilder.rtQuote')"
          :aria-label="t('formBuilder.rtQuote')"
          @click="emit('exec', 'formatBlock', '<blockquote>')"
        >
          <IconSvg type="quote" size="xs" />
        </button>
        <button
          type="button"
          :title="t('formBuilder.rtCodeBlock')"
          :aria-label="t('formBuilder.rtCodeBlock')"
          @click="emit('exec', 'formatBlock', '<pre>')"
        >
          <IconSvg type="square-code" size="xs" />
        </button>
        <button
          type="button"
          :title="t('formBuilder.rtInlineCode')"
          :aria-label="t('formBuilder.rtInlineCode')"
          @click="emit('inline-code')"
        >
          <IconSvg type="code" size="xs" />
        </button>
        <button
          type="button"
          :title="t('formBuilder.rtHr')"
          :aria-label="t('formBuilder.rtHr')"
          @click="emit('exec', 'insertHorizontalRule')"
        >
          <IconSvg type="minus" size="xs" />
        </button>
        <span class="fb-rt-sep" />
        <button
          type="button"
          :title="t('formBuilder.rtAlignLeft')"
          :aria-label="t('formBuilder.rtAlignLeft')"
          @click="emit('exec', 'justifyLeft')"
        >
          <IconSvg type="align-left" size="xs" />
        </button>
        <button
          type="button"
          :title="t('formBuilder.rtAlignCenter')"
          :aria-label="t('formBuilder.rtAlignCenter')"
          @click="emit('exec', 'justifyCenter')"
        >
          <IconSvg type="align-center" size="xs" />
        </button>
        <button
          type="button"
          :title="t('formBuilder.rtAlignRight')"
          :aria-label="t('formBuilder.rtAlignRight')"
          @click="emit('exec', 'justifyRight')"
        >
          <IconSvg type="align-right" size="xs" />
        </button>
        <span class="fb-rt-sep" />
        <button
          type="button"
          :title="t('formBuilder.rtLink')"
          :aria-label="t('formBuilder.rtLink')"
          :class="{ 'is-active': panel === 'link' }"
          @click="togglePanel('link')"
        >
          <IconSvg type="link" size="xs" />
        </button>
        <button
          type="button"
          :title="t('formBuilder.rtUnlink')"
          :aria-label="t('formBuilder.rtUnlink')"
          @click="emit('unlink')"
        >
          <IconSvg type="unlink" size="xs" />
        </button>
        <button
          type="button"
          :title="t('formBuilder.rtImage')"
          :aria-label="t('formBuilder.rtImage')"
          :class="{ 'is-active': panel === 'image' }"
          @click="togglePanel('image')"
        >
          <IconSvg type="image" size="xs" />
        </button>
        <button
          type="button"
          :title="t('formBuilder.rtTable')"
          :aria-label="t('formBuilder.rtTable')"
          @click="emit('table')"
        >
          <IconSvg type="table" size="xs" />
        </button>
        <span class="fb-rt-sep" />
        <button
          type="button"
          :title="t('formBuilder.rtClearFormat')"
          :aria-label="t('formBuilder.rtClearFormat')"
          @click="emit('exec', 'removeFormat')"
        >
          <IconSvg type="eraser" size="xs" />
        </button>
      </template>

      <span class="fb-rt-spacer" />
      <button
        type="button"
        :title="t('formBuilder.rtPreview')"
        :aria-label="t('formBuilder.rtPreview')"
        :class="{ 'is-active': previewing }"
        @click="emit('toggle-preview')"
      >
        <IconSvg type="eye" size="xs" />
      </button>
      <button
        type="button"
        :title="fullscreen ? t('formBuilder.rtExitFullscreen') : t('formBuilder.rtFullscreen')"
        :aria-label="fullscreen ? t('formBuilder.rtExitFullscreen') : t('formBuilder.rtFullscreen')"
        :class="{ 'is-active': fullscreen }"
        @click="emit('toggle-fullscreen')"
      >
        <IconSvg :type="fullscreen ? 'minimize-2' : 'maximize-2'" size="xs" />
      </button>

      <!-- 颜色面板：文字颜色 + 背景高亮 -->
      <div v-if="panel === 'color'" class="fb-rt-panel">
        <div class="fb-rt-panel-row">
          <span class="fb-rt-panel-label">{{ t('formBuilder.rtTextColor') }}</span>
          <button
            v-for="c in TEXT_COLORS"
            :key="'t' + c"
            type="button"
            class="fb-rt-swatch"
            :style="{ background: c }"
            :title="c"
            :aria-label="t('formBuilder.rtTextColor') + ' ' + c"
            @click="emit('exec', 'foreColor', c, { css: true })"
          />
        </div>
        <div class="fb-rt-panel-row">
          <span class="fb-rt-panel-label">{{ t('formBuilder.rtHighlight') }}</span>
          <button
            v-for="c in HIGHLIGHT_COLORS"
            :key="'h' + c"
            type="button"
            class="fb-rt-swatch"
            :style="{ background: c }"
            :title="c"
            :aria-label="t('formBuilder.rtHighlight') + ' ' + c"
            @click="emit('exec', 'hiliteColor', c, { css: true })"
          />
        </div>
      </div>

      <!-- 链接面板：URL + 新窗口；非法 URL 禁用确认 -->
      <div v-else-if="panel === 'link'" class="fb-rt-panel">
        <label class="fb-rt-panel-field">
          <span>{{ t('formBuilder.rtLinkUrl') }}</span>
          <input v-model="linkUrl" type="text" @keydown.enter.prevent="confirmLink" />
        </label>
        <label class="fb-rt-panel-check">
          <input v-model="linkNewTab" type="checkbox" />
          <span>{{ t('formBuilder.rtLinkNewTab') }}</span>
        </label>
        <div v-if="linkUrl && !linkValid" class="fb-rt-panel-hint">{{ t('formBuilder.rtLinkInvalid') }}</div>
        <div class="fb-rt-panel-actions">
          <button type="button" @click="emit('panel', null)">{{ t('formBuilder.rtCancel') }}</button>
          <button type="button" class="is-primary" :disabled="!linkValid" @click="confirmLink">
            {{ t('formBuilder.rtInsert') }}
          </button>
        </div>
      </div>

      <!-- 图片面板：URL 或本地上传（≤2MB，转 dataURL 直存） -->
      <div v-else-if="panel === 'image'" class="fb-rt-panel">
        <label class="fb-rt-panel-field">
          <span>{{ t('formBuilder.rtImageUrl') }}</span>
          <input v-model="imageUrl" type="text" @keydown.enter.prevent="confirmImage" />
        </label>
        <div v-if="imageUrl && !imageValid" class="fb-rt-panel-hint">{{ t('formBuilder.rtLinkInvalid') }}</div>
        <div v-if="imageError" class="fb-rt-panel-hint is-error">{{ imageError }}</div>
        <div class="fb-rt-panel-actions">
          <button type="button" @click="pickFile">{{ t('formBuilder.rtImageUpload') }}</button>
          <input
            ref="fileRef"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            class="fb-rt-file-input"
            @change="onFileChange"
          />
          <span class="fb-rt-spacer" />
          <button type="button" @click="emit('panel', null)">{{ t('formBuilder.rtCancel') }}</button>
          <button type="button" class="is-primary" :disabled="!imageValid" @click="confirmImage">
            {{ t('formBuilder.rtInsert') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.fb-rt-toolbar {
  position: relative;
  display: flex;
  gap: 2px;
  padding: 4px 6px;
  background: var(--color-bg-alt, #f8fafc);
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
  flex-wrap: wrap;
  align-items: center;
}
.fb-rt-toolbar button {
  min-width: 24px;
  height: 24px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--color-text-muted, #64748b);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-12);
  padding: 0 4px;
}
.fb-rt-toolbar button:hover {
  background: var(--color-bg-soft, #f1f5f9);
  color: var(--color-text, #1e293b);
}
.fb-rt-toolbar button.is-active {
  background: var(--color-primary-soft, #e0e7ff);
  color: var(--color-primary, #4f46e5);
}
.fb-rt-toolbar button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.fb-rt-sep {
  width: 1px;
  height: 16px;
  background: var(--color-border, #e2e8f0);
  margin: 0 2px;
}
.fb-rt-spacer {
  flex: 1;
}
.fb-rt-file-input {
  display: none;
}

/* 面板：锚定工具栏下方，覆盖在编辑区之上（容器 overflow:hidden 内不受裁剪） */
.fb-rt-panel {
  position: absolute;
  top: calc(100% + 2px);
  left: 6px;
  z-index: 30;
  min-width: 280px;
  padding: 10px 12px;
  background: var(--color-bg, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--fb-radius, 6px);
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.fb-rt-panel-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.fb-rt-panel-label {
  font-size: var(--fs-12);
  color: var(--color-text-muted, #64748b);
  width: 60px;
  flex-shrink: 0;
}
.fb-rt-swatch {
  width: 20px !important;
  height: 20px !important;
  min-width: 20px;
  border: 1px solid var(--color-border, #e2e8f0) !important;
  border-radius: 3px !important;
  padding: 0 !important;
}
.fb-rt-swatch:hover {
  transform: scale(1.1);
}
.fb-rt-panel-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--fs-12);
  color: var(--color-text-muted, #64748b);
}
.fb-rt-panel-field input[type='text'] {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 4px;
  font-size: var(--fs-13);
  color: var(--color-text, #1e293b);
  background: var(--color-bg, #fff);
  outline: none;
}
.fb-rt-panel-field input[type='text']:focus {
  border-color: var(--color-primary, #4f46e5);
}
.fb-rt-panel-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-12);
  color: var(--color-text-muted, #64748b);
  cursor: pointer;
}
.fb-rt-panel-hint {
  font-size: var(--fs-12);
  color: var(--color-warning, #d97706);
}
.fb-rt-panel-hint.is-error {
  color: var(--color-danger, #dc2626);
}
.fb-rt-panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.fb-rt-panel-actions button {
  min-width: auto;
  height: 26px;
  padding: 0 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-bg, #fff);
  color: var(--color-text, #1e293b);
  font-size: var(--fs-12);
}
.fb-rt-panel-actions button:hover {
  border-color: var(--color-primary, #4f46e5);
  color: var(--color-primary, #4f46e5);
}
.fb-rt-panel-actions button.is-primary {
  background: var(--color-primary, #4f46e5);
  border-color: var(--color-primary, #4f46e5);
  color: #fff;
}
.fb-rt-panel-actions button.is-primary:hover {
  opacity: 0.9;
}
</style>
