<script setup lang="ts">
// ⛔ 保护 — 头像，禁止：clamp() 尺寸 → px，fallback 文字逻辑
//    需我确认：shape 形状、size 尺寸挡位
import { computed, ref, watch } from 'vue'

interface Props {
  src?: string
  name?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  shape?: 'circle' | 'rounded'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  shape: 'circle',
})

const initials = computed(() => {
  const trimmed = (props.name || '').trim()
  if (!trimmed) return '?'
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase()
})

const sizeMap: Record<string, number> = { sm: 32, md: 40, lg: 56, xl: 72 }
const fontSizeMap: Record<string, string> = { sm: '12px', md: '14px', lg: '18px', xl: '24px' }

// 图片加载失败时回退到 initials 文字头像
const imgError = ref(false)
const showImg = computed(() => !!props.src && !imgError.value)
function onImgError() {
  imgError.value = true
}
// src 变更时重置失败态（避免换图后永远显示首字母）
watch(
  () => props.src,
  () => {
    imgError.value = false
  },
)
</script>

<template>
  <div
    class="avatar"
    :class="[`size-${size}`, `shape-${shape}`]"
    :style="{ width: sizeMap[size] + 'px', height: sizeMap[size] + 'px' }"
  >
    <img v-if="showImg" :src="src" :alt="name || 'avatar'" class="avatar-img" @error="onImgError" />
    <span v-else class="avatar-text" :style="{ fontSize: fontSizeMap[size] }">
      {{ initials }}
    </span>
  </div>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--color-primary);
  color: white;
  font-weight: 600;
  user-select: none;
}

.shape-circle {
  border-radius: 50%;
}
.shape-rounded {
  border-radius: var(--radius-md);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-text {
  line-height: 1;
}
</style>
