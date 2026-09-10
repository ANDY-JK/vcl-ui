<script setup lang="ts">
/**
 * 添加/编辑门店弹窗
 */
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import type { Store } from '@/components/route-planner/types'
import { useEscClose } from '@/components/_internal/useEscClose'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'
import { useT } from '@/components/_internal/i18n'

const t = useT()

const props = defineProps<{
  visible: boolean
  store?: Store | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
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
            <label><span class="required">*</span> {{ t('routePlanner.storeNameLabel') }}</label>
            <input
              v-model="form.name"
              type="text"
              :placeholder="t('routePlanner.storeNamePlaceholder')"
              :class="{ 'input-error': nameError && !form.name?.trim() }"
            />
          </div>

          <div class="form-row">
            <label><span class="required">*</span> {{ t('routePlanner.addressLabel') }}</label>
            <input
              v-model="form.address"
              type="text"
              :placeholder="t('routePlanner.addressPlaceholder')"
              :class="{ 'input-error': nameError && !form.address?.trim() }"
            />
          </div>
          <p v-if="nameError" class="form-error">{{ t('routePlanner.nameAddressRequired') }}</p>

          <div class="form-row form-grid-4">
            <div>
              <label>{{ t('routePlanner.province') }}</label>
              <input v-model="form.province" type="text" :placeholder="t('routePlanner.provincePlaceholder')" />
            </div>
            <div>
              <label>{{ t('routePlanner.city') }}</label>
              <input v-model="form.city" type="text" :placeholder="t('routePlanner.cityPlaceholder')" />
            </div>
            <div>
              <label>{{ t('routePlanner.district') }}</label>
              <input v-model="form.district" type="text" :placeholder="t('routePlanner.districtPlaceholder')" />
            </div>
            <div>
              <label>{{ t('routePlanner.town') }}</label>
              <input v-model="form.town" type="text" :placeholder="t('routePlanner.townPlaceholder')" />
            </div>
          </div>

          <div class="form-row form-grid-2">
            <div>
              <label>{{ t('routePlanner.contact') }}</label>
              <input v-model="form.contact" type="text" :placeholder="t('routePlanner.contactPlaceholder')" />
            </div>
            <div>
              <label>{{ t('routePlanner.phone') }}</label>
              <input v-model="form.phone" type="text" :placeholder="t('routePlanner.phonePlaceholder')" />
            </div>
          </div>

          <div class="form-row form-grid-2">
            <div>
              <label>{{ t('routePlanner.longitudeOptional') }}</label>
              <input v-model.number="form.longitude" type="number" step="0.000001" placeholder="113.123456" />
            </div>
            <div>
              <label>{{ t('routePlanner.latitudeOptional') }}</label>
              <input v-model.number="form.latitude" type="number" step="0.000001" placeholder="28.123456" />
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
  z-index: var(--z-modal, 1000);
}

.modal-box {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  width: clamp(360px, 50vw, 480px);
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4) 20px;
  border-bottom: 1px solid var(--color-border-light);
}

.modal-header h3 {
  margin: 0;
  font-size: clamp(16px, 2.5vw, 28px);
  font-weight: 600;
}

.btn-close {
  background: none;
  border: none;
  font-size: clamp(18px, 3vw, 28px);
  cursor: pointer;
  color: var(--color-text-muted);
  padding: var(--space-1);
}

.btn-close:hover {
  color: var(--color-text-secondary);
}

.modal-body {
  padding: var(--space-5);
}

.form-row {
  margin-bottom: var(--space-3);
}

.form-row label {
  display: block;
  font-size: clamp(12px, 1.8vw, 15px);
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-1);
}

.form-row input {
  width: 100%;
  padding: var(--space-2) 12px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  font-size: clamp(14px, 1.8vw, 15px);
  outline: none;
  transition: border-color 0.2s;
}

.form-row input:focus {
  border-color: var(--color-primary);
}

.form-grid-2,
.form-grid-4 {
  display: grid;
  gap: var(--space-2);
}

.form-grid-2 {
  grid-template-columns: 1fr 1fr;
}

.form-grid-4 {
  grid-template-columns: 1fr 1fr 1fr 1fr;
}

.form-hint {
  font-size: clamp(12px, 1.8vw, 15px);
  color: var(--color-text-muted);
  margin: var(--space-2) 0 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-light);
}

.btn-cancel,
.btn-save {
  padding: var(--space-2) 20px;
  border-radius: var(--radius-md);
  font-size: clamp(14px, 1.8vw, 15px);
  cursor: pointer;
  border: 1px solid;
  transition: all 0.2s;
}

.btn-cancel {
  background: var(--color-surface);
  border-color: var(--color-border-light);
  color: var(--color-text-secondary);
}

.btn-cancel:hover {
  background: var(--color-bg);
}

.btn-save {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-surface);
}

.btn-save:hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.required {
  color: var(--color-danger);
  font-weight: 700;
}

.input-error {
  border-color: var(--color-danger) !important;
  background: var(--color-danger-bg);
}

.form-error {
  font-size: clamp(12px, 1.8vw, 15px);
  color: var(--color-danger);
  margin: var(--space-1) 0 0;
}
</style>
