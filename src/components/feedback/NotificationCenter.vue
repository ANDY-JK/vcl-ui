<script setup lang="ts">
/**
 * NotificationCenter — 通知中心（铃铛 + 历史面板）
 *
 * 与 Toast 的分工：Toast 是**瞬时**反馈（3 秒后消失，错过就没了）；
 * 本组件是**可回溯**的收件箱（未读数、已读回执、清空）。两者不互相顶替。
 *
 * 密排取向：
 *   - 行高低（不铺卡片、不放大图标），一屏能扫十几条；
 *   - 副文案单行截断 + title 出全值，不为长文案把面板撑高；
 *   - 列表区挂滚动边缘软化，「还有更多」靠 24px 渐隐提示，不占布局。
 *
 * 受控契约：`items[].read` 是唯一真源。组件只 emit，不自己改数 ——
 * 宿主不更新 items 时 UI 不会「假装已读」，避免两份状态打架。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useFloating } from '@/components/_internal/useFloating'
import { useClickOutside } from '@/components/_internal/useClickOutside'
import { useEscClose } from '@/components/_internal/useEscClose'
import { useRovingTabindex } from '@/components/_internal/useRovingTabindex'
import { useIdSafe } from '@/components/_internal/useIdCompat'
import { useScrollEdge } from '@/components/_internal/scroll-edge'
import { formatRelativeTime } from '@/components/_internal/utils'
import { useT } from '@/components/_internal/i18n'
import { feedbackIconMap } from '@/components/shared/types'
import type { NotificationItem } from './notification-types'

const t = useT()

interface Props {
  /** 通知列表（受控；`read` 由宿主维护） */
  items: NotificationItem[]
  /** 面板标题 */
  title?: string
  /** 列表最大高度（含滚动） */
  maxHeight?: string
  /** 显示「只看未读」开关 */
  unreadFilter?: boolean
  /** 显示底部操作条（全部已读 / 清空） */
  showFooter?: boolean
  /** 无障碍触发器名 */
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  unreadFilter: true,
  showFooter: true,
})

const emit = defineEmits<{
  /** 某条被点击（同时会 emit read，如果它未读） */
  'item-click': [item: NotificationItem]
  /** 某条被读 */
  read: [item: NotificationItem]
  /** 全部已读 */
  'read-all': []
  /** 清空 */
  clear: []
}>()

const open = ref(false)
const onlyUnread = ref(false)
const panelId = useIdSafe('nc-panel')

const unreadCount = computed(() => props.items.filter((i) => !i.read).length)
const visibleItems = computed(() => (onlyUnread.value ? props.items.filter((i) => !i.read) : props.items))

/** 铃铛角标：超过 99 收敛成 99+，避免角标把按钮撑变形 */
const badgeText = computed(() => (unreadCount.value > 99 ? '99+' : String(unreadCount.value)))

const { triggerRef, floatingRef, direction, floatingStyle, updatePosition, prepareOpen } = useFloating({
  get offset() {
    return 6
  },
  defaultDirection: 'down',
  // 面板宽度由 CSS 决定（`min-width/width` 走等比），这里不设 minSize ——
  // 它是**测量下界**而非 CSS 值，写 320 会让 255px 的面板被当成 320 参与钳制，位置偏左。
  matchWidth: false,
  get zIndex() {
    return 'var(--vcl-z-dropdown, 2000)'
  },
})

/** 列表滚动体：晚于挂载才出现（面板 v-if），useScrollEdge 已覆盖晚绑定路径 */
const listScrollEl = ref<HTMLElement | null>(null)
const { atTop: listAtTop, atBottom: listAtBottom } = useScrollEdge(listScrollEl)

const listId = useIdSafe('nc-list')
const roving = useRovingTabindex({
  keys: () => visibleItems.value.map((i) => i.id),
  activeKey: () => visibleItems.value[0]?.id ?? null,
  orientation: 'vertical',
  // 通知列表不循环：到底就是到底，绕回去会让人以为还有新内容
  wrap: false,
})

function toggle(): void {
  open.value = !open.value
}

function close(): void {
  open.value = false
}

function onRowClick(item: NotificationItem): void {
  emit('item-click', item)
  if (!item.read) emit('read', item)
}

function onReadAll(): void {
  if (unreadCount.value === 0) return
  emit('read-all')
}

function onClear(): void {
  if (!props.items.length) return
  emit('clear')
}

function onListKeydown(e: KeyboardEvent): void {
  roving.onKeydown(e)
}

// 打开时：预定位 → 量真尺寸 → 校正（与 Popover 同一套次序，避免首帧闪一下）
watch(open, async (v) => {
  if (!v) return
  prepareOpen()
  await nextTick()
  updatePosition()
})

useClickOutside([triggerRef, floatingRef], () => {
  if (open.value) close()
})
// useEscClose 返回的是 { onKeydown, mount, unmount }，**调用方必须自己挂生命周期** ——
// 直接调用而不 mount 等于没绑键盘（初版就漏了这一步，Esc 关不掉面板）。
const esc = useEscClose(
  () => open.value,
  () => true,
  () => close(),
)
onMounted(esc.mount)
onBeforeUnmount(esc.unmount)

/** 时间列：字符串原样透出（宿主可能已经格式化好），其余走统一相对时间 */
function timeText(item: NotificationItem): string {
  if (item.time == null || item.time === '') return ''
  if (typeof item.time === 'string') return item.time
  return formatRelativeTime(item.time)
}

function iconOf(item: NotificationItem): string {
  if (item.icon) return item.icon
  return feedbackIconMap[item.type ?? 'info'] ?? 'circle-alert'
}
</script>

<template>
  <div class="nc-root">
    <button
      ref="triggerRef"
      type="button"
      class="nc-trigger"
      :class="{ 'is-open': open, 'has-unread': unreadCount > 0 }"
      :aria-label="ariaLabel || t('notification.open')"
      :aria-expanded="open"
      :aria-controls="open ? panelId : undefined"
      @click="toggle"
    >
      <IconSvg type="bell" size="md" />
      <span v-if="unreadCount > 0" class="nc-badge" aria-hidden="true">{{ badgeText }}</span>
      <span v-if="unreadCount > 0" class="nc-sr">{{ t('notification.unreadCount', { n: unreadCount }) }}</span>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        :id="panelId"
        ref="floatingRef"
        class="nc-panel"
        :class="`nc-${direction}`"
        :style="[floatingStyle, { maxWidth: 'calc(360px * var(--vcl-scale))' }]"
        role="dialog"
        :aria-label="title || t('notification.title')"
      >
        <div class="nc-header">
          <span class="nc-title">{{ title || t('notification.title') }}</span>
          <span v-if="unreadCount > 0" class="nc-count">{{ t('notification.unreadCount', { n: unreadCount }) }}</span>
          <span class="nc-spacer" />
          <button
            v-if="unreadFilter"
            type="button"
            class="nc-text-btn"
            :aria-pressed="onlyUnread"
            @click="onlyUnread = !onlyUnread"
          >
            {{ t('notification.unreadOnly') }}
          </button>
          <button type="button" class="nc-icon-btn" :aria-label="t('notification.close')" @click="close">
            <IconSvg type="x" size="sm" />
          </button>
        </div>

        <!-- 列表：滚动体 + 顶/底渐隐（不占布局高度）。
             滚动容器就是 ul 本身，外壳只做定位容器 —— 外壳若不裁高度，就不会出现
             「外壳 max-height × 列表 max-height:inherit」的循环尺寸（ResizeObserver 会自激）。 -->
        <div class="vcl-scroll-edge nc-list-wrap">
          <ul
            :id="listId"
            ref="listScrollEl"
            class="nc-list"
            :style="{ maxHeight: maxHeight ?? 'calc(320px * var(--vcl-scale))' }"
            role="list"
            @keydown="onListKeydown"
          >
            <li v-for="item in visibleItems" :key="String(item.id)" role="listitem">
              <button
                type="button"
                class="nc-item"
                :class="{ 'is-unread': !item.read }"
                :data-roving-key="String(item.id)"
                :tabindex="roving.tabindexFor(item.id)"
                @click="onRowClick(item)"
                @focus="roving.focusKey(item.id)"
              >
                <span class="nc-item-icon" :class="`is-${item.type ?? 'info'}`">
                  <IconSvg :type="iconOf(item)" size="sm" />
                </span>
                <span class="nc-item-main">
                  <span class="nc-item-title" :title="item.title">{{ item.title }}</span>
                  <span v-if="item.desc" class="nc-item-desc" :title="item.desc">{{ item.desc }}</span>
                </span>
                <span v-if="item.time != null && item.time !== ''" class="nc-item-time">
                  {{ timeText(item) }}
                </span>
                <span v-if="!item.read" class="nc-dot" aria-hidden="true" />
              </button>
            </li>
            <li v-if="!visibleItems.length" class="nc-empty">
              {{ onlyUnread ? t('notification.emptyUnread') : t('notification.empty') }}
            </li>
          </ul>
          <div
            class="vcl-scroll-edge__veil vcl-scroll-edge__veil--top"
            :style="{ opacity: listAtTop ? 0 : 1 }"
            aria-hidden="true"
          />
          <div
            class="vcl-scroll-edge__veil vcl-scroll-edge__veil--bottom"
            :style="{ opacity: listAtBottom ? 0 : 1 }"
            aria-hidden="true"
          />
        </div>

        <div v-if="showFooter" class="nc-footer">
          <button type="button" class="nc-text-btn" :disabled="unreadCount === 0" @click="onReadAll">
            {{ t('notification.markAllRead') }}
          </button>
          <button type="button" class="nc-text-btn" :disabled="!items.length" @click="onClear">
            {{ t('notification.clear') }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style src="./notification-center-scoped.css" scoped></style>
<style src="../_internal/scroll-edge.css"></style>
