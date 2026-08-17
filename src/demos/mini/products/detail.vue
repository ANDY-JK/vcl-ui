<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'
import Tag from '@/components/basic/Tag.vue'
import Card from '@/components/data/Card.vue'

const route = useRoute()
const pid = route.params.id as string

const product = ref({
  id: Number(pid) || 1,
  name: '无线鼠标 Pro',
  sku: 'SKU-1001',
  category: '电子产品',
  price: 89,
  stock: 342,
  unit: '个',
  spec: '黑色 / USB-C 充电 / 1600DPI',
  supplier: '深圳电子科技有限公司',
  location: 'A区-3排-12号',
  desc: '人体工学设计，静音按键，持久续航，支持蓝牙和 USB 双模连接，兼容 Windows/Mac/Linux。',
})

const qty = ref(1)
const favorited = ref(false)
</script>

<template>
  <div class="page">
    <!-- 商品图占位 -->
    <div class="image-placeholder">
      <IconSvg type="box" size="lg" color="white" />
      <span>{{ product.sku }}</span>
    </div>

    <!-- 基本信息 -->
    <div class="info-section">
      <div class="info-head">
        <div class="info-name">{{ product.name }}</div>
        <button class="fav-btn" :class="{ on: favorited }" @click="favorited = !favorited">
          <IconSvg
            type="star"
            size="md"
            :color="favorited ? 'var(--color-warning)' : 'var(--color-text-muted)'"
          />
        </button>
      </div>
      <div class="info-meta">
        <Tag size="sm">{{ product.category }}</Tag>
        <span class="info-sku">{{ product.sku }}</span>
      </div>
      <div class="info-price">¥{{ product.price }} <span class="info-unit">/ {{ product.unit }}</span></div>
    </div>

    <!-- 详细信息 -->
    <Card title="库存信息" style="margin-bottom: 10px">
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">当前库存</span>
          <span class="detail-value stock">{{ product.stock.toLocaleString() }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">规格型号</span>
          <span class="detail-value">{{ product.spec }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">供应商</span>
          <span class="detail-value">{{ product.supplier }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">库位</span>
          <span class="detail-value">{{ product.location }}</span>
        </div>
      </div>
    </Card>

    <Card title="商品描述">
      <p class="product-desc">{{ product.desc }}</p>
    </Card>

    <!-- 库存记录 -->
    <Card title="最近出入库记录" style="margin-top: 10px">
      <div class="log-mini">
        <div class="log-mini-item">
          <span class="log-type in">入库</span>
          <span class="log-desc">采购入库</span>
          <span class="log-qty">+200</span>
          <span class="log-time">05-16 10:30</span>
        </div>
        <div class="log-mini-item">
          <span class="log-type out">出库</span>
          <span class="log-desc">订单 PO20240516001</span>
          <span class="log-qty">-50</span>
          <span class="log-time">05-15 14:20</span>
        </div>
        <div class="log-mini-item">
          <span class="log-type in">入库</span>
          <span class="log-desc">退货入库</span>
          <span class="log-qty">+10</span>
          <span class="log-time">05-14 09:15</span>
        </div>
      </div>
    </Card>

    <!-- 底部操作 -->
    <div class="bottom-bar">
      <div class="qty-control">
        <button class="qty-btn" @click="qty = Math.max(1, qty - 1)" :disabled="qty <= 1">
          <IconSvg type="minus" size="sm" />
        </button>
        <span class="qty-value">{{ qty }}</span>
        <button class="qty-btn" @click="qty = Math.min(product.stock, qty + 1)" :disabled="qty >= product.stock">
          <IconSvg type="plus" size="sm" />
        </button>
      </div>
      <button class="action-btn outline">
        <IconSvg type="download" size="sm" /> 入库
      </button>
      <button class="action-btn primary">
        <IconSvg type="upload" size="sm" /> 出库
      </button>
    </div>
  </div>
</template>

<style scoped>
.page { padding-bottom: 60px; }

.image-placeholder {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  height: 180px; margin: -12px -12px 12px;
  background: linear-gradient(135deg, var(--color-primary), #6366f1);
  color: rgba(255,255,255,0.7); font-size: 12px;
}

.info-section { padding: 0 0 12px; }
.info-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
.info-name { font-size: 18px; font-weight: 600; color: var(--color-text); }
.fav-btn {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border: none; border-radius: 50%;
  background: var(--color-bg); cursor: pointer; transition: background 120ms;
}
.fav-btn:hover { background: var(--color-bg-alt); }
.info-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.info-sku { font-size: 12px; color: var(--color-text-muted); }
.info-price { font-size: 24px; font-weight: 700; color: var(--color-danger); }
.info-unit { font-size: 13px; font-weight: 400; color: var(--color-text-muted); }

.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.detail-item { display: flex; flex-direction: column; gap: 2px; }
.detail-label { font-size: 11px; color: var(--color-text-muted); }
.detail-value { font-size: 13px; color: var(--color-text); }
.detail-value.stock { font-weight: 600; color: var(--color-primary); }

.product-desc { font-size: 13px; color: var(--color-text-secondary); line-height: 1.6; }

.log-mini { display: flex; flex-direction: column; gap: 6px; }
.log-mini-item { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.log-type { padding: 1px 6px; border-radius: 10px; font-size: 10px; font-weight: 500; }
.log-type.in { background: rgba(34,173,95,0.12); color: var(--color-success); }
.log-type.out { background: rgba(239,68,68,0.12); color: var(--color-danger); }
.log-desc { flex: 1; color: var(--color-text); }
.log-qty { font-weight: 600; color: var(--color-text); }
.log-time { color: var(--color-text-muted); font-size: 11px; }

.bottom-bar {
  position: sticky; bottom: 0;
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; margin: 12px -12px -12px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border-light);
}
.qty-control { display: flex; align-items: center; gap: 4px; }
.qty-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: 1px solid var(--color-border);
  border-radius: 50%; background: var(--color-surface);
  color: var(--color-text); cursor: pointer;
}
.qty-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.qty-value { width: 32px; text-align: center; font-size: 15px; font-weight: 600; }
.action-btn {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;
  padding: 10px; border-radius: var(--radius-md);
  font-size: 14px; font-weight: 500; cursor: pointer; font-family: inherit;
}
.action-btn.outline { border: 1px solid var(--color-primary); background: var(--color-surface); color: var(--color-primary); }
.action-btn.primary { border: none; background: var(--color-primary); color: #fff; }
</style>
