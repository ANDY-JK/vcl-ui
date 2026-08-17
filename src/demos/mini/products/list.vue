<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'
import Tag from '@/components/basic/Tag.vue'

const router = useRouter()
const route = useRoute()
const categoryFilter = ref((route.query.category as string) || '')

interface Product {
  id: number
  name: string
  sku: string
  category: string
  price: number
  stock: number
  status: 'normal' | 'low' | 'out'
}

const products = ref<Product[]>([
  { id: 1, name: '无线鼠标 Pro', sku: 'SKU-1001', category: '电子产品', price: 89, stock: 342, status: 'normal' },
  { id: 2, name: '机械键盘 K8', sku: 'SKU-2003', category: '电子产品', price: 459, stock: 128, status: 'normal' },
  { id: 3, name: 'USB-C 数据线 1m', sku: 'SKU-3056', category: '电子产品', price: 29, stock: 12, status: 'low' },
  { id: 4, name: '显示器支架 双屏', sku: 'SKU-3028', category: '办公用品', price: 199, stock: 0, status: 'out' },
  { id: 5, name: 'A4 打印纸 500张', sku: 'SKU-4102', category: '办公用品', price: 25, stock: 890, status: 'normal' },
  { id: 6, name: '办公椅 人体工学', sku: 'SKU-5001', category: '办公用品', price: 1299, stock: 34, status: 'normal' },
  { id: 7, name: '医用口罩 50只装', sku: 'SKU-5056', category: '医疗器械', price: 35, stock: 2340, status: 'normal' },
  { id: 8, name: '电子体温计', sku: 'SKU-5099', category: '医疗器械', price: 128, stock: 8, status: 'low' },
  { id: 9, name: '运动鞋 跑步款', sku: 'SKU-6012', category: '服装鞋帽', price: 359, stock: 245, status: 'normal' },
  { id: 10, name: '矿泉水 24瓶装', sku: 'SKU-7003', category: '食品饮料', price: 48, stock: 1200, status: 'normal' },
  { id: 11, name: '坚果礼盒', sku: 'SKU-7018', category: '食品饮料', price: 168, stock: 320, status: 'normal' },
  { id: 12, name: '洗衣液 3kg', sku: 'SKU-8005', category: '日用百货', price: 59, stock: 567, status: 'normal' },
])

const searchKey = ref('')

const filteredProducts = computed(() => {
  let list = products.value
  if (categoryFilter.value) {
    list = list.filter(p => p.category === categoryFilter.value)
  }
  if (searchKey.value) {
    const kw = searchKey.value.toLowerCase()
    list = list.filter(p => p.name.toLowerCase().includes(kw) || p.sku.toLowerCase().includes(kw))
  }
  return list
})

function goDetail(id: number) {
  router.push(`/mini/products/detail/${id}`)
}

const statusColor: Record<string, string> = { normal: 'var(--color-success)', low: 'var(--color-warning)', out: 'var(--color-danger)' }
</script>

<template>
  <div class="page">
    <!-- 搜索 -->
    <div class="search-bar">
      <IconSvg type="search" size="sm" color="var(--color-text-muted)" />
      <input v-model="searchKey" type="text" class="search-input" placeholder="搜索商品名称/SKU..." />
      <button v-if="searchKey" class="clear-btn" @click="searchKey = ''">
        <IconSvg type="x" size="sm" />
      </button>
    </div>

    <!-- 分类提示 -->
    <div v-if="categoryFilter" class="filter-tip">
      分类：{{ categoryFilter }}
      <button class="clear-filter" @click="categoryFilter = ''">清除</button>
    </div>

    <!-- 列表 -->
    <div v-if="filteredProducts.length" class="product-list">
      <div
        v-for="p in filteredProducts" :key="p.id"
        class="product-item"
        @click="goDetail(p.id)"
      >
        <div class="product-thumb">
          <IconSvg type="box" size="md" />
        </div>
        <div class="product-info">
          <div class="product-name">{{ p.name }}</div>
          <div class="product-meta">
            <span class="product-sku">{{ p.sku }}</span>
            <Tag size="sm">{{ p.category }}</Tag>
          </div>
        </div>
        <div class="product-right">
          <div class="product-price">¥{{ p.price }}</div>
          <div class="product-stock" :style="{ color: statusColor[p.status] }">
            库存 {{ p.stock }}
          </div>
        </div>
        <IconSvg type="chevron-right" size="sm" color="var(--color-text-muted)" />
      </div>
    </div>

    <div v-else class="empty">
      <IconSvg type="search" size="lg" color="var(--color-text-muted)" />
      <p>未找到匹配商品</p>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 12px; }

.search-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; margin-bottom: 10px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 20px;
}
.search-input { flex: 1; border: none; background: transparent; font-size: 13px; outline: none; color: var(--color-text); }
.clear-btn { display: flex; align-items: center; padding: 2px; border: none; background: transparent; color: var(--color-text-muted); cursor: pointer; }

.filter-tip {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 0; margin-bottom: 10px; font-size: 12px; color: var(--color-primary);
}
.clear-filter {
  border: none; background: transparent; font-size: 11px;
  color: var(--color-text-muted); cursor: pointer;
}

.product-list { display: flex; flex-direction: column; gap: 6px; }
.product-item {
  display: flex; align-items: center; gap: 10px;
  padding: 12px; background: var(--color-surface);
  border: 1px solid var(--color-border-light); border-radius: var(--radius-md);
  cursor: pointer; transition: border-color 120ms;
}
.product-item:hover { border-color: var(--color-primary); }
.product-thumb {
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; border-radius: var(--radius-sm);
  background: var(--color-bg); color: var(--color-text-muted); flex-shrink: 0;
}
.product-info { flex: 1; min-width: 0; }
.product-name { font-size: 14px; font-weight: 500; color: var(--color-text); margin-bottom: 4px; }
.product-meta { display: flex; align-items: center; gap: 6px; }
.product-sku { font-size: 11px; color: var(--color-text-muted); }
.product-right { text-align: right; flex-shrink: 0; }
.product-price { font-size: 15px; font-weight: 600; color: var(--color-danger); }
.product-stock { font-size: 10px; margin-top: 2px; }

.empty { text-align: center; padding: 60px 20px; color: var(--color-text-muted); font-size: 13px; }
</style>
