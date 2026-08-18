<script setup lang="ts">
import { useRouter } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'
import Card from '@/components/data/Card.vue'

const router = useRouter()

const stats = [
  { label: '今日订单', value: 128, icon: 'chart-bar', color: 'var(--color-primary)', route: '/mini/orders' },
  { label: '待发货', value: 23, icon: 'package', color: 'var(--color-warning)', route: '/mini/orders?status=pending' },
  {
    label: '已签收',
    value: 1056,
    icon: 'circle-check',
    color: 'var(--color-success)',
    route: '/mini/orders?status=done',
  },
]

const notices = [
  { title: '系统升级通知', desc: '今晚 02:00-04:00 维护', time: '10分钟前', unread: true },
  { title: '新功能上线', desc: '批量导入功能已开放使用', time: '1小时前', unread: true },
  { title: '库存预警', desc: '商品 "SKU-8823" 库存不足', time: '3小时前', unread: false },
]
</script>

<template>
  <div class="page">
    <!-- 统计卡片 -->
    <div class="stat-grid">
      <div v-for="s in stats" :key="s.label" class="stat-card" @click="router.push(s.route)">
        <IconSvg :type="s.icon" size="md" :color="s.color" />
        <span class="stat-value">{{ s.value.toLocaleString() }}</span>
        <span class="stat-label">{{ s.label }}</span>
      </div>
    </div>

    <!-- 快捷入口 -->
    <Card title="快捷操作" style="margin-bottom: 12px">
      <div class="quick-row">
        <button class="quick-btn" @click="router.push('/mini/orders?action=new')">
          <IconSvg type="plus" size="sm" /> 新建订单
        </button>
        <button class="quick-btn" @click="router.push('/mini/products')">
          <IconSvg type="search" size="sm" /> 库存查询
        </button>
        <button class="quick-btn" @click="router.push('/mini/scan')">
          <IconSvg type="upload" size="sm" /> 扫码出入库
        </button>
        <button class="quick-btn" @click="router.push('/mini/settings')">
          <IconSvg type="refresh-cw" size="sm" /> 数据同步
        </button>
      </div>
    </Card>

    <!-- 消息 -->
    <Card title="最近消息">
      <div
        v-for="n in notices"
        :key="n.title"
        class="notice-item"
        :class="{ unread: n.unread }"
        @click="router.push('/mini/notifications')"
      >
        <div>
          <div class="notice-title">
            <span v-if="n.unread" class="dot" />
            {{ n.title }}
          </div>
          <div class="notice-desc">
            {{ n.desc }}
          </div>
        </div>
        <span class="notice-time">{{ n.time }}</span>
      </div>
      <button class="view-all" @click="router.push('/mini/notifications')">查看全部 →</button>
    </Card>
  </div>
</template>

<style scoped>
.page {
  padding: 12px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}
.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 8px;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-light);
  cursor: pointer;
  transition: all 150ms ease;
}
.stat-card:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}
.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
}
.stat-label {
  font-size: 11px;
  color: var(--color-text-muted);
}

.quick-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.quick-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 150ms ease;
  font-family: inherit;
}
.quick-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-light);
}

.notice-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  cursor: pointer;
  transition: background 120ms;
}
.notice-item + .notice-item {
  border-top: 1px solid var(--color-border-light);
}
.notice-item.unread {
  font-weight: 500;
}
.notice-title {
  font-size: 13px;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 6px;
}
.notice-desc {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 2px;
}
.notice-time {
  font-size: 10px;
  color: var(--color-text-muted);
  white-space: nowrap;
  margin-left: 12px;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-danger);
  flex-shrink: 0;
}
.view-all {
  display: block;
  width: 100%;
  padding: 8px;
  margin-top: 4px;
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--color-primary);
  cursor: pointer;
  font-family: inherit;
}
</style>
