<script setup lang="ts">
// ⛔ 保护 — 离线检测，禁止：online/offline 事件监听逻辑删除
//    需我确认：离线提示样式、重连回调
import { ref, onMounted, onUnmounted } from 'vue'
import { useT } from '@/components/_internal/i18n'
import IconSvg from '@/components/basic/IconSvg.vue'

const t = useT()
const offline = ref(false)
const dismissed = ref(false)

function onOnline() {
  offline.value = false
  dismissed.value = false
}
function onOffline() {
  offline.value = true
  dismissed.value = false
}

onMounted(() => {
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
})

onUnmounted(() => {
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
})
</script>

<template>
  <Transition name="slide-down">
    <div v-if="offline && !dismissed" class="offline-bar" role="alert" aria-live="assertive">
      <IconSvg type="wifi-off" size="sm" color="white" />
      <span>{{ t('offline.disconnected') }}</span>
      <button class="offline-dismiss" :aria-label="t('common.close')" @click="dismissed = true">
        <IconSvg type="x" size="sm" color="white" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.offline-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--z-top, 9999); /* 全局横幅：最高优先级，不被任何弹层/遮罩遮挡 */
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(var(--space-1), 1vw, 8px);
  padding: clamp(var(--space-2), 1.2vw, 10px) clamp(10px, 2vw, 16px);
  /* 实心底压白字：solid 令牌（暗色下 --color-warning 提亮后白字不可读） */
  background: var(--color-warning-solid, var(--color-warning));
  color: white;
  font-size: clamp(11px, 1.8vw, 15px);
}

.offline-dismiss {
  display: flex;
  padding: var(--space-1);
  border: none;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  cursor: pointer;
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: transform var(--transition-normal);
}
.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-100%);
}
</style>
