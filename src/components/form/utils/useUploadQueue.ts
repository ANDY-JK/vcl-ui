/**
 * useUploadQueue — Upload 的文件队列引擎（拆分自 Upload.vue，超 800 行整改）。
 *
 * 职责：队列状态（files）与父模型的双向合并、accept/尺寸/去重校验、blob 预览生成、
 * canvas 压缩与真实/模拟上传、删除/重试。UI 事件适配（拖拽/粘贴/input/拍照入口）留在组件。
 * UploadFile 对外类型仍由 Upload.vue 导出（消费方契约不变），此处 type-only 引用。
 */
import { ref, watch, onUnmounted } from 'vue'
import { useT } from '@/components/_internal/i18n'
import type { UploadFile } from '../Upload.vue'

/** 模块级 t：校验/错误文案随当前语言 */
const t = useT()

/** 组件 props 的引擎相关子集（传整包 props 即可，多余键不受影响） */
interface QueueProps {
  modelValue: UploadFile[]
  accept: string
  multiple: boolean
  maxSize: number
  minSize?: number
  variant: 'default' | 'card'
  compress: boolean
  maxWidth: number
  compressQuality: number
  customRequest?: (file: File) => Promise<{ url: string }>
}

export function useUploadQueue(opts: {
  props: QueueProps
  emit: {
    (e: 'change', files: UploadFile[]): void
    (e: 'remove', file: UploadFile): void
    (e: 'error', message: string): void
    (e: 'update:modelValue', files: UploadFile[]): void
  }
}) {
  const { props, emit } = opts
  const files = ref<UploadFile[]>([])
  const timers: ReturnType<typeof setInterval>[] = []
  let fileId = 0

  // 同步外部 modelValue → 内部 files。
  // 双向合并语义：外部程序化回填/删除时内部跟随；内部正在上传的项（尚未同步到父模型）保留。
  // 必须复制数组引用（files.value = [...val]）：直接引用会让后续 unshift 原地变异父组件传入的数组。
  watch(
    () => props.modelValue,
    (val) => {
      if (val && val.length > 0) {
        const sameAsInternal = val.length === files.value.length && val.every((f, i) => files.value[i]?.id === f.id)
        if (sameAsInternal) return
        const externalIds = new Set(val.map((f) => f.id))
        const internalUploading = files.value.filter((f) => f.status === 'uploading' && !externalIds.has(f.id))
        files.value = [...val, ...internalUploading]
      } else if (val && val.length === 0) {
        // 竞态防护：内部有正在上传的文件时，外部空数组通常是「父组件 modelValue getter
        // 尚未反映本次上传」的同步回环。立即清空会让 realUpload 完成时 emit 空数组，
        // 父组件 onUpload 误判为「用户删除文件」→ 落盘空记录 → 拍照返回刷新后图片丢失
        // （每个门店首次上传必现，需拍两次）。等上传完成 emit 后由父组件重新推入即可。
        if (files.value.some((f) => f.status === 'uploading')) return
        files.value.forEach((f) => {
          if (f.url?.startsWith('blob:')) URL.revokeObjectURL(f.url)
        })
        files.value = []
      }
    },
    { immediate: true },
  )

  function syncModel() {
    emit('update:modelValue', [...files.value])
  }

  /** 清空全部文件并同步模型（模板 @click 只支持单表达式，抽成方法） */
  function clearAllFiles() {
    files.value.forEach((f) => {
      if (f.url?.startsWith('blob:')) URL.revokeObjectURL(f.url)
    })
    files.value = []
    syncModel()
  }

  /** 图片压缩：canvas resize + quality 调整（移动端尤其需要） */
  async function compressImage(file: File): Promise<File> {
    if (!props.compress || !file.type.startsWith('image/')) return file
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const img = new Image()
        img.onload = () => {
          URL.revokeObjectURL(url)
          resolve(img)
        }
        img.onerror = (e) => {
          URL.revokeObjectURL(url)
          reject(e)
        }
        img.src = url
      })
      // 等比缩小到 maxWidth 以内
      let { width, height } = img
      if (width > props.maxWidth) {
        height = Math.round(height * (props.maxWidth / width))
        width = props.maxWidth
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error(t('form.compressFailed')))),
          file.type === 'image/png' ? 'image/png' : 'image/jpeg',
          props.compressQuality,
        )
      })
      // 压缩后体积大于原图则返回原文件
      if (blob.size >= file.size) return file
      return new File([blob], file.name, { type: blob.type, lastModified: Date.now() })
    } catch {
      // 压缩失败返回原文件
      return file
    }
  }

  /** 接受 FileList（input/拖拽）或 File[]（兜底引擎/拍照/粘贴），内部统一按下标遍历 */
  function processFiles(fileList: FileList | File[] | null) {
    if (!fileList || fileList.length === 0) return
    // card 模式且已有文件 → 替换而非追加
    if (props.variant === 'card' && files.value.length) {
      // 清理旧 blob URL
      files.value.forEach((f) => {
        if (f.url?.startsWith('blob:')) URL.revokeObjectURL(f.url)
      })
      files.value = []
    }
    const newFiles: UploadFile[] = []
    const limit = props.multiple ? fileList.length : 1
    for (let i = 0; i < limit; i++) {
      const f = fileList[i]
      if (!f) continue
      // accept 白名单校验（文件选择、拖拽、目录选择都走这里）：
      // 移动端选择器可能由宿主（如微信内置浏览器）提供拍照入口，但格式仍须匹配 accept
      if (props.accept && !isMimeAccepted(f, props.accept)) {
        emit('error', t('form.typeNotSupported', { name: f.name, accept: props.accept }))
        continue
      }
      if (f.size > props.maxSize * 1024 * 1024) {
        emit('error', t('form.sizeExceeded', { name: f.name, max: props.maxSize }))
        continue
      }
      if (props.minSize && f.size < props.minSize * 1024) {
        emit('error', t('form.sizeTooSmall', { name: f.name, min: props.minSize }))
        continue
      }
      if (files.value.some((existing) => existing.name === f.name && existing.size === f.size)) {
        emit('error', t('form.fileExists', { name: f.name }))
        continue
      }
      const uf: UploadFile = {
        id: ++fileId,
        name: f.name,
        size: f.size,
        progress: 0,
        status: 'uploading',
        raw: f,
      }
      newFiles.push(uf)
      files.value.unshift(uf)

      // 异步压缩图片后上传
      compressImage(f).then((compressed) => {
        uf.size = compressed.size
        if (props.customRequest) {
          realUpload(uf, compressed)
        } else {
          simulateUpload(uf)
        }
      })
    }
    if (newFiles.length) {
      // 图片文件一律生成 blob 预览地址（此前仅 card 变体生成，列表变体图片没有缩略图/预览入口）
      createPreviews(newFiles, fileList)
      emit('change', files.value)
      syncModel()
    }
  }

  function createPreviews(newFiles: UploadFile[], fileList: FileList | File[]) {
    for (let i = 0; i < Math.min(newFiles.length, fileList.length); i++) {
      const f = fileList[i]
      if (f && f.type.startsWith('image/')) newFiles[i].url = URL.createObjectURL(f)
    }
  }

  async function realUpload(uf: UploadFile, rawFile: File) {
    if (!props.customRequest) {
      uf.status = 'error'
      emit('error', t('form.noCustomRequest'))
      return
    }
    try {
      const result = await props.customRequest(rawFile)
      uf.progress = 100
      uf.status = 'done'
      uf.url = result.url
      syncModel()
    } catch (e: any) {
      uf.status = 'error'
      emit('error', e?.message || t('form.uploadFailed'))
      syncModel()
    }
  }

  function simulateUpload(uf: UploadFile) {
    let p = 0
    const timer = setInterval(() => {
      p += Math.random() * 30 + 10
      if (p >= 100) {
        p = 100
        uf.progress = 100
        uf.status = 'done'
        clearInterval(timer)
        // 从清理列表移除已完成的定时器，避免长会话中数组只增不清
        const idx = timers.indexOf(timer)
        if (idx >= 0) timers.splice(idx, 1)
      } else {
        uf.progress = Math.round(p)
      }
    }, 300)
    timers.push(timer)
  }

  function removeFile(uf: UploadFile) {
    // 释放 Blob URL 避免内存泄漏
    if (uf.url?.startsWith('blob:')) URL.revokeObjectURL(uf.url)
    files.value = files.value.filter((f) => f.id !== uf.id)
    emit('remove', uf)
    syncModel()
  }

  /** 检查文件 MIME 是否匹配 accept 模式（如 "image/*" 匹配 "image/png"） */
  function isMimeAccepted(file: File, accept: string): boolean {
    if (!accept) return true
    const types = accept.split(',').map((s) => s.trim())
    return types.some((t) => {
      if (t.endsWith('/*')) return file.type.startsWith(t.slice(0, -1))
      if (t.startsWith('.')) return file.name.toLowerCase().endsWith(t.toLowerCase())
      return file.type === t
    })
  }

  function retryFile(id: number) {
    const f = files.value.find((x) => x.id === id)
    if (f && f.status === 'error') {
      f.status = 'uploading'
      f.progress = 0
      // 配置了真实上传时必须走 realUpload 链路（此前只重跑模拟进度，用户得到假进度假成功）
      if (props.customRequest) {
        if (f.raw) {
          realUpload(f, f.raw as File)
        } else {
          f.status = 'error'
          emit('error', t('form.uploadFailed'))
        }
      } else {
        simulateUpload(f)
      }
    }
  }

  // 组件卸载时清理未完成的模拟上传定时器
  onUnmounted(() => {
    timers.forEach((timer) => clearInterval(timer))
    timers.length = 0
  })

  return { files, syncModel, clearAllFiles, processFiles, removeFile, retryFile, isMimeAccepted }
}
