<script setup lang="ts">
/**
 * 我的表单抽屉 — 已保存表单列表（打开 / 重命名 / 删除）
 *
 * 数据与动作全部来自 useFormManager 实例（reactive 对象，模板内 ref 自动解包），
 * 本组件只承载列表 UI 与三个确认弹窗（重命名 / 删除 / 覆盖打开）。
 */
import { inject, ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import IconSvg from '@/components/basic/IconSvg.vue'
import Button from '@/components/basic/Button.vue'
import Drawer from '@/components/feedback/Drawer.vue'
import ModalBox from '@/components/layout/ModalBox.vue'
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import { FORM_MANAGER_KEY } from './context'

const t = useT()

/** 表单管理实例：父级 provide 注入（共享 reactive 状态，非 prop 单向流） */
const manager = inject(FORM_MANAGER_KEY)!

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
      <ul v-else class="ld-forms-list">
        <li
          v-for="item in manager.formsList"
          :key="item.id"
          class="ld-forms-row"
          :class="{ current: item.id === manager.currentFormId }"
        >
          <div class="ld-forms-info">
            <span class="ld-forms-name" :title="item.name">{{ item.name }}</span>
            <span class="ld-forms-time">{{ item.updatedAt }}</span>
          </div>
          <div class="ld-forms-actions">
            <button class="ld-btn" :title="t('fbd.openForm')" @click="manager.requestOpenForm(item)">
              <IconSvg type="folder-open" size="xs" /> {{ t('fbd.openForm') }}
            </button>
            <button class="ld-btn" :title="t('fbd.rename')" @click="openRename(item.id, item.name)">
              <IconSvg type="pencil" size="xs" /> {{ t('fbd.rename') }}
            </button>
            <button class="ld-btn ld-danger" :title="t('common.delete')" @click="requestDelete(item.id, item.name)">
              <IconSvg type="trash-2" size="xs" /> {{ t('common.delete') }}
            </button>
          </div>
        </li>
      </ul>
    </div>
  </Drawer>

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
</template>
