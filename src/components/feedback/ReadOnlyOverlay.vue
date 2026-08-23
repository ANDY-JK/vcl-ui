<script setup lang="ts">
// ⛔ 保护 — 只读遮罩，禁止：遮罩透明度；z-index 层级 = var(--z-readonly, 2500)（压 modal/overlay/dropdown）
//    需我确认：visible 触发逻辑、slot 内容区
import IconSvg from '@/components/basic/IconSvg.vue'

interface Props {
  visible: boolean
  reason?: string
}

withDefaults(defineProps<Props>(), {
  reason: '系统维护中，当前为只读模式',
})
</script>

<template>
  <Transition name="fade">
    <div v-if="visible" class="readonly-overlay">
      <div class="readonly-content">
        <IconSvg type="lock" size="lg" color="white" />
        <p>{{ reason }}</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.readonly-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-readonly, 2500);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
}

.readonly-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(var(--space-2), 1.5vw, 12px);
  color: white;
  font-size: clamp(14px, 2.2vw, 36px);
  text-align: center;
  padding: clamp(var(--space-3), 2.5vw, 20px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-slow);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
