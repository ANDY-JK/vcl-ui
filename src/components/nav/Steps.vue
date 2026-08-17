<script setup lang="ts">
// ⛔ 保护 — 步骤条，禁止：clamp() → px，Step 接口，连线样式
//    需我确认：direction 方向、current 状态管理
import IconSvg from '@/components/basic/IconSvg.vue'

interface Step { label: string; desc?: string }

interface Props {
  steps: Step[]
  current: number
  direction?: 'horizontal' | 'vertical'
  /** 是否允许点击步骤跳转 */
  clickable?: boolean
}

const emit = defineEmits<{
  /** 点击步骤项时触发（clickable=true 时生效） */
  stepClick: [index: number, step: Step]
}>()

withDefaults(defineProps<Props>(), {
  direction: 'horizontal',
  clickable: false,
})

function onStepClick(idx: number, step: Step) {
  emit('stepClick', idx, step)
}
</script>

<template>
  <div class="steps" :class="[`steps-${direction}`]">
    <div
      v-for="(step, idx) in steps"
      :key="idx"
      class="step"
      :class="{
        done: idx < current,
        active: idx === current,
        pending: idx > current,
        clickable: clickable,
      }"
      :role="clickable ? 'button' : undefined"
      :tabindex="clickable ? 0 : undefined"
      :aria-label="`步骤 ${idx + 1}: ${step.label}`"
      @click="clickable && onStepClick(idx, step)"
      @keydown.enter.prevent="clickable && onStepClick(idx, step)"
      @keydown.space.prevent="clickable && onStepClick(idx, step)"
    >
      <div class="step-indicator">
        <span v-if="idx < current" class="step-check">
          <IconSvg type="circle-check" size="md" color="var(--color-primary)" />
        </span>
        <span v-else class="step-num">{{ idx + 1 }}</span>
      </div>
      <div class="step-text">
        <div class="step-label">{{ step.label }}</div>
        <div v-if="step.desc" class="step-desc">{{ step.desc }}</div>
      </div>
      <div v-if="idx < steps.length - 1" class="step-line" :class="{ filled: idx < current }" />
    </div>
  </div>
</template>

<style scoped>
.steps { display: flex; }
.steps-horizontal { flex-direction: row; }
.steps-vertical { flex-direction: column; }

.step {
  display: flex;
  align-items: flex-start;
  gap: clamp(6px, 1.2vw, 10px);
  position: relative;
  flex: 1;
}

.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.step-num {
  width: clamp(24px, 3.5vw, 28px);
  height: clamp(24px, 3.5vw, 28px);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: clamp(11px, 1.8vw, 13px);
  font-weight: 600;
  background: var(--color-bg-alt);
  color: var(--color-text-muted);
  border: 2px solid var(--color-border);
  transition: all var(--transition-fast);
}
.step.active .step-num {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}
.step.done .step-num {
  background: var(--color-primary-light);
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.step-text {
  padding-top: var(--space-1);
}
.step-label {
  font-size: clamp(12px, 1.8vw, 14px);
  font-weight: 500;
  color: var(--color-text-muted);
}
.step.active .step-label { color: var(--color-text); }
.step.done .step-label { color: var(--color-text-secondary); }

.step-desc {
  font-size: clamp(10px, 1.5vw, 12px);
  color: var(--color-text-muted);
  margin-top: var(--space-1);
}

.step-line {
  flex: 1;
  min-width: clamp(16px, 3vw, 24px);
  min-height: 2px;
  background: var(--color-border);
  margin-top: clamp(10px, 1.6vw, 13px);
  transition: background var(--transition-fast);
}
.step-line.filled { background: var(--color-primary); }

.step.clickable { cursor: pointer; }
.step.clickable:hover .step-num {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.step.clickable:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; border-radius: var(--radius-sm); }

.steps-vertical .step {
  flex-direction: row;
}
.steps-vertical .step-line {
  position: absolute;
  left: clamp(10px, 1.6vw, 13px);
  top: clamp(24px, 4vw, 32px);
  bottom: 0;
  width: 2px;
  min-width: 2px;
  height: calc(100% - clamp(24px, 4vw, 32px));
}
</style>
