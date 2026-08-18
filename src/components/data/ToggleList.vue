<script setup lang="ts">
// ⛔ 保护 — 切换列表，禁止：clamp() → px，展开/折叠动画
//    需我确认：ExtraColumn 接口扩展、toggle 行为
import IconSvg from '@/components/basic/IconSvg.vue'

interface ExtraColumn {
  key: string
  label: string
}

interface Props {
  items: Record<string, any>[]
  idKey?: string
  titleField?: string
  descriptionField?: string
  iconField?: string
  toggleField?: string
  extraColumns?: ExtraColumn[]
  disabled?: boolean
  isLoading?: boolean
  emptyText?: string
  /** 'switch' = 开关列表, 'button' = 操作按钮（发快递等场景） */
  variant?: 'switch' | 'button'
  /** variant='button' 时按钮文字 */
  buttonLabel?: string
  /** variant='button' 时手机号字段 */
  phoneField?: string
}

const props = withDefaults(defineProps<Props>(), {
  idKey: 'id',
  titleField: 'display_name',
  descriptionField: 'description',
  iconField: 'icon',
  toggleField: 'is_enabled',
  extraColumns: () => [],
  disabled: false,
  isLoading: false,
  emptyText: '暂无数据',
  variant: 'switch',
  buttonLabel: '发快递',
  phoneField: 'phone',
})

const emit = defineEmits<{
  toggle: [item: Record<string, any>, newValue: boolean]
  itemClick: [item: Record<string, any>]
  /** variant='button' 时点击按钮，payload: { name, phone, address, item } */
  buttonClick: [payload: { name: string; phone: string; address: string; item: Record<string, any> }]
}>()

/** switch toggle — 同步更新 item 数据，使 extraColumns 等状态标签立即更新 */
function onToggle(item: Record<string, any>, newValue: boolean) {
  if (props.toggleField) {
    item[props.toggleField] = newValue
  }
  emit('toggle', item, newValue)
}
</script>

<template>
  <div class="toggle-list">
    <div v-if="isLoading" class="list-loading">
      <IconSvg type="loader" size="lg" />
      <span>加载中...</span>
    </div>

    <div v-else-if="!items.length" class="list-empty">
      <IconSvg type="circle-alert" size="lg" color="var(--color-text-muted)" />
      <span>{{ emptyText }}</span>
    </div>

    <div v-else class="list-items">
      <div v-for="item in items" :key="item[idKey]" class="list-item" @click="emit('itemClick', item)">
        <div v-if="item[iconField]" class="item-icon">
          <IconSvg :type="item[iconField]" size="md" />
        </div>
        <div class="item-content">
          <div class="item-title">
            {{ item[titleField] }}
          </div>
          <div v-if="item[descriptionField]" class="item-desc">
            {{ item[descriptionField] }}
          </div>
        </div>
        <div v-if="extraColumns.length" class="item-extras">
          <span v-for="col in extraColumns" :key="col.key" class="item-extra">{{ item[col.key] }}</span>
        </div>
        <!-- 开关变体 -->
        <label
          v-if="variant === 'switch' && toggleField && item[toggleField] !== undefined"
          class="item-toggle"
          @click.stop
        >
          <input
            type="checkbox"
            class="toggle-input"
            :checked="item[toggleField]"
            :disabled="disabled"
            @change="onToggle(item, ($event.target as HTMLInputElement).checked)"
          />
          <span class="toggle-switch" :class="{ disabled }" />
        </label>

        <!-- 按钮变体 -->
        <button
          v-if="variant === 'button'"
          class="item-action-btn"
          :disabled="disabled"
          @click.stop="
            emit('buttonClick', {
              name: item[titleField],
              phone: item[phoneField] ?? '',
              address: item[descriptionField] ?? '',
              item,
            })
          "
        >
          {{ buttonLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toggle-list {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  overflow: hidden;
}

.list-loading,
.list-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(6px, 1vw, 8px);
  padding: clamp(24px, 5vw, 40px) clamp(12px, 2.5vw, 20px);
  color: var(--color-text-muted);
  font-size: clamp(11px, 1.8vw, 13px);
}
.list-loading svg {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.list-item {
  display: flex;
  align-items: center;
  gap: clamp(8px, 1.5vw, 12px);
  padding: clamp(8px, 1.5vw, 12px) clamp(10px, 2vw, 16px);
  border-bottom: 1px solid var(--color-border-light);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.list-item:last-child {
  border-bottom: none;
}
.list-item:hover {
  background: var(--color-bg-alt);
}

.item-icon {
  width: clamp(30px, 5.5vw, 38px);
  height: clamp(30px, 5.5vw, 38px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-alt);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
}
.item-content {
  flex: 1;
  min-width: 0;
}
.item-title {
  font-size: clamp(12px, 1.8vw, 14px);
  font-weight: 500;
}
.item-desc {
  font-size: clamp(11px, 1.5vw, 12px);
  color: var(--color-text-muted);
  margin-top: var(--space-1);
}

.item-extras {
  display: flex;
  gap: clamp(8px, 2vw, 16px);
}
.item-extra {
  font-size: clamp(11px, 1.5vw, 12px);
  color: var(--color-text-muted);
}

/* 开关 */
.item-toggle {
  display: flex;
  flex-shrink: 0;
}
.toggle-input {
  display: none;
}
.toggle-switch {
  width: clamp(40px, 6vw, 46px);
  height: clamp(22px, 3.2vw, 26px);
  background: var(--color-border);
  border-radius: var(--radius-lg);
  position: relative;
  cursor: pointer;
  transition: background var(--transition-fast);
}
.toggle-switch.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: clamp(18px, 2.8vw, 22px);
  height: clamp(18px, 2.8vw, 22px);
  background: white;
  border-radius: 50%;
  transition: transform var(--transition-fast);
  box-shadow: var(--shadow-sm);
}
.toggle-input:checked + .toggle-switch {
  background: var(--color-primary);
}
.toggle-input:checked + .toggle-switch::after {
  transform: translateX(20px);
}

/* 操作按钮 */
.item-action-btn {
  flex-shrink: 0;
  padding: var(--space-1) clamp(10px, 2vw, 14px);
  font-size: clamp(11px, 1.5vw, 12px);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
  transition: opacity var(--transition-fast);
  white-space: nowrap;
}
.item-action-btn:hover {
  opacity: 0.85;
}
.item-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
