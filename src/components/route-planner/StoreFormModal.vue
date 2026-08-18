<script setup lang="ts">
/**
 * 添加/编辑门店弹窗
 */
import { ref, watch, computed } from 'vue'
import type { Store } from '@/components/route-planner/types'

const props = defineProps<{
  visible: boolean
  store?: Store | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
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
    coordSource: form.value.longitude && form.value.latitude ? 'manual' : 'none',
    skipped: false,
  }

  emit('save', store)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-box">
        <div class="modal-header">
          <h3>{{ isEdit ? '编辑门店' : '添加门店' }}</h3>
          <button class="btn-close" @click="emit('close')">✕</button>
        </div>

        <form class="modal-body" @submit.prevent="handleSubmit">
          <div class="form-row">
            <label><span class="required">*</span> 门店名</label>
            <input
              v-model="form.name"
              type="text"
              placeholder="如：中国移动xx营业厅"
              :class="{ 'input-error': nameError && !form.name?.trim() }"
            />
          </div>

          <div class="form-row">
            <label><span class="required">*</span> 详细地址</label>
            <input
              v-model="form.address"
              type="text"
              placeholder="如：xx市xx区xx路xx号"
              :class="{ 'input-error': nameError && !form.address?.trim() }"
            />
          </div>
          <p v-if="nameError" class="form-error">⚠️ 门店名和地址至少填写一项</p>

          <div class="form-row form-grid-4">
            <div>
              <label>省</label>
              <input v-model="form.province" type="text" placeholder="湖南省" />
            </div>
            <div>
              <label>市</label>
              <input v-model="form.city" type="text" placeholder="长沙市" />
            </div>
            <div>
              <label>区/县</label>
              <input v-model="form.district" type="text" placeholder="芙蓉区" />
            </div>
            <div>
              <label>镇/乡</label>
              <input v-model="form.town" type="text" placeholder="xx镇" />
            </div>
          </div>

          <div class="form-row form-grid-2">
            <div>
              <label>联系人</label>
              <input v-model="form.contact" type="text" placeholder="姓名" />
            </div>
            <div>
              <label>电话</label>
              <input v-model="form.phone" type="text" placeholder="11位手机号" />
            </div>
          </div>

          <div class="form-row form-grid-2">
            <div>
              <label>经度（可选）</label>
              <input v-model.number="form.longitude" type="number" step="0.000001" placeholder="113.123456" />
            </div>
            <div>
              <label>纬度（可选）</label>
              <input v-model.number="form.latitude" type="number" step="0.000001" placeholder="28.123456" />
            </div>
          </div>

          <p class="form-hint">💡 有经纬度优先使用；无经纬度时将通过地址自动解析</p>

          <div class="modal-footer">
            <button type="button" class="btn-cancel" @click="emit('close')">取消</button>
            <button type="submit" class="btn-save">
              {{ isEdit ? '保存修改' : '添加门店' }}
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
  z-index: 1000;
}

.modal-box {
  background: var(--color-surface);
  border-radius: 12px;
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border-light);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.btn-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--color-text-muted);
  padding: 4px;
}

.btn-close:hover {
  color: var(--color-text-secondary);
}

.modal-body {
  padding: 20px;
}

.form-row {
  margin-bottom: 14px;
}

.form-row label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.form-row input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.form-row input:focus {
  border-color: var(--color-primary);
}

.form-grid-2,
.form-grid-4 {
  display: grid;
  gap: 10px;
}

.form-grid-2 {
  grid-template-columns: 1fr 1fr;
}

.form-grid-4 {
  grid-template-columns: 1fr 1fr 1fr 1fr;
}

.form-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 8px 0 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border-light);
}

.btn-cancel,
.btn-save {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 14px;
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
  font-size: 12px;
  color: var(--color-danger);
  margin: 4px 0 0;
}
</style>
