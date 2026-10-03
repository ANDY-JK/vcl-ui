<script setup lang="ts">
/**
 * 添加/编辑门店弹窗
 * 外壳（遮罩/头部/焦点陷阱/ESC/滚动锁/互斥/过渡）统一走 _internal/ModalShell——
 * 2026-10-02 统一化：此前自绘外壳（还带 28px 标题与文本 ✕ 两处离族样式）。
 */
import { useIdSafe } from '@/components/_internal/useIdCompat'
import { ref, watch, computed } from 'vue'
import type { Store } from '@/components/route-planner/types'
import ModalShell from '@/components/_internal/ModalShell.vue'
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
/** 表单 id：footer 提交按钮与表体 form 的跨插槽关联（原生 form 属性） */
const formId = useIdSafe('store-form')
</script>

<template>
  <ModalShell
    :visible="visible"
    :title="isEdit ? t('routePlanner.editStore') : t('routePlanner.addStoreTitle')"
    size="md"
    @close="emit('close')"
  >
    <form :id="formId" class="store-form" @submit.prevent="handleSubmit">
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
          <input :id="fldIds.f8" v-model="form.phone" type="text" :placeholder="t('routePlanner.phonePlaceholder')" />
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
    </form>

    <template #footer>
      <button type="button" class="btn-cancel" @click="emit('close')">{{ t('routePlanner.cancel') }}</button>
      <button type="submit" :form="formId" class="btn-save">
        {{ isEdit ? t('routePlanner.saveEdit') : t('routePlanner.addStoreTitle') }}
      </button>
    </template>
  </ModalShell>
</template>

<style src="./store-form-modal-scoped.css" scoped></style>
