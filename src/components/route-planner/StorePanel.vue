<script setup lang="ts">
/**
 * 门店管理面板 — 分组视图 + 搜索 + CRUD
 */
import { ref, computed } from 'vue'
import type { Store } from '@/components/route-planner/types'
import { useT } from '@/components/_internal/i18n'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'
import IconSvg from '@/components/basic/IconSvg.vue'

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

/**
 * 该门店是否需要人工处理（坐标缺失或来源为 none）。
 *
 * 判据取"没有可用坐标"而不是"来源是 manual"：manual 是已经填好的，
 * none / 坐标缺失才是要人补的。放在行内显示（行尾），列表里一眼可见。
 */
function needsManual(store: Store): boolean {
  return !store.longitude || !store.latitude || store.coordSource === 'none'
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
      <button type="button" class="btn-add" @click="emit('add')">{{ t('routePlanner.addStoreBtn') }}</button>
      <div class="stats">
        <span>{{ t('routePlanner.totalCount', { count: stats.total }) }}</span>
        <span>{{ t('routePlanner.withCoord', { count: stats.withCoord }) }}</span>
        <span v-if="stats.skipped" class="skip-count">{{ t('routePlanner.skipped', { count: stats.skipped }) }}</span>
      </div>
    </div>

    <!-- 搜索框 -->
    <div class="search-bar">
      <span class="search-icon"><IconSvg type="search" size="sm" /></span>
      <input
        v-model="searchQuery"
        type="text"
        :placeholder="t('routePlanner.searchPlaceholder')"
        class="search-input"
      />
      <button
        v-if="searchQuery"
        type="button"
        class="search-clear"
        :title="t('routePlanner.clearSearch')"
        @click="searchQuery = ''"
      >
        <IconSvg type="x" size="xs" />
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
          <span class="group-arrow"
            ><IconSvg :type="isExpanded(city) ? 'chevron-down' : 'chevron-right'" size="sm"
          /></span>
          <span class="group-name">{{ city }}</span>
          <span class="group-count">{{ t('routePlanner.storeCountUnit', { count: cityStores.length }) }}</span>
          <div class="group-batch" @click.stop>
            <button
              type="button"
              class="btn-batch"
              :title="t('routePlanner.skipCityTitle')"
              :aria-label="t('routePlanner.skipCityTitle')"
              @click="emit('skip-city', city)"
            >
              <IconSvg type="chevron-right" size="sm" />
            </button>
            <button
              type="button"
              class="btn-batch btn-batch-danger"
              :title="t('routePlanner.deleteCityTitle')"
              :aria-label="t('routePlanner.deleteCityTitle')"
              @click="requestDeleteCity(city, cityStores.length)"
            >
              <IconSvg type="trash-2" size="sm" />
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
                <!-- 「需要人工处理」放在该门店行内部（行尾），不再集中到别处：
                     坐标缺失 / 来源为 none 的门店，在它自己那一行就能看见 -->
                <span v-if="needsManual(store)" class="needs-manual">{{ t('routePlanner.needsManual') }}</span>
              </div>
            </div>
            <div class="store-actions">
              <!-- 跳过态改用无头复选框（浏览器原生外观，不再用 chevron/rotate-ccw 箭头）：
                   勾选 = 跳过该门店，语义直白；标题仍随状态切换 -->
              <input
                type="checkbox"
                class="skip-box"
                :checked="store.skipped"
                :title="store.skipped ? t('routePlanner.toggleSkipTitle') : t('routePlanner.toggleSkipTitleOn')"
                :aria-label="store.skipped ? t('routePlanner.toggleSkipTitle') : t('routePlanner.toggleSkipTitleOn')"
                @change="emit('toggle-skip', store.id)"
              />
              <button
                type="button"
                class="btn-icon"
                :title="t('routePlanner.editTitle')"
                :aria-label="t('routePlanner.editTitle')"
                @click="emit('edit', store)"
              >
                <IconSvg type="pencil" size="sm" />
              </button>
              <button
                type="button"
                class="btn-icon btn-danger"
                :title="t('routePlanner.deleteTitle')"
                :aria-label="t('routePlanner.deleteTitle')"
                @click="requestDelete(store)"
              >
                <IconSvg type="trash-2" size="sm" />
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
            <button type="button" class="btn-cancel" @click="cancelDelete">{{ t('routePlanner.cancel') }}</button>
            <button type="button" class="btn-confirm-delete" @click="confirmDelete">
              {{ t('routePlanner.confirmDelete') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style src="./store-panel-scoped.css" scoped></style>
