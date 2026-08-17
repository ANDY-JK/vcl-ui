<script setup lang="ts">
import { ref, computed } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'

interface Notification {
  id: number
  type: 'system' | 'order' | 'stock' | 'notice'
  title: string
  desc: string
  time: string
  read: boolean
}

const notifications = ref<Notification[]>([
  { id: 1, type: 'system', title: '系统升级通知', desc: '系统将于今晚 02:00-04:00 进行维护升级，届时服务将暂停。请提前做好数据备份。', time: '2024-05-16 10:30', read: false },
  { id: 2, type: 'order', title: '新订单通知', desc: '您有一笔新订单 PO20240516001 待处理，客户：深圳电子科技，金额：¥12,800。', time: '2024-05-16 09:15', read: false },
  { id: 3, type: 'stock', title: '库存预警', desc: '商品 "USB-C 数据线 1m" (SKU-3056) 库存仅剩 12 件，已低于安全库存阈值，请及时补货。', time: '2024-05-16 08:00', read: false },
  { id: 4, type: 'order', title: '订单已签收', desc: '订单 PO20240515003 已被客户 "上海贸易公司" 签收。', time: '2024-05-15 17:20', read: true },
  { id: 5, type: 'notice', title: '新功能上线', desc: '批量导入功能已开放使用，支持 Excel 导入商品和订单数据，请在设置页查看详情。', time: '2024-05-15 14:00', read: true },
  { id: 6, type: 'system', title: '安全提醒', desc: '检测到异地登录，如非本人操作请及时修改密码。登录 IP：192.168.1.100。', time: '2024-05-14 11:30', read: true },
  { id: 7, type: 'stock', title: '盘点完成通知', desc: '月度盘点已完成。盘点结果：账实相符率 99.8%，差异商品 3 件，已生成盘点报告。', time: '2024-05-13 16:45', read: true },
  { id: 8, type: 'order', title: '订单已取消', desc: '订单 PO20240514006 (成都物流) 已被取消，已退回库存。', time: '2024-05-13 10:00', read: true },
])

const unreadCount = computed(() => notifications.value.filter(n => !n.read).length)

function markAllRead() {
  notifications.value.forEach(n => { n.read = true })
}

function markRead(n: Notification) {
  n.read = true
  // TODO: 跳转详情
}

const typeConfig: Record<string, { icon: string; color: string }> = {
  system: { icon: 'settings', color: '#8B5CF6' },
  order:  { icon: 'file-text', color: '#4F6EF7' },
  stock:  { icon: 'package', color: '#F59E0B' },
  notice: { icon: 'bell', color: '#22AD5F' },
}
</script>

<template>
  <div class="page">
    <div class="list-header">
      <span class="header-count">{{ unreadCount }} 条未读</span>
      <button v-if="unreadCount" class="mark-btn" @click="markAllRead">全部已读</button>
    </div>

    <div class="notif-list">
      <div
        v-for="n in notifications" :key="n.id"
        class="notif-item"
        :class="{ unread: !n.read }"
        @click="markRead(n)"
      >
        <div class="notif-icon" :style="{ background: typeConfig[n.type].color + '18', color: typeConfig[n.type].color }">
          <IconSvg :type="typeConfig[n.type].icon" size="md" />
        </div>
        <div class="notif-content">
          <div class="notif-title">
            <span v-if="!n.read" class="dot" />
            {{ n.title }}
          </div>
          <div class="notif-desc">{{ n.desc }}</div>
          <div class="notif-time">{{ n.time }}</div>
        </div>
      </div>
    </div>

    <div v-if="!notifications.length" class="empty">
      <IconSvg type="bell" size="lg" color="var(--color-text-muted)" />
      <p>暂无消息</p>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 12px; }

.list-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 8px;
}
.header-count { font-size: 12px; color: var(--color-text-muted); }
.mark-btn {
  border: none; background: transparent; font-size: 12px;
  color: var(--color-primary); cursor: pointer; font-family: inherit;
}

.notif-list { display: flex; flex-direction: column; gap: 6px; }
.notif-item {
  display: flex; gap: 10px; padding: 12px;
  background: var(--color-surface); border-radius: var(--radius-md);
  border: 1px solid var(--color-border-light); cursor: pointer;
  transition: background 120ms;
}
.notif-item:hover { background: var(--color-bg); }
.notif-item.unread { border-left: 3px solid var(--color-primary); }
.notif-icon {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
}
.notif-content { flex: 1; min-width: 0; }
.notif-title { font-size: 14px; font-weight: 500; color: var(--color-text); display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--color-danger); flex-shrink: 0;
}
.notif-desc { font-size: 12px; color: var(--color-text-secondary); line-height: 1.5; margin-bottom: 4px; }
.notif-time { font-size: 10px; color: var(--color-text-muted); }

.empty { text-align: center; padding: 60px 20px; color: var(--color-text-muted); font-size: 13px; }
</style>
