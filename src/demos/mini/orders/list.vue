<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'
import Tag from '@/components/basic/Tag.vue'

const router = useRouter()
const route = useRoute()

interface Order {
  id: string
  customer: string
  items: number
  amount: number
  status: 'pending' | 'shipped' | 'done' | 'cancelled'
  time: string
}

const orders = ref<Order[]>([
  { id: 'PO20240516001', customer: '深圳电子科技', items: 5, amount: 12800, status: 'pending', time: '2024-05-16 14:30' },
  { id: 'PO20240516002', customer: '北京物流中心', items: 12, amount: 34500, status: 'shipped', time: '2024-05-16 11:20' },
  { id: 'PO20240515003', customer: '上海贸易公司', items: 3, amount: 5600, status: 'done', time: '2024-05-15 16:45' },
  { id: 'PO20240515004', customer: '广州仓储基地', items: 8, amount: 22300, status: 'pending', time: '2024-05-15 09:15' },
  { id: 'PO20240514005', customer: '杭州供应链', items: 20, amount: 67000, status: 'shipped', time: '2024-05-14 13:00' },
  { id: 'PO20240514006', customer: '成都物流', items: 6, amount: 9800, status: 'cancelled', time: '2024-05-14 10:30' },
  { id: 'PO20240513007', customer: '武汉配送中心', items: 15, amount: 41200, status: 'done', time: '2024-05-13 15:20' },
])

const statusTabs = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待发货' },
  { key: 'shipped', label: '已发货' },
  { key: 'done', label: '已签收' },
  { key: 'cancelled', label: '已取消' },
]

const activeStatus = ref((route.query.status as string) || '')

const filteredOrders = computed(() => {
  if (!activeStatus.value) return orders.value
  return orders.value.filter(o => o.status === activeStatus.value)
})

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: '待发货', color: '#F59E0B' },
  shipped: { label: '已发货', color: '#4F6EF7' },
  done: { label: '已签收', color: '#22AD5F' },
  cancelled: { label: '已取消', color: '#9CA3AF' },
}

function goDetail(id: string) {
  router.push(`/mini/orders/${id}`)
}
</script>

<template>
  <div class="page">
    <!-- 状态筛选 -->
    <div class="status-tabs">
      <button
        v-for="t in statusTabs" :key="t.key"
        class="status-tab"
        :class="{ active: activeStatus === t.key }"
        @click="activeStatus = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- 订单列表 -->
    <div v-if="filteredOrders.length" class="order-list">
      <div
        v-for="o in filteredOrders" :key="o.id"
        class="order-card"
        @click="goDetail(o.id)"
      >
        <div class="order-header">
          <span class="order-id">{{ o.id }}</span>
          <Tag
            :color="statusConfig[o.status].color"
            size="sm"
            textColor="#fff"
          >
            {{ statusConfig[o.status].label }}
          </Tag>
        </div>
        <div class="order-body">
          <div class="order-customer">{{ o.customer }}</div>
          <div class="order-meta">
            <span>{{ o.items }} 件商品</span>
            <span class="meta-sep">|</span>
            <span class="order-amount">¥{{ o.amount.toLocaleString() }}</span>
          </div>
        </div>
        <div class="order-footer">
          <span class="order-time">{{ o.time }}</span>
          <IconSvg type="chevron-right" size="sm" color="var(--color-text-muted)" />
        </div>
      </div>
    </div>

    <div v-else class="empty">
      <IconSvg type="box" size="lg" color="var(--color-text-muted)" />
      <p>暂无相关订单</p>
    </div>

    <!-- 新建按钮 -->
    <button class="fab" @click="router.push('/mini/orders/detail/new')">
      <IconSvg type="plus" size="lg" color="white" />
    </button>
  </div>
</template>

<style scoped>
.page { padding: 12px; padding-bottom: 60px; }

.status-tabs {
  display: flex; gap: 6px; margin-bottom: 12px;
  overflow-x: auto; -webkit-overflow-scrolling: touch;
}
.status-tabs::-webkit-scrollbar { display: none; }
.status-tab {
  flex-shrink: 0; padding: 6px 14px;
  border: 1px solid var(--color-border); border-radius: 20px;
  background: var(--color-surface); font-size: 12px; color: var(--color-text-secondary);
  cursor: pointer; transition: all 150ms; font-family: inherit;
}
.status-tab.active { border-color: var(--color-primary); background: var(--color-primary); color: #fff; }

.order-list { display: flex; flex-direction: column; gap: 8px; }
.order-card {
  padding: 14px; background: var(--color-surface);
  border: 1px solid var(--color-border-light); border-radius: var(--radius-md);
  cursor: pointer; transition: border-color 120ms;
}
.order-card:hover { border-color: var(--color-primary); }
.order-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.order-id { font-size: 13px; font-weight: 600; color: var(--color-text); }
.order-body { margin-bottom: 8px; }
.order-customer { font-size: 14px; color: var(--color-text); margin-bottom: 4px; }
.order-meta { font-size: 12px; color: var(--color-text-muted); display: flex; gap: 6px; align-items: center; }
.meta-sep { color: var(--color-border); }
.order-amount { font-weight: 600; color: var(--color-danger); }
.order-footer { display: flex; justify-content: space-between; align-items: center; }
.order-time { font-size: 11px; color: var(--color-text-muted); }

.empty { text-align: center; padding: 60px 20px; color: var(--color-text-muted); font-size: 13px; }

.fab {
  position: fixed; bottom: 24px; right: 24px;
  width: 48px; height: 48px; border-radius: 50%; border: none;
  background: var(--color-primary); box-shadow: 0 4px 16px rgba(79,110,247,0.4);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: transform 150ms; z-index: 100;
}
.fab:hover { transform: scale(1.08); }
</style>
