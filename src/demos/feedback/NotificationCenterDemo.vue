<script setup lang="ts">
// NotificationCenterDemo — 通知中心演示（可回溯收件箱，与瞬时 Toast 分工不同）
import { computed, ref } from 'vue'
import NotificationCenter from '@/components/feedback/NotificationCenter.vue'
import Toast from '@/components/feedback/Toast.vue'
import type { NotificationItem, NotificationType } from '@/components/feedback/notification-types'
import { useToastNotify } from '@/components/_internal/useToastNotify'

// 只取 toastRef 挂载 Toast（演示页不需要主动弹提示）
const { toastRef } = useToastNotify()

const now = Date.now()
const items = ref<NotificationItem[]>([
  { id: 1, title: '新订单已支付', desc: '订单 #1024 · ¥1,280.00', time: now - 60_000, type: 'success' },
  { id: 2, title: '库存低于阈值', desc: 'SKU-88 当前 6 件，阈值 10 件', time: now - 900_000, type: 'warning' },
  { id: 3, title: '导出完成', desc: '2026-10 对账单.xlsx · 2.4 MB', time: now - 3 * 3600_000, type: 'info' },
  { id: 4, title: '同步失败', desc: '第三分店网络中断，已重试 3 次', time: now - 26 * 3600_000, type: 'error' },
  {
    id: 5,
    title: '系统公告',
    desc: '周日 02:00-04:00 停机维护',
    time: now - 3 * 24 * 3600_000,
    type: 'info',
    read: true,
  },
  {
    id: 6,
    title: '新成员加入',
    desc: '李雷 加入「华东区」协作组',
    time: now - 5 * 24 * 3600_000,
    type: 'info',
    read: true,
  },
])

const unread = computed(() => items.value.filter((i) => !i.read).length)
const lastAction = ref('—')

function onRead(item: NotificationItem) {
  items.value = items.value.map((i) => (i.id === item.id ? { ...i, read: true } : i))
  lastAction.value = `已读：${item.title}`
}

function onItemClick(item: NotificationItem) {
  lastAction.value = `点开：${item.title}`
}

function onReadAll() {
  items.value = items.value.map((i) => ({ ...i, read: true }))
  lastAction.value = '全部已读'
}

function onClear() {
  items.value = []
  lastAction.value = '已清空'
}

/** 造一条随机通知，验证「未读数实时涨」与滚动软化 */
let seq = 100
const types: NotificationType[] = ['info', 'success', 'warning', 'error']
function pushOne() {
  seq += 1
  items.value = [
    { id: seq, title: `实时通知 #${seq}`, desc: '由「推一条」按钮生成的示例', time: Date.now(), type: types[seq % 4] },
    ...items.value,
  ]
}
</script>

<template>
  <div class="demo-container">
    <h1>NotificationCenter 通知中心</h1>
    <p class="desc">可回溯的收件箱：未读角标、只看未读、全部已读、清空。与 Toast 的分工是「瞬时 vs 可回溯」。</p>

    <section class="demo-section">
      <h2>基础用法（受控：read 由宿主维护）</h2>
      <div class="nc-demo-bar">
        <NotificationCenter
          :items="items"
          title="通知中心"
          @read="onRead"
          @item-click="onItemClick"
          @read-all="onReadAll"
          @clear="onClear"
        />
        <span class="nc-demo-hint">点铃铛打开；未读 {{ unread }} 条</span>
        <button type="button" class="nc-demo-btn" @click="pushOne">推一条</button>
      </div>
      <p class="result">最近操作：{{ lastAction }}</p>
    </section>

    <section class="demo-section">
      <h2>无底部操作条 + 自定义最大高度</h2>
      <NotificationCenter :items="items" :show-footer="false" max-height="calc(180px * var(--vcl-scale))" />
    </section>

    <section class="demo-section">
      <h2>空态</h2>
      <NotificationCenter :items="[]" />
    </section>

    <Toast ref="toastRef" />
  </div>
</template>

<style scoped>
.nc-demo-bar {
  display: flex;
  align-items: center;
  gap: var(--vcl-space-3);
}
.nc-demo-hint {
  font-size: var(--vcl-text-label-size);
  line-height: var(--vcl-text-label-line);
  color: var(--vcl-color-text-muted);
}
.nc-demo-btn {
  padding: 0 var(--vcl-space-3);
  height: calc(28px * var(--vcl-scale));
  border: 1px solid var(--vcl-color-border);
  border-radius: var(--vcl-radius-md);
  background: var(--vcl-color-surface);
  color: var(--vcl-color-text);
  font-family: inherit;
  font-size: var(--vcl-text-label-size);
  line-height: var(--vcl-text-label-line);
  cursor: pointer;
}
@media (hover: hover) {
  .nc-demo-btn:hover {
    background: var(--vcl-color-bg-alt);
  }
}
</style>
