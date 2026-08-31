<script setup lang="ts">
/**
 * 我的表单抽屉 — 已保存表单列表（打开 / 重命名 / 删除）
 *
 * 数据与动作全部来自 useFormManager 实例（reactive 对象，模板内 ref 自动解包），
 * 本组件只承载列表 UI 与三个确认弹窗（重命名 / 删除 / 覆盖打开）。
 */
import { inject, ref, watch } from 'vue'
import { useT } from '@/components/_internal/i18n'
import Button from '@/components/basic/Button.vue'
import Drawer from '@/components/feedback/Drawer.vue'
import ModalBox from '@/components/layout/ModalBox.vue'
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import Toast from '@/components/feedback/Toast.vue'
import DataTable from '@/components/data/DataTable.vue'
import type { Column } from '@/components/data/composables/types'
import { FORM_MANAGER_KEY } from './context'
import FormDataSummary from './FormDataSummary.vue'
import FormReview from './FormReview.vue'
import { getActiveFormStore, type FormMetaItem } from './store'
import { encodeShareCode } from './share'
import type { FormDesign } from './types'

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

async function openShare(item: FormMetaItem): Promise<void> {
  // 分享码 = 编码表单完整设计（需先加载）
  const design: FormDesign | null = await activeStore().loadForm(item.id)
  if (!design) {
    showTip(t('fbd.loadFormFail'), 'error')
    return
  }
  shareCode.value = encodeShareCode(design)
  shareLink.value = `${location.origin}${location.pathname}#/form/${shareCode.value}`
  shareVisible.value = true
}

async function copyShareLink(): Promise<void> {
  const ok = await copyText(shareLink.value)
  showTip(ok ? t('fbd.shareLinkCopied') : t('fbd.copyFail'), ok ? 'success' : 'error')
}

/** 浏览器剪贴板复制（降级 execCommand） */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
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
  const item = manager.formsList.find((f) => f.id === target.id)
  if (!item) {
    renameVisible.value = false
    return
  }
  const ok = await manager.renameForm(item, renameName.value)
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
  const item = manager.formsList.find((f) => f.id === target.id)
  deleteTarget.value = null
  if (!item) return
  const ok = await manager.deleteForm(item)
  if (ok) void manager.refreshForms()
}

// ── 覆盖打开确认 ──
function onConfirmLoad(): void {
  const item = manager.pendingLoad
  manager.pendingLoad = null
  if (item) void manager.doOpenForm(item)
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
          <!-- 操作列：Vue 组件渲染（v-html 会被 sanitizeHTML 消毒，插槽不受影响） -->
          <template #cell="{ column, row }">
            <span v-if="column.key === '_actions'" class="ld-table-actions">
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
      <p class="ld-share-hint">{{ t('fbd.shareCodeHint') }}</p>
      <textarea class="ld-share-code" readonly rows="4" :value="shareCode" />
      <div class="ld-share-publish">
        <p class="ld-share-hint">{{ t('fbd.shareLinkHint') }}</p>
        <input class="ld-share-link" readonly :value="shareLink" />
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

  <!-- 重命名弹窗 -->
  <ModalBox
    :visible="renameVisible"
    :title="t('fbd.renameTitle')"
    modal-type="default"
    @update:visible="renameVisible = $event"
  >
    <div class="ld-save-form">
      <label class="ld-save-label">{{ t('fbd.saveNameLabel') }}</label>
      <input
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

<style scoped>
/* 智能表格容器 */
.ld-forms-table {
  width: 100%;
}
.ld-forms-table :deep(.dt-wrap) {
  border: none;
  border-radius: 6px;
}

/* 操作列按钮（分享/查看/审核） */
.ld-table-actions {
  display: inline-flex;
  gap: 4px;
}
.ld-table-act {
  padding: 3px 10px;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 4px;
  background: var(--color-bg, #fff);
  color: var(--color-text-secondary, #475569);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}
.ld-table-act:hover {
  background: var(--color-bg-alt, #f1f5f9);
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}
.ld-table-act[data-act='share'] {
  color: var(--color-primary, #3b82f6);
}
.ld-table-act[data-act='review'] {
  color: var(--color-warning, #d97706);
}

/* 分享弹窗 */
.ld-share {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ld-share-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
}
.ld-share-code,
.ld-share-link {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  font-size: 12px;
  font-family: inherit;
  background: var(--color-bg-alt, #f8fafc);
  color: var(--color-text, #1e293b);
}
.ld-share-code {
  resize: vertical;
  min-height: 70px;
}
.ld-share-publish {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
