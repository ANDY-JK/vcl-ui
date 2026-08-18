<script setup lang="ts">
/**
 * 门店管理面板 — 分组视图 + 搜索 + CRUD
 */
import { ref, computed } from 'vue'
import type { Store } from '@/components/route-planner/types'

const props = defineProps<{
  stores: Store[]
}>()

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'edit', store: Store): void
  (e: 'remove', id: string): void
  (e: 'toggleSkip', id: string): void
  /** 跳过/取消跳过整个城市 */
  (e: 'skipCity', city: string): void
  /** 删除整个城市的所有门店 */
  (e: 'removeCity', city: string): void
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
    const key = s.city || '未分组'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
})

// ── 删除确认 ──
const confirmTarget = ref<{ id?: string; name: string; city?: string } | null>(null)

function requestDelete(store: Store): void {
  confirmTarget.value = { id: store.id, name: store.name || store.address || '未知门店' }
}

function requestDeleteCity(city: string, count: number): void {
  confirmTarget.value = { city, name: `${city}（${count}家门店）` }
}

function confirmDelete(): void {
  if (!confirmTarget.value) return
  if (confirmTarget.value.city) {
    emit('removeCity', confirmTarget.value.city)
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
    original: '🔵 已有坐标',
    address_geocode: '🟢 地址解析',
    township_geocode: '🟡 区域定位',
    manual: '🔵 手动填写',
    none: '⚪ 无坐标',
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
      <button class="btn-add" @click="emit('add')">➕ 添加门店</button>
      <div class="stats">
        <span>共 {{ stats.total }}</span>
        <span>已定位 {{ stats.withCoord }}</span>
        <span v-if="stats.skipped" class="skip-count">跳过 {{ stats.skipped }}</span>
      </div>
    </div>

    <!-- 搜索框 -->
    <div class="search-bar">
      <span class="search-icon">🔍</span>
      <input v-model="searchQuery" type="text" placeholder="搜索门店名、城市、地址..." class="search-input" />
      <button v-if="searchQuery" class="search-clear" title="清除搜索" @click="searchQuery = ''">✕</button>
    </div>

    <!-- 分组列表 -->
    <div class="group-list">
      <div v-for="[city, cityStores] in grouped" :key="city" class="group">
        <div class="group-header" @click="toggleGroup(city)">
          <span class="group-arrow">{{ isExpanded(city) ? '▼' : '▶' }}</span>
          <span class="group-name">{{ city }}</span>
          <span class="group-count">{{ cityStores.length }}家</span>
          <div class="group-batch" @click.stop>
            <button class="btn-batch" title="跳过/取消跳过此城市所有门店" @click="emit('skipCity', city)">⏭️</button>
            <button
              class="btn-batch btn-batch-danger"
              title="删除此城市所有门店"
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
              <div class="store-name">
                {{ store.name || store.address }}
              </div>
              <div class="store-meta">
                <span class="source-tag">{{ sourceLabel(store.coordSource) }}</span>
                <span v-if="store.contact" class="contact">{{ store.contact }} {{ store.phone }}</span>
              </div>
            </div>
            <div class="store-actions">
              <button class="btn-icon" title="编辑" @click="emit('edit', store)">✏️</button>
              <button
                class="btn-icon"
                :title="store.skipped ? '取消跳过' : '跳过此门店'"
                @click="emit('toggleSkip', store.id)"
              >
                {{ store.skipped ? '↩️' : '⏭️' }}
              </button>
              <button class="btn-icon btn-danger" title="删除" @click="requestDelete(store)">🗑️</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 搜索无结果 -->
      <div v-if="searchQuery && grouped.length === 0" class="empty-state">
        <p>🔍 未找到匹配的门店</p>
        <p class="hint">试试其他关键词，或「添加门店」</p>
      </div>

      <!-- 空状态 -->
      <div v-if="stores.length === 0" class="empty-state">
        <p>📋 暂无门店数据</p>
        <p class="hint">导入 Excel 或手动添加门店开始规划路线</p>
      </div>
    </div>

    <!-- 删除确认弹窗 -->
    <Teleport to="body">
      <div v-if="confirmTarget" class="confirm-overlay" @click.self="cancelDelete">
        <div class="confirm-box">
          <p class="confirm-text">确定删除「{{ confirmTarget.name }}」？</p>
          <p class="confirm-hint">
            {{ confirmTarget.city ? '将删除该城市所有门店' : '删除后不可恢复' }}
          </p>
          <div class="confirm-actions">
            <button class="btn-cancel" @click="cancelDelete">取消</button>
            <button class="btn-confirm-delete" @click="confirmDelete">确认删除</button>
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
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border-light);
  flex-shrink: 0;
}

.btn-add {
  padding: 6px 14px;
  background: var(--color-primary);
  color: var(--color-surface);
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.btn-add:hover {
  background: var(--color-primary-hover);
}

.stats {
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.skip-count {
  color: var(--color-warning);
}

/* 搜索框 */
.search-bar {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border-light);
  gap: 6px;
  flex-shrink: 0;
}

.search-icon {
  font-size: 13px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 13px;
  color: var(--color-text);
  background: transparent;
}

.search-input::placeholder {
  color: var(--color-text-muted);
}

.search-clear {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}

.search-clear:hover {
  color: var(--color-text-secondary);
  background: var(--color-bg-alt);
}

.group-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.group {
  margin-bottom: 8px;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: var(--color-bg-alt);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
  user-select: none;
}

.group-header:hover {
  background: var(--color-border-light);
}

.group-arrow {
  font-size: 9px;
  color: var(--color-text-muted);
  width: 14px;
  flex-shrink: 0;
}

.group-name {
  flex: 1;
}

.group-batch {
  display: flex;
  gap: 2px;
  margin-left: 4px;
}

.btn-batch {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 3px;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.group-header:hover .btn-batch {
  opacity: 1;
}

.btn-batch:hover {
  background: var(--color-border-light);
}

.btn-batch-danger:hover {
  background: var(--color-danger-bg);
}

.group-count {
  font-weight: 400;
  color: var(--color-text-muted);
  font-size: 12px;
}

.store-list {
  padding: 4px 0;
}

.store-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 6px;
  transition: background 0.15s;
}

.store-item:hover {
  background: var(--color-bg);
}

.store-item.skipped {
  opacity: 0.5;
  text-decoration: line-through;
}

.store-item.noCoord {
  border-left: 3px solid var(--color-warning);
}

.store-info {
  flex: 1;
  min-width: 0;
}

.store-name {
  font-size: 13px;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.store-meta {
  display: flex;
  gap: 8px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-text-muted);
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
  gap: 4px;
  flex-shrink: 0;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.15s;
}

.btn-icon:hover {
  background: var(--color-border-light);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 14px;
  padding: 24px;
}

.empty-state .hint {
  font-size: 12px;
  margin-top: 4px;
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
  z-index: 1100;
}

.confirm-box {
  background: var(--color-surface);
  border-radius: 12px;
  padding: 24px 28px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  max-width: 340px;
}

.confirm-text {
  font-size: 15px;
  color: var(--color-text);
  margin: 0 0 4px;
}

.confirm-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0 0 16px;
}

.confirm-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.btn-cancel {
  padding: 8px 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.btn-cancel:hover {
  background: var(--color-bg);
}

.btn-confirm-delete {
  padding: 8px 20px;
  background: var(--color-danger);
  color: var(--color-surface);
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.btn-confirm-delete:hover {
  background: var(--color-danger-hover);
}
</style>
