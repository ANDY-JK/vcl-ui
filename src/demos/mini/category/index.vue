<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'

const router = useRouter()

const categories = [
  { name: '电子产品', icon: 'package', count: 342, color: '#4F6EF7' },
  { name: '办公用品', icon: 'file-text', count: 156, color: '#F59E0B' },
  { name: '日用百货', icon: 'grid3x3', count: 523, color: '#22AD5F' },
  { name: '服装鞋帽', icon: 'tag', count: 289, color: '#8B5CF6' },
  { name: '食品饮料', icon: 'star', count: 178, color: '#EC4899' },
  { name: '医疗器械', icon: 'heart', count: 64, color: '#EF4444' },
]

const selected = ref('')
function selectCat(name: string) {
  selected.value = name
  router.push(`/mini/products?category=${encodeURIComponent(name)}`)
}
</script>

<template>
  <div class="page">
    <div class="search-bar" @click="router.push('/mini/products')">
      <IconSvg type="search" size="sm" />
      <span class="search-placeholder">搜索商品...</span>
    </div>

    <div class="cat-grid">
      <button v-for="c in categories" :key="c.name" class="cat-card" @click="selectCat(c.name)">
        <div class="cat-icon" :style="{ background: c.color + '18', color: c.color }">
          <IconSvg :type="c.icon" size="lg" />
        </div>
        <div class="cat-name">
          {{ c.name }}
        </div>
        <div class="cat-count">{{ c.count }} 件商品</div>
      </button>
    </div>

    <!-- 最近浏览 -->
    <div class="section-title">最近浏览</div>
    <div class="recent-row">
      <div v-for="i in 4" :key="i" class="recent-item" @click="router.push('/mini/products/detail/' + i)">
        <div class="recent-thumb">
          <IconSvg type="box" size="md" />
        </div>
        <div class="recent-name">SKU-{{ 1000 + i }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: 12px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  cursor: pointer;
}
.search-placeholder {
  font-size: 13px;
}

.cat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}
.cat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 8px;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-light);
  cursor: pointer;
  transition: all 150ms ease;
  font-family: inherit;
}
.cat-card:hover {
  border-color: var(--color-primary);
  transform: translateY(-1px);
}
.cat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
}
.cat-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
}
.cat-count {
  font-size: 10px;
  color: var(--color-text-muted);
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 8px;
}
.recent-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.recent-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.recent-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border-light);
}
.recent-name {
  font-size: 10px;
  color: var(--color-text-secondary);
}
</style>
