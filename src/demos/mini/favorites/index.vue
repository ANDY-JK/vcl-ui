<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'
import Tag from '@/components/basic/Tag.vue'

const router = useRouter()

interface FavItem {
  id: number
  name: string
  sku: string
  category: string
  stock: number
  starred: boolean
}

const items = ref<FavItem[]>([
  { id: 1, name: '无线鼠标 Pro', sku: 'SKU-1001', category: '电子产品', stock: 342, starred: true },
  { id: 2, name: '机械键盘 K8', sku: 'SKU-2003', category: '电子产品', stock: 128, starred: true },
  { id: 3, name: '显示器支架', sku: 'SKU-3028', category: '办公用品', stock: 56, starred: true },
  { id: 4, name: 'A4 打印纸', sku: 'SKU-4102', category: '办公用品', stock: 890, starred: true },
  { id: 5, name: '医用口罩', sku: 'SKU-5056', category: '医疗器械', stock: 2340, starred: true },
])

const starredItems = computed(() => items.value.filter((i) => i.starred))

function toggleStar(item: FavItem) {
  item.starred = !item.starred
}

function goDetail(id: number) {
  router.push(`/mini/products/detail/${id}`)
}
</script>

<template>
  <div class="page">
    <div class="list-header">
      <span class="header-count">共 {{ starredItems.length }} 个收藏</span>
      <button v-if="starredItems.length" class="edit-btn"><IconSvg type="pen" size="sm" /> 管理</button>
    </div>

    <div v-if="starredItems.length" class="fav-list">
      <div v-for="item in starredItems" :key="item.id" class="fav-item" @click="goDetail(item.id)">
        <div class="fav-thumb">
          <IconSvg type="box" size="md" />
        </div>
        <div class="fav-info">
          <div class="fav-name">
            {{ item.name }}
          </div>
          <div class="fav-meta">
            <span class="fav-sku">{{ item.sku }}</span>
            <Tag size="sm">
              {{ item.category }}
            </Tag>
          </div>
          <div class="fav-stock">库存: {{ item.stock.toLocaleString() }}</div>
        </div>
        <button class="fav-star" @click.stop="toggleStar(item)">
          <IconSvg type="star" size="sm" :color="item.starred ? 'var(--color-warning)' : 'var(--color-text-muted)'" />
        </button>
      </div>
    </div>

    <div v-else class="empty">
      <IconSvg type="star" size="lg" color="var(--color-text-muted)" />
      <p>暂无收藏</p>
      <button class="go-btn" @click="router.push('/mini/products')">去逛逛</button>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: 12px;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.header-count {
  font-size: 12px;
  color: var(--color-text-muted);
}
.edit-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  font-size: 12px;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-family: inherit;
}

.fav-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-light);
  cursor: pointer;
  transition: border-color 120ms;
}
.fav-item:hover {
  border-color: var(--color-primary);
}
.fav-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-primary);
  flex-shrink: 0;
}
.fav-info {
  flex: 1;
  min-width: 0;
}
.fav-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 4px;
}
.fav-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}
.fav-sku {
  font-size: 11px;
  color: var(--color-text-muted);
}
.fav-stock {
  font-size: 11px;
  color: var(--color-text-muted);
}
.fav-star {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transition: background 150ms ease;
}
.fav-star:hover {
  background: var(--color-bg-alt);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 60px 20px;
  color: var(--color-text-muted);
  font-size: 13px;
}
.go-btn {
  padding: 8px 24px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-primary);
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}
</style>
