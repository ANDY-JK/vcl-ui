<script lang="ts">
import { useT } from '@/components/_internal/i18n'

/** 模块级 t（本文件 script setup 内有 type 导出，value 声明须置于普通 script 块） */
const t = useT()

/** Step 类型由此块导出（双 script 块共享作用域；script setup 内不再重复导出） */
export type { Step } from './types'
</script>

<script setup lang="ts">
// ⛔ 保护 — 步骤条，禁止：clamp() → px，Step 接口，连线样式
//    需我确认：direction 方向、current 状态管理
import IconSvg from '@/components/basic/IconSvg.vue'
import type { Step } from './types'

/** 导出以供声明文件引用：不导出会触发 TS4082，本组件的 .d.ts 将无法生成 */
export interface Props {
  /** 步骤列表（Step：title/description/content） */
  steps: Step[]
  /** 当前步（0 起，小于 0 全部待办、超尾全部完成） */
  current: number
  /** 排列方向（默认水平） */
  direction?: 'horizontal' | 'vertical'
  /** 是否允许点击步骤跳转 */
  clickable?: boolean
}

const emit = defineEmits<{
  /** 点击步骤项时触发（clickable=true 时生效）；kebab-case 与全库事件命名一致 */
  'step-click': [index: number, step: Step]
}>()

withDefaults(defineProps<Props>(), {
  direction: 'horizontal',
  clickable: false,
})

function onStepClick(idx: number, step: Step) {
  emit('step-click', idx, step)
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
      :aria-current="idx === current ? 'step' : undefined"
      :aria-label="t('steps.stepLabel', { n: idx + 1, label: step.label })"
      @click="clickable && onStepClick(idx, step)"
      @keydown.enter.prevent="clickable && onStepClick(idx, step)"
      @keydown.space.prevent="clickable && onStepClick(idx, step)"
    >
      <div class="step-indicator">
        <span v-if="idx < current" class="step-check">
          <IconSvg type="circle-check" size="md" color="var(--vcl-color-primary)" />
        </span>
        <span v-else class="step-num">{{ idx + 1 }}</span>
      </div>
      <div class="step-text">
        <div class="step-label">
          {{ step.label }}
        </div>
        <div v-if="step.desc" class="step-desc">
          {{ step.desc }}
        </div>
      </div>
      <div v-if="idx < steps.length - 1" class="step-line" :class="{ filled: idx < current }" />
    </div>
  </div>
</template>

<style scoped>
.steps {
  display: flex;
}
.steps-horizontal {
  flex-direction: row;
}
.steps-vertical {
  flex-direction: column;
}

.step {
  display: flex;
  align-items: flex-start;
  gap: calc(10px * var(--vcl-scale));
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
  width: calc(28px * var(--vcl-scale));
  height: calc(28px * var(--vcl-scale));
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: calc(15px * var(--vcl-scale));
  font-weight: 600;
  background: var(--vcl-color-bg-alt);
  color: var(--vcl-color-text-muted);
  border: 2px solid var(--vcl-color-border);
  transition: all var(--vcl-transition-fast);
}
.step.active .step-num {
  background: var(--vcl-color-primary);
  color: white;
  border-color: var(--vcl-color-primary);
}
.step.done .step-num {
  background: var(--vcl-color-primary-light);
  color: var(--vcl-color-primary);
  border-color: var(--vcl-color-primary);
}

.step-text {
  padding-top: var(--vcl-space-1);
}
.step-label {
  font-size: calc(15px * var(--vcl-scale));
  font-weight: 500;
  color: var(--vcl-color-text-muted);
}
.step.active .step-label {
  color: var(--vcl-color-text);
}
.step.done .step-label {
  color: var(--vcl-color-text-secondary);
}

.step-desc {
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  margin-top: var(--vcl-space-1);
}

.step-line {
  flex: 1;
  min-width: calc(24px * var(--vcl-scale));
  min-height: 2px;
  background: var(--vcl-color-border);
  margin-top: calc(13px * var(--vcl-scale));
  transition: background var(--vcl-transition-fast);
}
.step-line.filled {
  background: var(--vcl-color-primary);
}

.step.clickable {
  cursor: pointer;
}
.step.clickable:hover .step-num {
  border-color: var(--vcl-color-primary);
  color: var(--vcl-color-primary);
}
.step.clickable:focus-visible {
  outline: 2px solid var(--vcl-color-primary);
  outline-offset: 2px;
  border-radius: var(--vcl-radius-sm);
}

.steps-vertical .step {
  flex-direction: row;
}
.steps-vertical .step-line {
  position: absolute;
  left: calc(13px * var(--vcl-scale));
  top: calc(32px * var(--vcl-scale));
  bottom: 0;
  width: 2px;
  min-width: 2px;
  height: calc(100% - calc(32px * var(--vcl-scale)));
}
</style>
