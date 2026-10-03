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

<style src="./steps-scoped.css" scoped></style>
