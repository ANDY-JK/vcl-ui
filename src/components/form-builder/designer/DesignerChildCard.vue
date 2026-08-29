<script setup lang="ts">
/**
 * 设计器画布内「容器子字段」卡片 — 复用片段
 * 用于 tabs/collapse/steps 容器按槽位分组后，渲染每个槽位里的子字段卡片。
 */
import IconSvg from '@/components/basic/IconSvg.vue'
import FormRenderer from '../FormRenderer.vue'
import { getTypeLabel } from './types'
import type { DesignerNode } from './types'

defineProps<{
  child: DesignerNode
  previewData: Record<string, unknown>
  findField: (key: string) => import('../types').FormField | undefined
}>()

const emit = defineEmits<{
  select: [id: string]
}>()
</script>

<template>
  <div class="ldc-card" @click.stop="emit('select', child.id)">
    <div class="ldc-card-head">
      <span class="ldc-drag-handle"><IconSvg type="grip-vertical" size="sm" /></span>
      <span class="ldc-card-label">{{ child.label }}</span>
      <span v-if="child.required" class="ldc-required-mark">*</span>
      <span class="ldc-card-type-badge">{{ getTypeLabel(child.type) }}</span>
      <span class="ldc-card-key">{{ child.key }}</span>
    </div>
    <div class="ldc-card-body">
      <FormRenderer
        v-if="findField(child.key ?? child.id)"
        :field="findField(child.key ?? child.id)!"
        :model-value="previewData[child.key ?? child.id]"
        disabled
      />
    </div>
  </div>
</template>
