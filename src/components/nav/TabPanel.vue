<script setup lang="ts">
// 标签页内容面板 — Tabs 的配套组件
// 用法：
//   <Tabs v-model="active" :items="items" />
//   <TabPanel value="a">内容 A</TabPanel>
//   <TabPanel value="b" lazy>内容 B（首次激活才渲染，切走后保留状态）</TabPanel>
// 关联机制：TabPanel 与 Tabs 是兄弟节点，provide/inject 不可达 —
// context 由 Tabs 登记到共同父组件 uid，本组件沿 parent 链向上查找（见 tabs-context.ts）。
// aria：id/aria-labelledby 与 Tabs 同一 id 前缀派生；注册后 tab 才挂 aria-controls —
// lazy 面板首次激活才注册，保证 controls 指向的 id 不会悬空。
import { computed, ref, watch, onMounted, onBeforeUnmount, getCurrentInstance } from 'vue'
import { findTabsContext, panelIdOf, tabIdOf } from './tabs-context'

interface Props {
  /** 对应 Tabs items 里的 value（item 未设 value 时与 label 一致） */
  value: string | number
  /** 懒渲染：首次激活前不渲染内容（重内容/异步内容推荐）；默认 false 全量渲染 */
  lazy?: boolean
  /** 切走后是否保留 DOM（true = 仅隐藏，表单输入等状态不丢）；默认 true。false = 切走即卸载 */
  keepAlive?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  lazy: false,
  keepAlive: true,
})

const ctx = findTabsContext(getCurrentInstance())

/** 当前是否激活；未配对 Tabs（ctx 为空）时视为激活（单独使用不隐藏内容） */
const active = computed(() => (ctx ? ctx.activeValue.value === props.value : true))

/** lazy：首次激活前不渲染；激活过一次后置 true 不再回退 */
const everActivated = ref(!props.lazy)

function register(): void {
  if (!ctx || ctx.registered.value.has(props.value)) return
  ctx.registered.value = new Set(ctx.registered.value).add(props.value)
}
function unregister(): void {
  if (!ctx || !ctx.registered.value.has(props.value)) return
  const next = new Set(ctx.registered.value)
  next.delete(props.value)
  ctx.registered.value = next
}

// 非 lazy：挂载即注册；lazy：首次激活才注册（此前 onMounted 无条件注册，
// 会让 aria-controls 指向 v-if 尚未渲染的面板 id，悬空）
onMounted(() => {
  if (everActivated.value) register()
})
watch(active, (v) => {
  if (!v) return
  if (!everActivated.value) {
    everActivated.value = true
    register()
  }
})
onBeforeUnmount(unregister)

const id = computed(() => panelIdOf(ctx?.idPrefix ?? 'standalone', props.value))
const labelledBy = computed(() => (ctx ? tabIdOf(ctx.idPrefix, props.value) : undefined))
</script>

<template>
  <div
    v-if="everActivated || active"
    v-show="active || keepAlive"
    :id="id"
    role="tabpanel"
    :aria-labelledby="labelledBy"
    :hidden="!active || undefined"
    :tabindex="active ? 0 : undefined"
    class="vcl-tabpanel"
  >
    <slot />
  </div>
</template>

<style scoped>
/* 面板可聚焦（tabindex=0 供读屏滚动定位），不画焦点环避免与内容焦点混淆 */
.vcl-tabpanel:focus {
  outline: none;
}
</style>
