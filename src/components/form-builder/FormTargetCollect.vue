<script setup lang="ts">
import { reportWarn } from '@/components/_internal/runtime-observer'
/**
 * FormTargetCollect — 目标收集（按门店等目标聚合上传）
 *
 * 与 FormBuilder（单页表单）/ FormCollect（平铺记录）不同：
 * 本组件以「目标清单」为维度，每个目标（门店）一行，含 N 个照片位上传 + 状态。
 * 照片位由 FormSchema 的 image-upload/upload/camera 字段自动推导（field.key = slotKey）。
 *
 * 典型业务：返利函收集（1 位）、门店陈列收集（正面/反面 2 位）、柜机协议收集（1 位）。
 * 一套组件 + 各自 schema/目标数据 = 三个业务。
 *
 * 存储复用 contract-storage 聚合后端（IndexedDB 本地 + Supabase 云端，按 targetId 聚合、
 * 墓碑/对账防删复活、真机拍照本地先落盘）。
 */
import { ref, reactive, computed, watch, onMounted, onUnmounted, toRaw } from 'vue'
import { useT } from '@/components/_internal/i18n'
import Upload from '@/components/form/Upload.vue'
import Input from '@/components/form/Input.vue'
import Button from '@/components/basic/Button.vue'
import Toast from '@/components/feedback/Toast.vue'
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import ImagePreview from '@/components/data/ImagePreview.vue'
import type { UploadFile } from '@/components/form/Upload.vue'
import StorageConfigPanel from '@/components/storage/StorageConfigPanel.vue'
import type { FormSchema, FormField } from './types'
import {
  createBackend,
  defaultStorageConfigFromEnv,
  getSlotFile,
  setSlotFile,
  allSlotsFilled,
} from '@/components/storage/contract-storage'
import type { StorageBackend, StorageConfig, StoreUploadState, StoreFile } from '@/components/storage/contract-storage'
import { loadPersistedStorageConfig, persistStorageConfig } from './storage-config-persist'
import JSZip from 'jszip'

const t = useT()
const toastRef = ref<InstanceType<typeof Toast>>()
const toast = (msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') =>
  toastRef.value?.show(msg, type, 2000)

// ════════════════════════════════════════
// Props
// ════════════════════════════════════════

export interface TargetItem {
  /** 目标唯一 id（门店 Apple ID 等），存储键 */
  id: number
  /** 展示字段（门店名称/执照名/地址/电话…），渲染到表格行 */
  [key: string]: unknown
}

interface Props {
  /** 表单 Schema（照片位字段 + 可选填字段；非照片位字段仅作展示/说明） */
  schema: FormSchema
  /** 目标清单（门店们），来源由宿主给（静态/API/Excel） */
  targets: TargetItem[]
  /** 存储配置（本地/云端），缺省纯本地 */
  storageConfig?: StorageConfig
  /** 只读模式（查看收集结果，禁上传） */
  readonly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  storageConfig: undefined,
  readonly: false,
})

const emit = defineEmits<{
  /** 某目标某照片位上传/删除后触发 */
  change: [targetId: number, slotKey: string, file: StoreFile | undefined]
}>()

// ════════════════════════════════════════
// 从 schema 推导照片位
// ════════════════════════════════════════

/** 照片位字段类型（upload 家族） */
const PHOTO_TYPES = new Set(['upload', 'image-upload', 'camera'])

/** 照片位字段列表（按 schema 字段顺序） */
const slotFields = computed<FormField[]>(() => props.schema.fields.filter((f) => PHOTO_TYPES.has(f.type)))
/** slotKey 列表 */
const slotKeys = computed<string[]>(() => slotFields.value.map((f) => f.key))
/** 目标 id → 目标 */
const targetMap = computed(() => new Map(props.targets.map((x) => [x.id, x])))

/** 表格展示列：targets[0] 的前几个标量字段 + id 优先 */
const displayKeys = computed<string[]>(() => {
  const first = props.targets[0]
  if (!first) return ['id']
  return Object.keys(first)
    .filter((k) => k !== 'id')
    .slice(0, 3)
})

/**
 * 导出用全量字段：表格为了排得下只展示前几列，导出不能跟着一起少 —— 少掉的那几列就是丢数据。
 * 取所有目标键的并集（不同目标的字段可能不一样），按首次出现的顺序排。
 */
const exportKeys = computed<string[]>(() => {
  const out: string[] = []
  const seen = new Set(['id'])
  for (const s of props.targets) {
    for (const k of Object.keys(s)) {
      if (seen.has(k)) continue
      seen.add(k)
      out.push(k)
    }
  }
  return out
})

/** 没进表格的字段数 —— 用来在表头上方明说，别让人以为目标只有这几列 */
const hiddenFieldCount = computed(() => Math.max(0, exportKeys.value.length - displayKeys.value.length))

/** 单元格/导出值：嵌套对象序列化成 JSON，导出里既不丢列也不留 [object Object] */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

// ════════════════════════════════════════
// 存储
// ════════════════════════════════════════

// 存储配置的读写走 ./storage-config-persist：落盘脱敏 secretAccessKey（F3），
// SSR 安全仍在此拦截——持久化模块直接访问 localStorage，无 window 环境会 ReferenceError
const cfg = ref<StorageConfig>(
  props.storageConfig ??
    (typeof localStorage !== 'undefined' ? loadPersistedStorageConfig() : defaultStorageConfigFromEnv()),
)
const showStoragePanel = ref(false)
const saving = ref(false)
let backendInstance: StorageBackend | null = null

function applyBackend(): StorageBackend {
  if (!backendInstance) {
    backendInstance = createBackend(toRaw(cfg.value), (id, e) => {
      toast(t('fbTarget.syncFail', { id: String(id), err: (e as Error)?.message || String(e) }), 'error')
    })
  }
  return backendInstance
}

function resetBackend(): void {
  backendInstance = null
}

/** 上传状态：targetId → StoreUploadState */
const uploadMap = reactive(new Map<number, StoreUploadState>())

async function reloadFromBackend(): Promise<void> {
  const backend = applyBackend()
  try {
    const map = await backend.loadAll(slotKeys.value)
    uploadMap.clear()
    for (const [id, state] of map) uploadMap.set(id, state)
  } catch (e) {
    reportWarn('[FormTargetCollect] 存储加载失败:', e)
    toast(backend.kind !== 'local' ? t('fbTarget.loadCloudFail') : t('fbTarget.loadLocalFail'), 'error')
  }
}

async function saveToBackend(targetId: number): Promise<void> {
  const raw = toRaw(uploadMap.get(targetId))
  try {
    await applyBackend().saveRecord(targetId, raw ?? { slots: {}, ts: Date.now() })
  } catch (e) {
    reportWarn('[FormTargetCollect] 存储保存失败:', targetId, e)
    toast(t('fbTarget.saveFail'), 'error')
  }
}

/** 共享面板保存回调：持久化 → 重建后端 → 重载（校验已在面板内完成） */
async function onStorageConfigSave(next: StorageConfig): Promise<void> {
  cfg.value = next
  saving.value = true
  try {
    persistStorageConfig(cfg.value)
    resetBackend()
    await reloadFromBackend()
    showStoragePanel.value = false
    toast(cfg.value.backend !== 'local' ? t('fbTarget.switchCloud') : t('fbTarget.switchLocal'), 'success')
  } finally {
    saving.value = false
  }
}

/** 清空确认弹窗状态（一键删除全部上传属不可逆操作，与 FormCollect 同样走确认） */
const clearConfirmVisible = ref(false)

/** 无上传记录时不弹确认，直接忽略 */
function requestClearAll(): void {
  if (!uploadMap.size) return
  clearConfirmVisible.value = true
}

async function onConfirmClear(): Promise<void> {
  clearConfirmVisible.value = false
  try {
    await applyBackend().clearAll()
    uploadMap.clear()
    toast(t('fbTarget.cleared'), 'success')
  } catch (e) {
    reportWarn('[FormTargetCollect] 清空失败:', e)
    toast(t('fbTarget.clearFail'), 'error')
  }
}

// ════════════════════════════════════════
// 上传
// ════════════════════════════════════════

/**
 * blob URL 缓存：key = `${targetId}:${slotKey}:${变更序号}`。
 * UploadFile.url 每次渲染不能新建 objectURL（泄漏），同一文件复用缓存；
 * 槽位被替换/删除/清空时 revoke 旧值。
 */
const blobUrlCache = new Map<string, string>()
const slotVersion = new Map<string, number>()

function slotCacheKey(targetId: number, slotKey: string): string {
  return `${targetId}:${slotKey}`
}

function revokeSlotUrl(targetId: number, slotKey: string): void {
  const ck = slotCacheKey(targetId, slotKey)
  const url = blobUrlCache.get(ck)
  if (url) {
    URL.revokeObjectURL(url)
    blobUrlCache.delete(ck)
  }
  slotVersion.set(ck, (slotVersion.get(ck) ?? 0) + 1)
}

onUnmounted(() => {
  for (const url of blobUrlCache.values()) URL.revokeObjectURL(url)
  blobUrlCache.clear()
})

/** 某目标某照片位的 UploadFile[]（供 Upload v-model） */
function getUploadFiles(targetId: number, slotKey: string): UploadFile[] {
  const f = getSlotFile(uploadMap.get(targetId), slotKey)
  if (!f) return []
  const ck = slotCacheKey(targetId, slotKey)
  let url = blobUrlCache.get(ck)
  if (!url) {
    url = typeof f.dataUrl === 'string' ? f.dataUrl : URL.createObjectURL(f.dataUrl)
    blobUrlCache.set(ck, url)
  }
  return [{ id: targetId, name: f.name, size: f.size, progress: 100, status: 'done', url }]
}

/** 自定义上传：直接返回即时 blob URL 供预览（真机拍照落盘走 onUpload） */
const customRequest = (file: File): Promise<{ url: string }> => Promise.resolve({ url: URL.createObjectURL(file) })

async function onUpload(targetId: number, slotKey: string, files: UploadFile[]): Promise<void> {
  const f = files[0]
  const cur = uploadMap.get(targetId)
  if (f && f.url && f.status === 'done') {
    // 槽位内容变更：失效旧 blob URL（下次渲染按新文件重建）
    revokeSlotUrl(targetId, slotKey)
    const file: StoreFile = {
      name: f.name,
      dataUrl: f.raw ?? f.url,
      size: f.size,
      type: (f as UploadFile & { type?: string }).type || 'image/*',
    }
    uploadMap.set(targetId, setSlotFile(cur, slotKey, file))
    await saveToBackend(targetId)
    emit('change', targetId, slotKey, file)
    toast(t('fbTarget.saved'), 'success')
  } else if (files.length === 0) {
    revokeSlotUrl(targetId, slotKey)
    uploadMap.set(targetId, setSlotFile(cur, slotKey, undefined))
    await saveToBackend(targetId)
    emit('change', targetId, slotKey, undefined)
  }
}

// ════════════════════════════════════════
// 搜索 / 统计
// ════════════════════════════════════════

const SEARCH_KEY = 'form-target-collect-search'
// SSR 安全：setup 期裸读 localStorage 在服务端渲染直接 ReferenceError（对照 Select 的 typeof 守卫）
const keyword = ref(
  typeof localStorage !== 'undefined' ? (localStorage.getItem(SEARCH_KEY) as string | null) || '' : '',
)
watch(keyword, (v) => {
  try {
    localStorage.setItem(SEARCH_KEY, v)
  } catch {
    /* 忽略 */
  }
})

const filteredTargets = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return props.targets
  return props.targets.filter((s) => Object.values(s).some((v) => String(v).toLowerCase().includes(kw)))
})

/** 完成统计：全部照片位齐 = 完成 */
const doneCount = computed(() => {
  let done = 0
  for (const tg of props.targets) {
    if (allSlotsFilled(uploadMap.get(tg.id), slotKeys.value)) done++
  }
  return done
})

// ════════════════════════════════════════
// 图片预览
// ════════════════════════════════════════

const previewUrl = ref('')
const previewVisible = ref(false)
function openPreview(url: string): void {
  if (!url) return
  previewUrl.value = url
  previewVisible.value = true
}

// ════════════════════════════════════════
// 导出 ZIP
// ════════════════════════════════════════

const exporting = ref(false)

function formatTs(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function exportZip(): Promise<void> {
  if (exporting.value) return
  exporting.value = true
  try {
    await buildZipAndDownload()
  } finally {
    exporting.value = false
  }
}

async function buildZipAndDownload(): Promise<void> {
  const zip = new JSZip()
  let fileCount = 0

  // 1) 上传文件：按 {targetId}/{slotKey}-{文件名} 分目录
  for (const [idStr, state] of uploadMap) {
    const targetId = Number(idStr)
    const target = targetMap.value.get(targetId)
    const label = String(target?.name ?? target?.id ?? targetId).replace(/[\\/:*?"<>|\s]+/g, '_')
    const dir = `${targetId}-${label}`
    for (const f of slotFields.value) {
      const file = getSlotFile(state, f.key)
      if (!file) continue
      const mime =
        typeof file.dataUrl === 'string'
          ? file.dataUrl.match(/^data:(image\/\w+);/)?.[1] || 'image/png'
          : file.dataUrl.type || 'image/png'
      const ext = mime.split('/')[1] || 'png'
      const safeName = file.name.replace(/[\\/:*?"<>|]+/g, '_')
      const zipPath = `${dir}/${f.key}-${safeName || `upload.${ext}`}`
      try {
        let blob: Blob
        if (typeof file.dataUrl === 'string') {
          const resp = await fetch(file.dataUrl)
          if (!resp.ok) {
            reportWarn('[FormTargetCollect] 跳过失效引用:', zipPath)
            continue
          }
          blob = await resp.blob()
        } else {
          blob = file.dataUrl
        }
        zip.file(zipPath, blob)
        fileCount++
      } catch {
        reportWarn('[FormTargetCollect] 跳过损坏文件:', zipPath)
      }
    }
  }

  // 2) 汇总 Excel
  // 列名撞车（字段 key 恰好等于某个照片位标题或「目标ID」「最后上传」）时给后写的列加序号后缀：
  // 直接覆盖会整列丢数据，而且 Excel 里看不出少了一列。
  const putCol = (row: Record<string, string | number>, label: string, value: string | number) => {
    let key = label
    for (let n = 2; Object.prototype.hasOwnProperty.call(row, key); n++) key = `${label}（${n}）`
    row[key] = value
  }
  const rows = props.targets.map((s) => {
    const up = uploadMap.get(s.id)
    const row: Record<string, string | number> = {}
    putCol(row, t('fbTarget.targetId'), s.id)
    for (const k of exportKeys.value) putCol(row, String(k), cellText(s[k]))
    for (const f of slotFields.value) {
      putCol(row, f.label, getSlotFile(up, f.key) ? t('fbTarget.uploaded') : t('fbTarget.notUploaded'))
    }
    putCol(row, t('fbTarget.lastUpload'), up?.ts ? formatTs(up.ts) : '')
    return row
  })
  const XLSX = await import('@/components/_internal/xlsx/xlsx.mjs')
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, props.schema.title || t('fbTarget.title'))
  zip.file(t('fbTarget.summaryFile'), XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))

  if (fileCount === 0) {
    toast(t('fbTarget.noFileExport'), 'warning')
    return
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${props.schema.title || t('fbTarget.title')}_${new Date().toISOString().slice(0, 10)}.zip`
  a.click()
  URL.revokeObjectURL(a.href)
  toast(`${t('fbTarget.exported')} ${fileCount}`, 'success')
}

// ════════════════════════════════════════
// 生命周期
// ════════════════════════════════════════

onMounted(async () => {
  await reloadFromBackend()
})
</script>

<template>
  <div class="ftc-wrap">
    <!-- 工具栏 -->
    <div class="ftc-toolbar">
      <h2 class="ftc-title">{{ schema.title || t('fbTarget.title') }}</h2>
      <Input v-model="keyword" :placeholder="t('fbTarget.searchPh')" class="ftc-search" />
      <span class="ftc-stat" :class="{ done: doneCount > 0 }">
        {{ doneCount }}/{{ targets.length }} {{ t('fbTarget.done') }}
      </span>
      <Button size="sm" variant="primary" :loading="exporting" @click="exportZip">
        {{ t('fbTarget.export') }}
      </Button>
      <Button size="sm" variant="outline" @click="showStoragePanel = !showStoragePanel">
        {{ cfg.backend !== 'local' ? '☁ ' + t('fbTarget.cloud') : '💾 ' + t('fbTarget.local') }}
      </Button>
      <Button size="sm" variant="ghost" @click="requestClearAll">{{ t('fbTarget.clear') }}</Button>
    </div>

    <!-- 存储面板（共享组件：三后端 radio + 字段 + 校验） -->
    <StorageConfigPanel
      v-model:visible="showStoragePanel"
      :config="cfg"
      @save="onStorageConfigSave"
      @cancel="showStoragePanel = false"
    />

    <!-- 表格里只放得下前几列，先说清"还有多少列没显示、导出是全的"，别让人以为目标只有这几列 -->
    <p v-if="hiddenFieldCount" class="ftc-fields-more">
      {{ t('fbTarget.fieldsMore', { n: hiddenFieldCount }) }}
    </p>
    <!-- 目标表格 -->
    <div class="ftc-table-wrap">
      <table class="ftc-table">
        <thead>
          <tr>
            <th style="width: calc(90px * var(--vcl-scale))">ID</th>
            <th v-for="k in displayKeys" :key="k">{{ k }}</th>
            <th v-for="f in slotFields" :key="f.key">{{ f.label }}</th>
            <th style="width: calc(60px * var(--vcl-scale))">{{ t('fbTarget.status') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in filteredTargets" :key="s.id" class="ftc-row">
            <td class="ftc-td-id">{{ s.id }}</td>
            <td v-for="k in displayKeys" :key="k" class="ftc-td-val" :title="cellText(s[k])">{{ cellText(s[k]) }}</td>
            <td v-for="f in slotFields" :key="f.key" class="ftc-td-upload">
              <Upload
                variant="card"
                mobile-menu
                :label="getSlotFile(uploadMap.get(s.id), f.key) ? '' : f.label || f.key"
                :model-value="getUploadFiles(s.id, f.key)"
                accept="image/*"
                :disabled="readonly"
                :custom-request="customRequest"
                @error="toast($event, 'error')"
                @preview="openPreview"
                @update:model-value="(files: UploadFile[]) => onUpload(s.id, f.key, files)"
              />
            </td>
            <td class="ftc-td-status">
              <span v-if="allSlotsFilled(uploadMap.get(s.id), slotKeys)" class="ftc-status-done"
                >✓ {{ t('fbTarget.doneShort') }}</span
              >
              <span v-else class="ftc-status-none">-</span>
            </td>
          </tr>
          <tr v-if="filteredTargets.length === 0">
            <td :colspan="displayKeys.length + slotFields.length + 2" class="ftc-empty">
              {{ t('fbTarget.noMatch') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Toast ref="toastRef" variant="toast" position="top" />
    <ConfirmModal
      :visible="clearConfirmVisible"
      :title="t('fbTarget.clearTitle')"
      :message="t('fbTarget.clearMessage', { n: targets.length })"
      :confirm-text="t('fbTarget.clear')"
      variant="danger"
      @update:visible="clearConfirmVisible = $event"
      @confirm="onConfirmClear"
    />
    <ImagePreview v-if="previewVisible" :src="previewUrl" @close="previewVisible = false" />
  </div>
</template>

<style scoped>
.ftc-wrap {
  padding: calc(16px * var(--vcl-scale));
  max-width: 1200px;
  margin: 0 auto;
}
.ftc-toolbar {
  display: flex;
  align-items: center;
  gap: calc(12px * var(--vcl-scale));
  flex-wrap: wrap;
  padding: calc(12px * var(--vcl-scale)) calc(16px * var(--vcl-scale));
  background: var(--color-surface, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: calc(8px * var(--vcl-scale));
  margin-bottom: calc(16px * var(--vcl-scale));
}
.ftc-title {
  margin: 0;
  font-size: var(--fs-16);
  white-space: nowrap;
}
.ftc-search {
  flex: 1;
  min-width: calc(200px * var(--vcl-scale));
}
.ftc-stat {
  padding: 2px calc(10px * var(--vcl-scale));
  border-radius: calc(10px * var(--vcl-scale));
  font-size: var(--fs-12);
  font-weight: 600;
  background: var(--color-bg-soft);
  color: #94a3b8;
  white-space: nowrap;
}
.ftc-stat.done {
  background: var(--color-success-bg);
  color: var(--color-success-text);
}
.ftc-fields-more {
  margin: 0 0 calc(6px * var(--vcl-scale));
  font-size: var(--fs-12);
  color: var(--color-text-secondary);
}
.ftc-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: calc(8px * var(--vcl-scale));
}
.ftc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-12);
  background: var(--color-bg, #fff);
}
.ftc-table th {
  text-align: left;
  padding: calc(8px * var(--vcl-scale)) calc(10px * var(--vcl-scale));
  font-weight: 600;
  font-size: var(--fs-11);
  color: var(--color-text-secondary);
  background: var(--color-surface, #f8fafc);
  border-bottom: 2px solid var(--color-border);
  white-space: nowrap;
}
.ftc-table td {
  padding: calc(6px * var(--vcl-scale)) calc(10px * var(--vcl-scale));
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}
.ftc-row:hover {
  background: var(--color-bg-alt, #f8fafc);
}
.ftc-td-id {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ftc-td-val {
  max-width: calc(160px * var(--vcl-scale));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ftc-td-upload {
  width: calc(90px * var(--vcl-scale));
  padding: calc(4px * var(--vcl-scale)) !important;
}
.ftc-td-upload :deep(.card-wrap) {
  width: calc(80px * var(--vcl-scale)) !important;
  height: calc(80px * var(--vcl-scale)) !important;
}
.ftc-td-upload :deep(.card-label) {
  font-size: var(--fs-10) !important;
}
.ftc-td-status {
  text-align: center;
  white-space: nowrap;
}
.ftc-status-done {
  color: var(--color-success-text);
  font-weight: 600;
}
.ftc-status-none {
  color: #cbd5e1;
}
.ftc-empty {
  text-align: center;
  padding: calc(40px * var(--vcl-scale));
  color: var(--color-text-muted);
}
</style>
