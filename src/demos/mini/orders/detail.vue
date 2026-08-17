<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'
import Divider from '@/components/data/Divider.vue'

const route = useRoute()
const router = useRouter()
const orderId = computed(() => route.params.id as string)

interface OrderItem {
  name: string
  sku: string
  qty: number
  price: number
}

const order = ref({
  id: orderId.value || 'PO20240516001',
  status: 'shipped' as string,
  customer: '深圳电子科技有限公司',
  contact: '张经理',
  phone: '138****8888',
  address: '广东省深圳市南山区科技园南路 88 号',
  items: [
    { name: '无线鼠标 Pro', sku: 'SKU-1001', qty: 200, price: 89 },
    { name: '机械键盘 K8', sku: 'SKU-2003', qty: 100, price: 459 },
    { name: 'USB-C 数据线', sku: 'SKU-3056', qty: 500, price: 29 },
  ] as OrderItem[],
  totalAmount: 0,
  createdAt: '2024-05-16 14:30:00',
  shippedAt: '2024-05-17 09:00:00',
  log: [
    { time: '2024-05-17 09:00', desc: '快件已发出，物流单号：SF1234567890' },
    { time: '2024-05-16 16:30', desc: '订单已审核通过，等待发货' },
    { time: '2024-05-16 14:30', desc: '订单已创建' },
  ],
})

order.value.totalAmount = order.value.items.reduce((sum, i) => sum + i.qty * i.price, 0)

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: '待发货', color: '#F59E0B' },
  shipped: { label: '已发货', color: '#4F6EF7' },
  done: { label: '已签收', color: '#22AD5F' },
  cancelled: { label: '已取消', color: '#9CA3AF' },
}
</script>

<template>
  <div class="page">
    <!-- 状态头 -->
    <div class="status-bar" :style="{ background: statusConfig[order.status].color }">
      <IconSvg type="box" size="lg" color="white" />
      <div>
        <div class="status-text">{{ statusConfig[order.status].label }}</div>
        <div class="status-id">{{ order.id }}</div>
      </div>
    </div>

    <!-- 收货信息 -->
    <div class="section">
      <div class="section-title">收货信息</div>
      <div class="info-card">
        <div class="info-row"><span class="info-label">客户</span><span>{{ order.customer }}</span></div>
        <div class="info-row"><span class="info-label">联系人</span><span>{{ order.contact }}</span></div>
        <div class="info-row"><span class="info-label">电话</span><span>{{ order.phone }}</span></div>
        <div class="info-row"><span class="info-label">地址</span><span>{{ order.address }}</span></div>
      </div>
    </div>

    <!-- 商品明细 -->
    <div class="section">
      <div class="section-title">商品明细</div>
      <div class="items-card">
        <div v-for="it in order.items" :key="it.sku" class="item-row">
          <div class="item-name">
            <span>{{ it.name }}</span>
            <span class="item-sku">{{ it.sku }}</span>
          </div>
          <div class="item-price">¥{{ it.price }}</div>
          <div class="item-qty">x{{ it.qty }}</div>
          <div class="item-total">¥{{ (it.qty * it.price).toLocaleString() }}</div>
        </div>
        <Divider />
        <div class="amount-summary">
          <span>合计</span>
          <span class="total-amount">¥{{ order.totalAmount.toLocaleString() }}</span>
        </div>
      </div>
    </div>

    <!-- 物流追踪 -->
    <div class="section">
      <div class="section-title">物流追踪</div>
      <div class="log-card">
        <div v-for="(l, idx) in order.log" :key="idx" class="log-item" :class="{ latest: idx === 0 }">
          <div class="log-dot" :class="{ active: idx === 0 }" />
          <div class="log-content">
            <div class="log-desc">{{ l.desc }}</div>
            <div class="log-time">{{ l.time }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部操作 -->
    <div class="action-bar">
      <button class="action-btn outline" @click="router.back()">返回</button>
      <button v-if="order.status === 'shipped'" class="action-btn primary">确认签收</button>
      <button v-if="order.status === 'pending'" class="action-btn primary">立即发货</button>
    </div>
  </div>
</template>

<style scoped>
.page { padding-bottom: 60px; }

.status-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 20px 16px; margin: -12px -12px 12px;
  color: #fff;
}
.status-text { font-size: 18px; font-weight: 700; }
.status-id { font-size: 12px; opacity: 0.85; margin-top: 2px; }

.section { margin-bottom: 12px; }
.section-title { font-size: 13px; font-weight: 600; color: var(--color-text); margin-bottom: 6px; padding: 0 4px; }

.info-card, .items-card, .log-card {
  background: var(--color-surface); border-radius: var(--radius-md);
  border: 1px solid var(--color-border-light); padding: 12px;
}
.info-row {
  display: flex; gap: 10px; padding: 6px 0;
  font-size: 13px; color: var(--color-text);
}
.info-row + .info-row { border-top: 1px solid var(--color-border-light); }
.info-label { width: 56px; flex-shrink: 0; color: var(--color-text-muted); }

.item-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; font-size: 13px; }
.item-row + .item-row { border-top: 1px dashed var(--color-border-light); }
.item-name { flex: 1; }
.item-sku { display: block; font-size: 10px; color: var(--color-text-muted); }
.item-price { width: 50px; text-align: right; color: var(--color-text-secondary); }
.item-qty { width: 40px; text-align: center; color: var(--color-text-muted); }
.item-total { width: 70px; text-align: right; font-weight: 600; color: var(--color-text); }
.amount-summary { display: flex; justify-content: space-between; padding-top: 8px; font-size: 15px; font-weight: 600; }
.total-amount { color: var(--color-danger); }

.log-item { display: flex; gap: 10px; padding: 8px 0; }
.log-item + .log-item { border-top: 1px solid var(--color-border-light); }
.log-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--color-border); margin-top: 4px; flex-shrink: 0;
}
.log-dot.active { background: var(--color-primary); box-shadow: 0 0 0 4px rgba(79,110,247,0.2); }
.log-content { flex: 1; }
.log-desc { font-size: 13px; color: var(--color-text); }
.log-time { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }

.action-bar {
  position: sticky; bottom: 0;
  display: flex; gap: 10px; padding: 12px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border-light);
  margin: 0 -12px;
}
.action-btn {
  flex: 1; padding: 12px; border-radius: var(--radius-md);
  font-size: 14px; font-weight: 500; cursor: pointer; font-family: inherit;
}
.action-btn.outline { border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); }
.action-btn.primary { border: none; background: var(--color-primary); color: #fff; }
</style>
