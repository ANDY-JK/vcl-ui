<script setup lang="ts">
/**
 * 门店管理面板 — 分组视图 + 搜索 + CRUD
 */
import { ref, computed } from 'vue'
import type { Store } from '@/components/route-planner/types'
import { useT } from '@/components/_internal/i18n'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'

const t = useT()

const props = defineProps<{
  /** 门店列表（按城市分组展示，支持搜索过滤） */
  stores: Store[]
}>()

const emit = defineEmits<{
  /** 点击「新增门店」 */
  (e: 'add'): void
  /** 点击某门店的编辑 */
  (e: 'edit', store: Store): void
  /** 删除单个门店：[门店 id] */
  (e: 'remove', id: string): void
  /** 切换单个门店跳过态：[门店 id] */
  (e: 'toggle-skip', id: string): void
  /** 跳过/取消跳过整个城市 */
  (e: 'skip-city', city: string): void
  /** 删除整个城市的所有门店 */
  (e: 'remove-city', city: string): void
}>()

// ── 搜索 ──
const searchQuery = ref('')

// ── 城市分组折叠（默认全部折叠） ──
const expandedGroups = ref<Record<string, boolean>>({})

function toggleGroup(city: string): void {
  expandedGroups.value = {
    ...expandedGroups.value,
    [city]: !expandedGroups.value[city],
  }
}

function isExpanded(city: string): boolean {
  return !!expandedGroups.value[city]
}

/** 过滤后的门店列表 */
const filteredStores = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.stores
  return props.stores.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.address.toLowerCase().includes(q) ||
      s.city.toLowerCase().includes(q) ||
      s.contact?.toLowerCase().includes(q),
  )
})

/** 按城市分组（基于过滤后的列表） */
const grouped = computed(() => {
  const map = new Map<string, Store[]>()
  for (const s of filteredStores.value) {
    const key = s.city || t('routePlanner.ungrouped')
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
})

// ── 删除确认 ──
const confirmTarget = ref<{ id?: string; name: string; city?: string } | null>(null)
/** 确认框容器（Teleport 到 body 的 overlay 内），供焦点陷阱限定范围 */
const confirmBoxRef = ref<HTMLElement | null>(null)
// P2-5：确认框焦点陷阱 —— 打开时焦点移入按钮组，Tab 循环不逃逸，关闭恢复
useFocusTrap({
  visible: computed(() => confirmTarget.value !== null),
  getContainer: () => confirmBoxRef.value,
  autofocus: 'container',
})

function requestDelete(store: Store): void {
  confirmTarget.value = { id: store.id, name: store.name || store.address || t('routePlanner.unknownStore') }
}

function requestDeleteCity(city: string, count: number): void {
  confirmTarget.value = { city, name: t('routePlanner.cityStoresCount', { city, count }) }
}

function confirmDelete(): void {
  if (!confirmTarget.value) return
  if (confirmTarget.value.city) {
    emit('remove-city', confirmTarget.value.city)
  } else if (confirmTarget.value.id) {
    emit('remove', confirmTarget.value.id)
  }
  confirmTarget.value = null
}

function cancelDelete(): void {
  confirmTarget.value = null
}

// ── 坐标来源标签 ──
function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    original: t('routePlanner.sourceOriginal'),
    address_geocode: t('routePlanner.sourceGeocode'),
    township_geocode: t('routePlanner.sourceTownship'),
    manual: t('routePlanner.sourceManual'),
    none: t('routePlanner.sourceNone'),
  }
  return map[source] || source
}

// ── 统计 ──
const stats = computed(() => {
  const total = props.stores.length
  const withCoord = props.stores.filter((s) => s.longitude && s.latitude).length
  const skipped = props.stores.filter((s) => s.skipped).length
  return { total, withCoord, skipped }
})
</script>

<template>
  <div class="store-panel">
    <!-- 操作栏 -->
    <div class="panel-actions">
      <button class="btn-add" @click="emit('add')">{{ t('routePlanner.addStoreBtn') }}</button>
      <div class="stats">
        <span>{{ t('routePlanner.totalCount', { count: stats.total }) }}</span>
        <span>{{ t('routePlanner.withCoord', { count: stats.withCoord }) }}</span>
        <span v-if="stats.skipped" class="skip-count">{{ t('routePlanner.skipped', { count: stats.skipped }) }}</span>
      </div>
    </div>

    <!-- 搜索框 -->
    <div class="search-bar">
      <span class="search-icon">🔍</span>
      <input
        v-model="searchQuery"
        type="text"
        :placeholder="t('routePlanner.searchPlaceholder')"
        class="search-input"
      />
      <button v-if="searchQuery" class="search-clear" :title="t('routePlanner.clearSearch')" @click="searchQuery = ''">
        ✕
      </button>
    </div>

    <!-- 分组列表 -->
    <div class="group-list">
      <div v-for="[city, cityStores] in grouped" :key="city" class="group">
        <div
          class="group-header"
          role="button"
          tabindex="0"
          :aria-expanded="isExpanded(city)"
          @click="toggleGroup(city)"
          @keydown.enter.prevent="toggleGroup(city)"
          @keydown.space.prevent="toggleGroup(city)"
        >
          <span class="group-arrow">{{ isExpanded(city) ? '▼' : '▶' }}</span>
          <span class="group-name">{{ city }}</span>
          <span class="group-count">{{ t('routePlanner.storeCountUnit', { count: cityStores.length }) }}</span>
          <div class="group-batch" @click.stop>
            <button class="btn-batch" :title="t('routePlanner.skipCityTitle')" @click="emit('skip-city', city)">
              ⏭️
            </button>
            <button
              class="btn-batch btn-batch-danger"
              :title="t('routePlanner.deleteCityTitle')"
              @click="requestDeleteCity(city, cityStores.length)"
            >
              🗑️
            </button>
          </div>
        </div>
        <div v-if="isExpanded(city)" class="store-list">
          <div
            v-for="store in cityStores"
            :key="store.id"
            class="store-item"
            :class="{ skipped: store.skipped, noCoord: !store.longitude }"
          >
            <div class="store-info">
              <div class="store-name" :title="store.name || store.address">
                {{ store.name || store.address }}
              </div>
              <div class="store-meta">
                <span class="source-tag">{{ sourceLabel(store.coordSource) }}</span>
                <span v-if="store.contact" class="contact" :title="store.contact + ' ' + store.phone"
                  >{{ store.contact }} {{ store.phone }}</span
                >
              </div>
            </div>
            <div class="store-actions">
              <button class="btn-icon" :title="t('routePlanner.editTitle')" @click="emit('edit', store)">✏️</button>
              <button
                class="btn-icon"
                :title="store.skipped ? t('routePlanner.toggleSkipTitle') : t('routePlanner.toggleSkipTitleOn')"
                @click="emit('toggle-skip', store.id)"
              >
                {{ store.skipped ? '↩️' : '⏭️' }}
              </button>
              <button class="btn-icon btn-danger" :title="t('routePlanner.deleteTitle')" @click="requestDelete(store)">
                🗑️
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 搜索无结果 -->
      <div v-if="searchQuery && grouped.length === 0" class="empty-state">
        <p>{{ t('routePlanner.noMatch') }}</p>
        <p class="hint">{{ t('routePlanner.noMatchHint') }}</p>
      </div>

      <!-- 空状态 -->
      <div v-if="stores.length === 0" class="empty-state">
        <p>{{ t('routePlanner.noData') }}</p>
        <p class="hint">{{ t('routePlanner.noDataHint') }}</p>
      </div>
    </div>

    <!-- 删除确认弹窗 -->
    <Teleport to="body">
      <div v-if="confirmTarget" class="confirm-overlay" @click.self="cancelDelete">
        <div
          ref="confirmBoxRef"
          class="confirm-box"
          role="alertdialog"
          aria-modal="true"
          tabindex="-1"
          :aria-label="t('routePlanner.deleteConfirmTitle')"
        >
          <p class="confirm-text">{{ t('routePlanner.deleteConfirm', { name: confirmTarget.name }) }}</p>
          <p class="confirm-hint">
            {{ confirmTarget.city ? t('routePlanner.deleteCityHint') : t('routePlanner.deleteStoreHint') }}
          </p>
          <div class="confirm-actions">
            <button class="btn-cancel" @click="cancelDelete">{{ t('routePlanner.cancel') }}</button>
            <button class="btn-confirm-delete" @click="confirmDelete">{{ t('routePlanner.confirmDelete') }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.store-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.panel-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--vcl-space-3) var(--vcl-space-3);
  border-bottom: 1px solid var(--vcl-color-border-light);
  flex-shrink: 0;
}

.btn-add {
  padding: var(--vcl-space-1) calc(14px * var(--vcl-scale));
  background: var(--vcl-color-primary);
  color: var(--vcl-color-surface);
  border: none;
  border-radius: var(--vcl-radius-md);
  font-size: var(--vcl-ctrl-font-size);
  cursor: pointer;
}

.btn-add:hover {
  background: var(--vcl-color-primary-hover);
}

.stats {
  display: flex;
  gap: var(--vcl-space-2);
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
}

.skip-count {
  color: var(--vcl-color-warning);
}

/* 搜索框 */
.search-bar {
  display: flex;
  align-items: center;
  padding: var(--vcl-space-2) var(--vcl-space-3);
  border-bottom: 1px solid var(--vcl-color-border-light);
  gap: var(--vcl-space-1);
  flex-shrink: 0;
}

.search-icon {
  font-size: var(--vcl-ctrl-font-size);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: var(--vcl-ctrl-font-size);
  color: var(--vcl-color-text);
  background: transparent;
}

.search-input::placeholder {
  color: var(--vcl-color-text-muted);
}

.search-clear {
  background: none;
  border: none;
  font-size: var(--vcl-ctrl-font-size);
  color: var(--vcl-color-text-muted);
  cursor: pointer;
  padding: var(--vcl-space-1) var(--vcl-space-1);
  border-radius: var(--vcl-radius-sm);
}

.search-clear:hover {
  color: var(--vcl-color-text-secondary);
  background: var(--vcl-color-bg-alt);
}

.group-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--vcl-space-2);
}

.group {
  margin-bottom: var(--vcl-space-2);
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--vcl-space-1) var(--vcl-space-3);
  background: var(--vcl-color-bg-alt);
  border-radius: var(--vcl-radius-md);
  font-size: var(--vcl-ctrl-font-size);
  font-weight: 600;
  color: var(--vcl-color-text-secondary);
  cursor: pointer;
  user-select: none;
}

.group-header:hover {
  background: var(--vcl-color-border-light);
}

.group-arrow {
  font-size: calc(9px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  width: calc(14px * var(--vcl-scale));
  flex-shrink: 0;
}

.group-name {
  flex: 1;
}

.group-batch {
  display: flex;
  gap: var(--vcl-space-0);
  margin-left: var(--vcl-space-1);
}

.btn-batch {
  background: none;
  border: none;
  cursor: pointer;
  font-size: calc(15px * var(--vcl-scale));
  padding: var(--vcl-space-1) var(--vcl-space-1);
  border-radius: var(--vcl-radius-sm);
  opacity: 0.5;
  transition: opacity 0.15s;
}

.group-header:hover .btn-batch {
  opacity: 1;
}

.btn-batch:hover {
  background: var(--vcl-color-border-light);
}

.btn-batch-danger:hover {
  background: var(--vcl-color-danger-bg);
}

.group-count {
  font-weight: 400;
  color: var(--vcl-color-text-muted);
  font-size: calc(15px * var(--vcl-scale));
}

.store-list {
  padding: var(--vcl-space-1) 0;
}

.store-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--vcl-space-2) var(--vcl-space-3);
  border-radius: var(--vcl-radius-md);
  transition: background 0.15s;
}

.store-item:hover {
  background: var(--vcl-color-bg);
}

.store-item.skipped {
  opacity: 0.5;
  text-decoration: line-through;
}

.store-item.noCoord {
  border-left: 3px solid var(--vcl-color-warning);
}

.store-info {
  flex: 1;
  min-width: 0;
}

.store-name {
  font-size: var(--vcl-ctrl-font-size);
  color: var(--vcl-color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.store-meta {
  display: flex;
  gap: var(--vcl-space-2);
  margin-top: var(--vcl-space-0);
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
}

.source-tag {
  flex-shrink: 0;
}

.contact {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.store-actions {
  display: flex;
  gap: var(--vcl-space-1);
  flex-shrink: 0;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--vcl-ctrl-font-size);
  padding: var(--vcl-space-1);
  border-radius: var(--vcl-radius-sm);
  transition: background 0.15s;
}

.btn-icon:hover {
  background: var(--vcl-color-border-light);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--vcl-color-text-muted);
  font-size: var(--vcl-ctrl-font-size);
  padding: var(--vcl-space-8);
}

.empty-state .hint {
  font-size: calc(15px * var(--vcl-scale));
  margin-top: var(--vcl-space-1);
  text-align: center;
  line-height: 1.6;
}

/* 删除确认弹窗 */
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--vcl-z-modal, 1000);
}

.confirm-box {
  background: var(--vcl-color-surface);
  border-radius: var(--vcl-radius-lg);
  padding: var(--vcl-space-8) var(--vcl-space-8);
  text-align: center;
  box-shadow: var(--vcl-shadow-lg);
  max-width: calc(340px * var(--vcl-scale));
}

.confirm-text {
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-text);
  margin: 0 0 var(--vcl-space-1);
}

.confirm-hint {
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  margin: 0 0 var(--vcl-space-4);
}

.confirm-actions {
  display: flex;
  gap: var(--vcl-space-2);
  justify-content: center;
}

.btn-cancel {
  padding: var(--vcl-space-2) calc(20px * var(--vcl-scale));
  background: var(--vcl-color-surface);
  border: 1px solid var(--vcl-color-border-light);
  border-radius: var(--vcl-radius-md);
  font-size: var(--vcl-ctrl-font-size);
  color: var(--vcl-color-text-secondary);
  cursor: pointer;
}

.btn-cancel:hover {
  background: var(--vcl-color-bg);
}

.btn-confirm-delete {
  padding: var(--vcl-space-2) calc(20px * var(--vcl-scale));
  background: var(--vcl-color-danger);
  color: var(--vcl-color-surface);
  border: none;
  border-radius: var(--vcl-radius-md);
  font-size: var(--vcl-ctrl-font-size);
  cursor: pointer;
}

.btn-confirm-delete:hover {
  background: var(--vcl-color-danger-hover);
}
</style>
