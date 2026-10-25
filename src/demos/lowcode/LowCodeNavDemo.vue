<template>
  <section class="lcn-demo">
    <header class="lcn-demo-head">
      <!-- h1 而非 h2：demo 页的语义主标题；全站 a11y 扫描也以可见 h1 作为"页面已挂载"信号 -->
      <h1 class="lcn-demo-title">低代码导航外壳（宿主接入示例）</h1>
      <p class="lcn-demo-desc">
        宿主只挂一个 <code>&lt;LowCodeNav&gt;</code> + 一个低代码入口，<strong>其余导航项由用户自建</strong>。 下面的
        store 是一份<strong>内存实现</strong>（不碰 localStorage）——「对接自己数据库」要做的只有一件事： 实现
        <code>FormStore</code> 接口后注入 <code>form-store</code>。
      </p>
    </header>

    <div class="lcn-demo-bar">
      <div class="lcn-demo-group" role="group" aria-label="导航定义来源">
        <span class="lcn-demo-label">导航来源</span>
        <button
          v-for="s in sources"
          :key="s.kind"
          type="button"
          class="lcn-demo-btn"
          :class="{ on: sourceKind === s.kind }"
          :aria-pressed="sourceKind === s.kind"
          @click="sourceKind = s.kind"
        >
          {{ s.label }}
        </button>
      </div>

      <label class="lcn-demo-check">
        <input v-model="customPage" type="checkbox" />
        用 <code>#page</code> 插槽自己渲染整块页面区（最高优先级；会跳过表单页解析）
      </label>
      <label class="lcn-demo-check">
        <input v-model="showIssues" type="checkbox" />
        显示配置问题清单
      </label>
      <label class="lcn-demo-check">
        <input v-model="customItem" type="checkbox" />
        自定义导航项样式（<code>#nav-item</code> 已接管；不传该插槽则用内建导航项）
      </label>
    </div>

    <div class="lcn-demo-body">
      <LowCodeNav
        class="lcn-demo-nav"
        :source="source"
        :form-store="demoStore"
        :show-issues="showIssues"
        title="我搭的框架"
        @select="onSelect"
        @page-change="log('page-change', $event)"
        @page-submit="log('page-submit', $event)"
      >
        <template #nav-item="{ node, active, select }">
          <!-- 接管后外壳不再渲染内置按钮：这里保持"可点 + aria-current + data-key"，
               只用样式差异演示"接管渲染"（示例要能抄，所以保留无障碍语义） -->
          <button
            type="button"
            class="lcn-demo-item"
            :class="{ on: active, custom: customItem }"
            :data-key="node.key"
            :aria-current="active ? 'page' : undefined"
            @click="select(node)"
          >
            <span v-if="customItem" aria-hidden="true">★</span>
            {{ node.label }}
          </button>
        </template>
        <template v-if="customPage" #page="{ node, issues }">
          <div class="lcn-demo-page">
            <p><strong>宿主自渲染：</strong>{{ node?.label }}</p>
            <p class="lcn-demo-note">
              这一格完全由宿主决定（勾上即可看到）。低代码的价值不是替你渲染，而是替你
              <strong>保住导航与页签的骨架</strong>；配置有 <strong>{{ issues.length }}</strong> 处问题也一并交给你。
            </p>
          </div>
        </template>
      </LowCodeNav>

      <aside class="lcn-demo-log" aria-label="外壳事件日志">
        <div class="lcn-demo-log-head">
          <span>外壳发出的事件（提交发给谁由你决定）</span>
          <button type="button" class="lcn-demo-btn" @click="events = []">清空</button>
        </div>
        <p class="lcn-demo-stat" data-test="store-stat">
          当前 store：内存实现 · localStorage 记录：{{ localCount }} 条
        </p>
        <ol class="lcn-demo-events">
          <li v-for="(e, i) in events" :key="i" :data-event="e.name">
            <code>{{ e.name }}</code>
            <span class="lcn-demo-payload">{{ e.payload }}</span>
          </li>
        </ol>
        <p v-if="!events.length" class="lcn-demo-note">还没有事件。点点左侧导航、填填表单。</p>
      </aside>
    </div>

    <details class="lcn-demo-code">
      <summary>最小接入片段（复制走）</summary>
      <pre><code>&lt;LowCodeNav
  :source="{ kind: 'api', url: '/api/nav', dataPath: 'data.items' }"
  :form-store="myStore"          &lt;!-- 你自己的 FormStore 实现 --&gt;
  @page-submit="(p) =&gt; save(p)"   &lt;!-- 提交发给谁由你决定；外壳不自动外发 --&gt;
/&gt;</code></pre>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import LowCodeNav from '@/components/form-builder/lowcode/LowCodeNav.vue'
import type { NavSource } from '@/components/form-builder/lowcode/useLowCodeNav'
import { FORM_DESIGN_VERSION, type FormDesign } from '@/components/form-builder/designer/types/domain'
import type { FormMetaItem, FormStore } from '@/components/form-builder/designer/store'
import type { NavNode } from '@/components/form-builder/lowcode/nav-schema'

/** 演示用的设计（真 `FormDesign`：设计器节点树，不是手搓 schema） */
const design = (title: string, nodes: FormDesign['nodes']): FormDesign => ({
  schemaVersion: FORM_DESIGN_VERSION,
  meta: { title, submitText: '提交' },
  nodes,
})

const designs: Record<string, FormDesign> = {
  'demo-customers': design('客户台账', [
    { id: 'c1', type: 'text', label: '客户名称', key: 'name', required: true, placeholder: '必填' },
    { id: 'c2', type: 'select', label: '客户等级', key: 'level', options: ['A 类', 'B 类', 'C 类'] },
  ]),
  'demo-tickets': design('工单', [
    { id: 't1', type: 'text', label: '工单标题', key: 'title', required: true },
    { id: 't2', type: 'textarea', label: '问题描述', key: 'detail' },
  ]),
}

/**
 * 宿主自己的 store：**只实现接口，不碰本机存储**。
 * 换成后端实现时，导航、表单页、提交三者都不用改。
 */
const mem = new Map<string, FormDesign>(Object.entries(designs))
const stamp = (id: string): FormMetaItem => ({
  id,
  name: String((mem.get(id)?.meta as { title?: string } | undefined)?.title ?? id),
  updatedAt: '2026-10-25T00:00:00.000Z',
  collectKey: `fd_collect_${id}`,
})
const demoStore: FormStore = {
  async listForms() {
    return [...mem.keys()].map(stamp)
  },
  async loadForm(id) {
    return mem.get(id) ?? null
  },
  async saveForm(id, d, name) {
    const nid = id ?? `mem_${mem.size + 1}`
    mem.set(nid, d)
    return { ...stamp(nid), name: name ?? stamp(nid).name }
  },
  async renameForm() {},
  async deleteForm(id) {
    mem.delete(id)
  },
  async loadRecords() {
    return []
  },
  async appendRecord() {},
  async removeRecord() {},
  async clearRecords() {},
}

const sources = [
  { kind: 'forms', label: 'forms：用户自建表单' },
  { kind: 'api', label: 'api：后端下发定义' },
  { kind: 'static', label: 'static：配置内置' },
] as const
const sourceKind = ref<(typeof sources)[number]['kind']>('api')
const staticNodes: NavNode[] = [
  { key: 's1', label: '写在配置里的一项', kind: 'custom' },
  { key: 's2', label: '第二项', kind: 'data' },
]
const source = computed<NavSource>(() => {
  if (sourceKind.value === 'forms') return { kind: 'forms', icon: 'clipboard' }
  if (sourceKind.value === 'static') return { kind: 'static', nodes: staticNodes }
  // dev-only 端点（vite.config 的 lowcodeDemoApiPlugin）：同源 → 默认策略放行
  return { kind: 'api', url: '/api/lowcode-demo/nav', dataPath: 'data.items' }
})

const customPage = ref(false)
const showIssues = ref(false)
const customItem = ref(false)

interface LoggedEvent {
  name: string
  payload: string
}
const events = ref<LoggedEvent[]>([])
const log = (name: string, payload: unknown) => {
  const p = payload as { node?: { key?: string }; data?: unknown }
  events.value.unshift({
    name,
    payload: p?.node?.key ? `${p.node.key} → ${JSON.stringify(p.data ?? {})}` : JSON.stringify(payload),
  })
}
const onSelect = (node: NavNode) => log('select', { node: { key: node.key } })

/** 本机存储里有多少条表单记录（证明"注入的 store 不碰 localStorage"） */
const localCount = ref(0)
const countLocal = () => {
  localCount.value = Object.keys(localStorage).filter((k) => k.includes('fd_form_')).length
}
watch(sourceKind, countLocal, { immediate: true })
</script>

<style src="./lowcode-nav-demo-scoped.css" scoped></style>
