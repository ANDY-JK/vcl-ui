<script setup lang="ts">
/**
 * 我的表单抽屉 — 已保存表单列表（打开 / 重命名 / 删除）
 *
 * 数据与动作全部来自 useFormManager 实例（reactive 对象，模板内 ref 自动解包），
 * 本组件只承载列表 UI 与三个确认弹窗（重命名 / 删除 / 覆盖打开）。
 */
import { useIdSafe } from '@/components/_internal/useIdCompat'
import { inject, ref, watch } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { copyText } from '@/components/_internal/useCopy'
import Button from '@/components/basic/Button.vue'
import Drawer from '@/components/feedback/Drawer.vue'
import ModalBox from '@/components/layout/ModalBox.vue'
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import Toast from '@/components/feedback/Toast.vue'
import DataTable from '@/components/data/DataTable.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import type { Column } from '@/components/data/composables/types'
import { FORM_MANAGER_KEY } from './context'
import FormDataSummary from './FormDataSummary.vue'
import FormReview from './FormReview.vue'
import FormCollect from '../FormCollect.vue'
import { getActiveFormStore, type FormMetaItem } from './store'
import { encodeShareCode, shareShortLink } from './share'
import QRCode from 'qrcode/lib/browser.js'
import { flattenNodes, type FormDesign } from './types'

const t = useT()

/** 表单管理实例：父级 provide 注入（共享 reactive 状态，非 prop 单向流） */
const manager = inject(FORM_MANAGER_KEY)!

const toastRef = ref<InstanceType<typeof Toast>>()
const showTip = (msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') =>
  toastRef.value?.show(msg, type, 2000)

/** 当前活动存储（分享需加载表单设计） */
const activeStore = () => getActiveFormStore()

// ── 智能表格列定义 ──
/** 表单列表 → DataTable 行 */
const tableRows = ref(
  manager.formsList.map((f) => ({
    id: f.id,
    name: f.name,
    updatedAt: f.updatedAt,
    _item: f,
  })),
)

const tableColumns = ref<Column[]>([
  {
    key: 'name',
    title: t('fbd.formName'),
    width: '1fr',
    render: (v: unknown) => String(v ?? ''),
  },
  {
    key: 'updatedAt',
    title: t('fbd.updatedAt'),
    width: 140,
  },
  {
    key: '_actions',
    title: t('fbd.actions'),
    width: 260,
    align: 'right',
    // 操作列（分享/查看/审核/重命名/删除）—— 实际渲染走模板 #cell 插槽（v-html 会被 sanitizeHTML 消毒）
    cell: () => '',
  },
])

// ── 分享弹窗状态 ──
const shareVisible = ref(false)
const shareCode = ref('')
const shareLink = ref('')
/** 发布链接二维码（dataURL，动态加载 qrcode 生成） */
const shareQr = ref('')
/** 二维码生成失败提示（链接过长超出二维码容量） */
const shareQrError = ref('')

async function openShare(item: FormMetaItem): Promise<void> {
  // 分享码 = 编码表单完整设计（需先加载）
  const design: FormDesign | null = await activeStore().loadForm(item.id)
  if (!design) {
    showTip(t('fbd.loadFormFail'), 'error')
    return
  }
  shareCode.value = encodeShareCode(design)
  // 发布链接 = 短链（设计已存 store，仅带 id，二维码容量有限保证可扫码）
  shareLink.value = shareShortLink(item.id)
  // 异步生成二维码（不阻塞弹窗打开）
  void generateQr()
  shareVisible.value = true
}

/** 发布链接 → 二维码 dataURL（qrcode 浏览器端实现；短链只有几十字符，任何表单都能放下） */
async function generateQr(): Promise<void> {
  shareQr.value = ''
  shareQrError.value = ''
  try {
    shareQr.value = await QRCode.toDataURL(shareLink.value, {
      width: 180,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
  } catch {
    shareQr.value = ''
    shareQrError.value = t('fbd.qrGenFail')
  }
}

async function copyShareCode(): Promise<void> {
  const ok = await copyText(shareCode.value)
  showTip(ok ? t('fbd.shareCopied') : t('fbd.copyFail'), ok ? 'success' : 'error')
}

async function copyShareLink(): Promise<void> {
  const ok = await copyText(shareLink.value)
  showTip(ok ? t('fbd.shareLinkCopied') : t('fbd.copyFail'), ok ? 'success' : 'error')
}

// ── 审核模式弹窗状态 ──
const reviewTarget = ref<FormMetaItem | null>(null)
function openReview(item: FormMetaItem): void {
  reviewTarget.value = item
}

// ── 数据汇总弹窗状态 ──
const summaryTarget = ref<FormMetaItem | null>(null)

function openSummary(item: FormMetaItem): void {
  summaryTarget.value = item
}

// ── 收集列表弹窗（点表单名打开：该表单的收集记录列表） ──
const collectTarget = ref<FormMetaItem | null>(null)
const collectDesign = ref<FormDesign | null>(null)
const collectLoading = ref(false)

async function openCollect(item: FormMetaItem): Promise<void> {
  collectLoading.value = true
  try {
    const design = await activeStore().loadForm(item.id)
    collectDesign.value = design
    collectTarget.value = item
  } catch {
    showTip(t('fbd.loadFormFail'), 'error')
  } finally {
    collectLoading.value = false
  }
}

// ── 表格操作列按钮（#cell 插槽直接回调，row 含 _item） ──
function onTableAction(act: string, row: Record<string, unknown>): void {
  const item = row._item as FormMetaItem
  if (!item) return
  if (act === 'share') void openShare(item)
  else if (act === 'view') openSummary(item)
  else if (act === 'review') openReview(item)
  else if (act === 'rename') openRename(item.id, item.name)
  else if (act === 'delete') requestDelete(item.id, item.name)
}

// 表单列表变化时同步表格行
watch(
  () => manager.formsList,
  (list) => {
    tableRows.value = list.map((f) => ({
      id: f.id,
      name: f.name,
      updatedAt: f.updatedAt,
      _item: f,
    }))
  },
  { deep: true },
)

// ── 重命名弹窗本地状态 ──
const renameVisible = ref(false)
const renameName = ref('')
const renameTarget = ref<{ id: string; name: string } | null>(null)

function openRename(id: string, name: string): void {
  renameTarget.value = { id, name }
  renameName.value = name
  renameVisible.value = true
}

async function onConfirmRename(): Promise<void> {
  const target = renameTarget.value
  if (!target) return
  // 第 151 轮：列表可能已经刷新过、目标行不在了。原来这里 `return` —— 用户点了确认
  // **什么都不发生也没有提示**，只会以为按钮坏了。改为把目标（至少 id/名字）交给 manager，
  // 由它去库里查一次并如实报"该表单已不存在"。
  const item = manager.formsList.find((f) => f.id === target.id) ?? {
    id: target.id,
    name: target.name,
  }
  const ok = await manager.renameForm(item as FormMetaItem, renameName.value)
  if (ok) {
    renameVisible.value = false
    void manager.refreshForms()
  }
}

// ── 删除确认 ──
const deleteTarget = ref<{ id: string; name: string } | null>(null)

function requestDelete(id: string, name: string): void {
  deleteTarget.value = { id, name }
}

async function onConfirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (!target) return
  // 同上：列表里找不到也要交给 manager，由它查库后如实报告
  const item = manager.formsList.find((f) => f.id === target.id) ?? {
    id: target.id,
    name: target.name,
  }
  deleteTarget.value = null
  const ok = await manager.deleteForm(item as FormMetaItem)
  if (ok) void manager.refreshForms()
}

// ── 覆盖打开确认 ──
function onConfirmLoad(): void {
  const item = manager.pendingLoad
  manager.pendingLoad = null
  if (item) void manager.doOpenForm(item)
}
/** 悬空 label 的配对 id —— 逐实例生成，字面量 id 在多实例组件里会重复、for 会指错元素 */
const fldIds = {
  f1: useIdSafe('fld'),
}
</script>

<template>
  <Drawer :visible="manager.formsOpen" :title="t('fbd.myForms')" @update:visible="manager.formsOpen = $event">
    <div class="ld-forms">
      <div v-if="manager.formsLoading" class="ld-forms-state" role="status">{{ t('fbd.loadingList') }}</div>
      <div v-else-if="manager.formsError" class="ld-forms-state ld-forms-error" role="alert">
        {{ manager.formsError }}
      </div>
      <div v-else-if="!manager.formsList.length" class="ld-forms-state">{{ t('fbd.formsEmpty') }}</div>
      <!-- 智能表格：表单列表 + 操作列（分享/查看/审核/重命名/删除） -->
      <div v-else class="ld-forms-table">
        <DataTable :columns="tableColumns" :data="tableRows" row-key="id" :page-size="10">
          <!-- 名称列：点击打开该表单的收集列表 -->
          <template #cell="{ column, row }">
            <span v-if="column.key === 'name'" class="ld-form-link" @click="openCollect(row._item)">{{
              row.name
            }}</span>
            <!-- 操作列：Vue 组件渲染（v-html 会被 sanitizeHTML 消毒，插槽不受影响） -->
            <span v-else-if="column.key === '_actions'" class="ld-table-actions">
              <button class="ld-table-act" data-act="share" :data-id="row.id" @click="onTableAction('share', row)">
                {{ t('fbd.share') }}
              </button>
              <button class="ld-table-act" data-act="view" :data-id="row.id" @click="onTableAction('view', row)">
                {{ t('fbd.viewData') }}
              </button>
              <button class="ld-table-act" data-act="review" :data-id="row.id" @click="onTableAction('review', row)">
                {{ t('fbd.review') }}
              </button>
              <button class="ld-table-act" data-act="rename" :data-id="row.id" @click="onTableAction('rename', row)">
                {{ t('fbd.rename') }}
              </button>
              <button
                class="ld-table-act ld-danger"
                data-act="delete"
                :data-id="row.id"
                @click="onTableAction('delete', row)"
              >
                {{ t('common.delete') }}
              </button>
            </span>
            <span v-else>{{ row[column.key] }}</span>
          </template>
        </DataTable>
      </div>
    </div>
  </Drawer>

  <!-- 分享弹窗（生成发布链接 / 分享码） -->
  <ModalBox
    :visible="shareVisible"
    :title="t('fbd.shareTitle')"
    modal-type="default"
    @update:visible="shareVisible = $event"
  >
    <div class="ld-share">
      <!-- 左侧：发布链接二维码（手机扫码即开填写） -->
      <div class="ld-share-qr">
        <img v-if="shareQr" class="ld-share-qr-img" :src="shareQr" alt="QR" />
        <div v-else-if="shareQrError" class="ld-share-qr-error" role="alert">
          <IconSvg type="alert-circle" size="sm" />
          <span>{{ shareQrError }}</span>
        </div>
        <div v-else class="ld-share-qr-placeholder" role="status">{{ t('fbd.qrLoading') }}</div>
        <p class="ld-share-qr-hint">{{ t('fbd.shareQrHint') }}</p>
      </div>
      <!-- 右侧：分享码 / 发布链接，点击卡片即复制 -->
      <div class="ld-share-cols">
        <button type="button" class="ld-share-copy" :title="t('fbd.clickCopy')" @click="copyShareCode">
          <span class="ld-share-copy-label">{{ t('fbd.shareCode') }}</span>
          <span class="ld-share-copy-value">{{ shareCode }}</span>
          <span class="ld-share-copy-tip">{{ t('fbd.clickCopy') }}</span>
        </button>
        <button type="button" class="ld-share-copy" :title="t('fbd.clickCopy')" @click="copyShareLink">
          <span class="ld-share-copy-label">{{ t('fbd.shareLink') }}</span>
          <span class="ld-share-copy-value">{{ shareLink }}</span>
          <span class="ld-share-copy-tip">{{ t('fbd.clickCopy') }}</span>
        </button>
      </div>
    </div>
    <template #footer>
      <Button :text="t('common.cancel')" variant="secondary" @click="shareVisible = false" />
      <Button :text="t('fbd.shareLinkCopy')" variant="primary" :icon="'link'" @click="copyShareLink" />
    </template>
  </ModalBox>

  <!-- 审核模式弹窗：以 review 模式渲染表单（全字段可编辑 + 自动保存/提交到 saveUrl） -->
  <ModalBox
    :visible="!!reviewTarget"
    :title="t('fbd.reviewTitle', { name: reviewTarget?.name ?? '' })"
    modal-type="default"
    size="lg"
    @update:visible="reviewTarget = null"
  >
    <FormReview :item="reviewTarget" />
  </ModalBox>

  <!-- 收集列表弹窗：点表单名打开——该表单的收集记录列表（FormCollect 收集页） -->
  <ModalBox
    :visible="!!collectTarget"
    :title="t('fbd.collectListTitle', { name: collectTarget?.name ?? '' })"
    modal-type="default"
    size="xl"
    @update:visible="collectTarget = null"
  >
    <div v-if="collectLoading" class="ld-forms-state" role="status">{{ t('fbd.loadingList') }}</div>
    <FormCollect
      v-else-if="collectDesign && collectTarget"
      :fields="flattenNodes(collectDesign.nodes ?? collectDesign.fields ?? [])"
      :meta="collectDesign.meta ?? {}"
      :storage-key="collectTarget.collectKey"
    />
  </ModalBox>

  <!-- 重命名弹窗 -->
  <ModalBox
    :visible="renameVisible"
    :title="t('fbd.renameTitle')"
    modal-type="default"
    @update:visible="renameVisible = $event"
  >
    <div class="ld-save-form">
      <label :for="fldIds.f1" class="ld-save-label">{{ t('fbd.saveNameLabel') }}</label>
      <input
        :id="fldIds.f1"
        v-model="renameName"
        class="ld-save-input"
        :placeholder="t('fbd.saveNamePh')"
        @keydown.enter.prevent="onConfirmRename"
      />
    </div>
    <template #footer>
      <Button :text="t('common.cancel')" variant="secondary" @click="renameVisible = false" />
      <Button
        :text="manager.renaming ? t('fbd.saving') : t('common.confirm')"
        variant="primary"
        :loading="manager.renaming"
        :disabled="manager.renaming"
        @click="onConfirmRename"
      />
    </template>
  </ModalBox>

  <!-- 删除确认 -->
  <ConfirmModal
    :visible="!!deleteTarget"
    :title="t('fbd.deleteFormTitle')"
    :message="t('fbd.deleteFormMsg', { name: deleteTarget?.name ?? '' })"
    :confirm-text="t('common.delete')"
    variant="danger"
    @update:visible="deleteTarget = null"
    @confirm="onConfirmDelete"
  />

  <!-- 非空画布覆盖打开确认 -->
  <ConfirmModal
    :visible="!!manager.pendingLoad"
    :title="t('fbd.loadConfirmTitle')"
    :message="t('fbd.loadConfirmMsg', { n: manager.pendingLoad ? manager.pendingLoad.name : '' })"
    :confirm-text="t('fbd.openForm')"
    variant="warning"
    @update:visible="manager.pendingLoad = null"
    @confirm="onConfirmLoad"
  />

  <!-- 数据汇总弹窗 -->
  <FormDataSummary :visible="!!summaryTarget" :item="summaryTarget" @update:visible="summaryTarget = null" />

  <Toast ref="toastRef" variant="toast" position="top" />
</template>

<style scoped src="./SavedFormsDrawer.css"></style>
