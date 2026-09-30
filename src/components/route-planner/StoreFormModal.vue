<script setup lang="ts">
/**
 * 添加/编辑门店弹窗
 */
import { useIdSafe } from '@/components/_internal/useIdCompat'
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import type { Store } from '@/components/route-planner/types'
import { useEscClose } from '@/components/_internal/useEscClose'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'
import { useT } from '@/components/_internal/i18n'

const t = useT()

const props = defineProps<{
  /** 显隐 */
  visible: boolean
  /** 编辑目标（null = 新增模式） */
  store?: Store | null
}>()

const emit = defineEmits<{
  /** 关闭弹窗（取消/Esc） */
  (e: 'close'): void
  /** 保存：[完整门店数据]（宿主负责落库） */
  (e: 'save', store: Store): void
}>()

const modalBoxRef = ref<HTMLElement | null>(null)

// 焦点陷阱：打开时聚焦弹窗、Tab 循环、关闭时恢复焦点（内部自动 watch visible）
useFocusTrap({
  visible: computed(() => props.visible),
  getContainer: () => modalBoxRef.value,
})
// ESC 关闭
const { mount: mountEsc, unmount: unmountEsc } = useEscClose(
  () => props.visible,
  () => true,
  () => emit('close'),
)
onMounted(mountEsc)
onUnmounted(unmountEsc)

const form = ref<Partial<Store>>({
  name: '',
  address: '',
  province: '',
  city: '',
  district: '',
  town: '',
  contact: '',
  phone: '',
  longitude: null,
  latitude: null,
})

const isEdit = computed(() => !!props.store)
const nameError = ref(false)

watch(
  () => props.visible,
  (val) => {
    if (val) {
      nameError.value = false
      if (props.store) {
        form.value = { ...props.store }
      } else {
        form.value = {
          name: '',
          address: '',
          province: '',
          city: '',
          district: '',
          town: '',
          contact: '',
          phone: '',
          longitude: null,
          latitude: null,
        }
      }
    }
  },
)

function handleSubmit(): void {
  // 门店名和地址至少填一个
  if (!form.value.name?.trim() && !form.value.address?.trim()) {
    nameError.value = true
    return
  }

  // 坐标是否被用户改动（编辑场景对比打开时的原始坐标）
  const coordsChanged =
    !props.store ||
    form.value.longitude !== (props.store.longitude ?? null) ||
    form.value.latitude !== (props.store.latitude ?? null)

  const store: Store = {
    id: props.store?.id || `store_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: form.value.name?.trim() || '',
    address: form.value.address?.trim() || '',
    province: form.value.province?.trim() || '',
    city: form.value.city?.trim() || '',
    district: form.value.district?.trim() || '',
    town: form.value.town?.trim() || '',
    contact: form.value.contact?.trim() || '',
    phone: form.value.phone?.trim() || '',
    longitude: form.value.longitude ?? null,
    latitude: form.value.latitude ?? null,
    // 编辑时保留原有状态：坐标未改动则不覆盖 coordSource，跳过状态不因编辑被静默重置
    coordSource:
      form.value.longitude && form.value.latitude
        ? coordsChanged
          ? 'manual'
          : (props.store?.coordSource ?? 'manual')
        : 'none',
    skipped: props.store?.skipped ?? false,
  }

  emit('save', store)
  emit('close')
}
/** 悬空 label 的配对 id —— 逐实例生成，字面量 id 在多实例组件里会重复、for 会指错元素 */
const fldIds = {
  f1: useIdSafe('fld'),
  f2: useIdSafe('fld'),
  f3: useIdSafe('fld'),
  f4: useIdSafe('fld'),
  f5: useIdSafe('fld'),
  f6: useIdSafe('fld'),
  f7: useIdSafe('fld'),
  f8: useIdSafe('fld'),
  f9: useIdSafe('fld'),
  f10: useIdSafe('fld'),
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="emit('close')">
      <div
        ref="modalBoxRef"
        class="modal-box"
        role="dialog"
        aria-modal="true"
        :aria-label="isEdit ? t('routePlanner.editStore') : t('routePlanner.addStoreTitle')"
      >
        <div class="modal-header">
          <h3>{{ isEdit ? t('routePlanner.editStore') : t('routePlanner.addStoreTitle') }}</h3>
          <button class="btn-close" :aria-label="t('routePlanner.cancel')" @click="emit('close')">✕</button>
        </div>

        <form class="modal-body" @submit.prevent="handleSubmit">
          <div class="form-row">
            <label :for="fldIds.f1"><span class="required">*</span> {{ t('routePlanner.storeNameLabel') }}</label>
            <input
              :id="fldIds.f1"
              v-model="form.name"
              type="text"
              :placeholder="t('routePlanner.storeNamePlaceholder')"
              :class="{ 'input-error': nameError && !form.name?.trim() }"
            />
          </div>

          <div class="form-row">
            <label :for="fldIds.f2"><span class="required">*</span> {{ t('routePlanner.addressLabel') }}</label>
            <input
              :id="fldIds.f2"
              v-model="form.address"
              type="text"
              :placeholder="t('routePlanner.addressPlaceholder')"
              :class="{ 'input-error': nameError && !form.address?.trim() }"
            />
          </div>
          <p v-if="nameError" class="form-error">{{ t('routePlanner.nameAddressRequired') }}</p>

          <div class="form-row form-grid-4">
            <div>
              <label :for="fldIds.f3">{{ t('routePlanner.province') }}</label>
              <input
                :id="fldIds.f3"
                v-model="form.province"
                type="text"
                :placeholder="t('routePlanner.provincePlaceholder')"
              />
            </div>
            <div>
              <label :for="fldIds.f4">{{ t('routePlanner.city') }}</label>
              <input :id="fldIds.f4" v-model="form.city" type="text" :placeholder="t('routePlanner.cityPlaceholder')" />
            </div>
            <div>
              <label :for="fldIds.f5">{{ t('routePlanner.district') }}</label>
              <input
                :id="fldIds.f5"
                v-model="form.district"
                type="text"
                :placeholder="t('routePlanner.districtPlaceholder')"
              />
            </div>
            <div>
              <label :for="fldIds.f6">{{ t('routePlanner.town') }}</label>
              <input :id="fldIds.f6" v-model="form.town" type="text" :placeholder="t('routePlanner.townPlaceholder')" />
            </div>
          </div>

          <div class="form-row form-grid-2">
            <div>
              <label :for="fldIds.f7">{{ t('routePlanner.contact') }}</label>
              <input
                :id="fldIds.f7"
                v-model="form.contact"
                type="text"
                :placeholder="t('routePlanner.contactPlaceholder')"
              />
            </div>
            <div>
              <label :for="fldIds.f8">{{ t('routePlanner.phone') }}</label>
              <input
                :id="fldIds.f8"
                v-model="form.phone"
                type="text"
                :placeholder="t('routePlanner.phonePlaceholder')"
              />
            </div>
          </div>

          <div class="form-row form-grid-2">
            <div>
              <label :for="fldIds.f9">{{ t('routePlanner.longitudeOptional') }}</label>
              <input
                :id="fldIds.f9"
                v-model.number="form.longitude"
                type="number"
                step="0.000001"
                placeholder="113.123456"
              />
            </div>
            <div>
              <label :for="fldIds.f10">{{ t('routePlanner.latitudeOptional') }}</label>
              <input
                :id="fldIds.f10"
                v-model.number="form.latitude"
                type="number"
                step="0.000001"
                placeholder="28.123456"
              />
            </div>
          </div>

          <p class="form-hint">{{ t('routePlanner.coordHint') }}</p>

          <div class="modal-footer">
            <button type="button" class="btn-cancel" @click="emit('close')">{{ t('routePlanner.cancel') }}</button>
            <button type="submit" class="btn-save">
              {{ isEdit ? t('routePlanner.saveEdit') : t('routePlanner.addStoreTitle') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--vcl-z-modal, 1000);
}

.modal-box {
  background: var(--vcl-color-surface);
  border-radius: var(--vcl-radius-lg);
  width: calc(480px * var(--vcl-scale));
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: var(--vcl-shadow-lg);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--vcl-space-4) calc(20px * var(--vcl-scale));
  border-bottom: 1px solid var(--vcl-color-border-light);
}

.modal-header h3 {
  margin: 0;
  font-size: calc(28px * var(--vcl-scale));
  font-weight: 600;
}

.btn-close {
  background: none;
  border: none;
  font-size: calc(28px * var(--vcl-scale));
  cursor: pointer;
  color: var(--vcl-color-text-muted);
  padding: var(--vcl-space-1);
}

.btn-close:hover {
  color: var(--vcl-color-text-secondary);
}

.modal-body {
  padding: var(--vcl-space-5);
}

.form-row {
  margin-bottom: var(--vcl-space-3);
}

.form-row label {
  display: block;
  font-size: calc(15px * var(--vcl-scale));
  font-weight: 500;
  color: var(--vcl-color-text-secondary);
  margin-bottom: var(--vcl-space-1);
}

.form-row input {
  width: 100%;
  padding: var(--vcl-space-2) calc(12px * var(--vcl-scale));
  border: 1px solid var(--vcl-color-border-light);
  border-radius: var(--vcl-radius-md);
  font-size: calc(15px * var(--vcl-scale));
  outline: none;
  transition: border-color 0.2s;
}

.form-row input:focus {
  border-color: var(--vcl-color-primary);
}

.form-grid-2,
.form-grid-4 {
  display: grid;
  gap: var(--vcl-space-2);
}

.form-grid-2 {
  grid-template-columns: 1fr 1fr;
}

.form-grid-4 {
  grid-template-columns: 1fr 1fr 1fr 1fr;
}

.form-hint {
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  margin: var(--vcl-space-2) 0 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--vcl-space-2);
  padding-top: var(--vcl-space-4);
  border-top: 1px solid var(--vcl-color-border-light);
}

.btn-cancel,
.btn-save {
  padding: var(--vcl-space-2) calc(20px * var(--vcl-scale));
  border-radius: var(--vcl-radius-md);
  font-size: calc(15px * var(--vcl-scale));
  cursor: pointer;
  border: 1px solid;
  transition: all 0.2s;
}

.btn-cancel {
  background: var(--vcl-color-surface);
  border-color: var(--vcl-color-border-light);
  color: var(--vcl-color-text-secondary);
}

.btn-cancel:hover {
  background: var(--vcl-color-bg);
}

.btn-save {
  background: var(--vcl-color-primary);
  border-color: var(--vcl-color-primary);
  color: var(--vcl-color-surface);
}

.btn-save:hover {
  background: var(--vcl-color-primary-hover);
  border-color: var(--vcl-color-primary-hover);
}

.required {
  color: var(--vcl-color-danger-on-surface);
  font-weight: 700;
}

.input-error {
  border-color: var(--vcl-color-danger-on-surface) !important;
  background: var(--vcl-color-danger-bg);
}

.form-error {
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-danger-on-surface);
  margin: var(--vcl-space-1) 0 0;
}
</style>
