<template>
  <section class="lcn-demo">
    <header class="lcn-demo-head">
      <!-- h1 而非 h2：demo 页的语义主标题；全站 a11y 扫描也以可见 h1 作为"页面已挂载"信号 -->
      <h1 class="lcn-demo-title">低代码导航外壳（宿主接入示例）</h1>
      <p class="lcn-demo-desc">
        宿主只挂一个 <code>&lt;LowCodeNav&gt;</code> + 一个低代码入口，<strong>其余导航项由用户自建</strong>。
        下面可以在 <strong>内存实现</strong>（零网络）与<strong>官方 REST 实现</strong>（真 HTTP，dev server
        当"你自己的后端"）之间切换 ——「对接自己数据库」要做的只有一件事：实现 <code>FormStore</code> 接口，或直接用
        <code>createRestFormStore</code> 把后端路由接上。
      </p>
    </header>

    <div class="lcn-demo-bar">
      <div class="lcn-demo-group" role="group" aria-label="表单仓储实现">
        <span class="lcn-demo-label">表单仓储</span>
        <button
          v-for="s in storeKinds"
          :key="s.kind"
          type="button"
          class="lcn-demo-btn"
          :class="{ on: storeKind === s.kind }"
          :aria-pressed="storeKind === s.kind"
          @click="switchStore(s.kind)"
        >
          {{ s.label }}
        </button>
      </div>

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
        ref="navRef"
        class="lcn-demo-nav"
        :source="source"
        :form-store="activeStore"
        :show-issues="showIssues"
        title="我搭的框架"
        @select="onSelect"
        @page-change="log('page-change', $event)"
        @page-submit="onPageSubmit"
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
          当前 store：{{ storeKind === 'rest' ? 'REST（真 HTTP）' : '内存实现' }} · localStorage 记录：{{
            localCount
          }}
          条
        </p>
        <p class="lcn-demo-stat" data-test="server-stat">
          <template v-if="storeKind === 'rest'">
            服务端（dev server 当你的后端）：
            <template v-if="serverStat">
              <strong>{{ serverStat.forms }}</strong> 份表单 / <strong>{{ serverStat.records }}</strong> 条收集记录
            </template>
            <template v-else>读取中…</template>
            <span v-if="serverError">（{{ serverError }}）</span>
          </template>
          <template v-else>服务端：未接入（内存实现，零网络）</template>
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

    <section class="lcn-demo-build">
      <h2 class="lcn-demo-sub">② 用户自建：在设计器里建一个表单，保存后它自己成为导航项</h2>
      <p class="lcn-demo-note">
        这就是「我只搭一个导航入口，其它导航项用户自己建」的那一半。设计器的
        <code>:store</code> 注入的是<strong>同一份宿主 store</strong>，保存后本页调 <code>navRef.refresh()</code> ——
        <strong>不用刷新页面</strong>，左侧（会自动切到 forms 来源）立刻多出一项。 全程零网络：数据进的是宿主自己的
        store。
      </p>
      <FormDesigner
        v-model:nodes="dNodes"
        v-model:meta="dMeta"
        :store="demoStore"
        height="420px"
        @saved="onDesignerSaved"
      />
    </section>

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
import { computed, nextTick, ref, watch } from 'vue'
import FormDesigner from '@/components/form-builder/FormDesigner.vue'
import LowCodeNav from '@/components/form-builder/lowcode/LowCodeNav.vue'
import { createRestFormStore } from '@/components/form-builder/designer/rest-form-store'
import { genRecordId } from '@/components/form-builder/designer/types/domain'
import type { NavSource } from '@/components/form-builder/lowcode/useLowCodeNav'
import {
  FORM_DESIGN_VERSION,
  type DesignerNode,
  type FormDesign,
  type FormMeta,
} from '@/components/form-builder/designer/types/domain'
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
/**
 * 表单名（存储层元信息）单独存 —— 它**不等于**设计里的 `meta.title`：
 * `FormMetaItem.name` 是"这份表单叫什么"（保存弹窗里填的），`meta.title` 是"渲染出来的标题"。
 * e2e 抓到的正是这个：设计器 `saved` 事件给的是 `name='巡检台账'`，而设计里的 title 还是默认值，
 * 我第一版用 `meta.title` 当表单名，导航项于是显示成默认标题。
 */
const names = new Map<string, string>(Object.entries(designs).map(([id, d]) => [id, d.meta.title ?? id]))
const stamp = (id: string): FormMetaItem => ({
  id,
  name: names.get(id) ?? id,
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
    names.set(nid, name ?? names.get(nid) ?? String(d.meta.title ?? nid))
    return stamp(nid)
  },
  async renameForm(id, name) {
    names.set(id, name)
  },
  async deleteForm(id) {
    mem.delete(id)
    names.delete(id)
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

// ── ② 用户自建：内置设计器（同一份宿主 store）+ 保存后自动刷新导航 ──

/** 外壳实例：只用到它 `defineExpose` 出来的 `refresh()` */
const navRef = ref<{ refresh: () => Promise<void> } | null>(null)
const dNodes = ref<DesignerNode[]>([])
const dMeta = ref<FormMeta>({ title: '新建台账' })

/**
 * 设计器保存成功 → 切到 `forms` 来源并让外壳重取。
 *
 * 为什么这两步都要有：**(a)** 宿主自己的列表 UI 往往不在这一屏，切过来用户才看得见"我的表单成了导航项"；
 * **(b)** 不调 `refresh()` 就得整页重载 —— "用户完全自己对接"的承诺里，宿主必须有"我存完了，你重取一下"的能力。
 */
const onDesignerSaved = async (item: FormMetaItem) => {
  log('designer-saved', { name: item.name, id: item.id })
  sourceKind.value = 'forms'
  await navRef.value?.refresh()
}

// ── ③ 两种仓储实现：内存（零网络）↔ 官方 REST（真 HTTP） ──

/**
 * 「对接自己数据库」在这里变成**可切换的一件事**：
 *   内存实现 = 本文件上面那份手写 `demoStore`（零网络，适合本地/单机）
 *   REST 实现 = 官方 `createRestFormStore`（9 条约定路由，宿主后端照此实现即可）
 *
 * 为什么演示页要能切：换实现**不改外壳**（`form-store` 注入 + `refresh()` 重取就够了）。
 * 只讲"换个实现就能上生产"是没法验证的，能切才有证据。
 */
const storeKinds = [
  { kind: 'memory', label: '内存（零网络）' },
  { kind: 'rest', label: 'REST（真 HTTP）' },
] as const
const storeKind = ref<'memory' | 'rest'>('memory')

/**
 * 令牌用**函数形态**取：真实项目里每次请求都要带最新登录态，写成常量就会拿到过期令牌。
 * dev server 那份参考后端**故意要求**这个头（缺了返回 401），于是"接没接对"是可观测的。
 */
const DEMO_TOKEN = 'Bearer demo-token-r105'
const restStore = createRestFormStore({
  baseUrl: '/api/lowcode-demo/store',
  headers: () => ({ Authorization: DEMO_TOKEN }),
})
const activeStore = computed<FormStore>(() => (storeKind.value === 'rest' ? restStore : demoStore))

/** 服务端自己报的数（表单份数 / 收集记录条数）——**从后端读**才证明数据真的落了库 */
const serverStat = ref<{ forms: number; records: number } | null>(null)
const serverError = ref('')
async function fetchServerStat() {
  if (storeKind.value !== 'rest') {
    serverStat.value = null
    serverError.value = ''
    return
  }
  try {
    const res = await fetch('/api/lowcode-demo/store/__stats', { headers: { Authorization: DEMO_TOKEN } })
    if (!res.ok) throw new Error(`__stats HTTP ${res.status}`)
    serverStat.value = (await res.json()) as { forms: number; records: number }
    serverError.value = ''
  } catch (err) {
    serverStat.value = null
    serverError.value = err instanceof Error ? err.message : String(err)
  }
}
watch(storeKind, () => void fetchServerStat(), { immediate: true })

/** 换实现 = 换数据源 → 必须让外壳重取（否则导航还停在旧 store 的结果上） */
async function switchStore(kind: 'memory' | 'rest') {
  if (storeKind.value === kind) return
  storeKind.value = kind
  log('store-switch', { kind })
  // ⚠️ 顺序有讲究：`activeStore` 是 computed，`:form-store` 这个 prop 要等**下一次渲染**
  // 才传到外壳；同一个 tick 里立刻调 refresh()，外壳读到的还是旧 prop（表现为"切了没变化，
  // 但页面区已经换了源"，第 105 轮就是这样被 e2e 抓到的）。宿主自己也换实现时照此处理。
  await nextTick()
  await navRef.value?.refresh()
  await fetchServerStat()
}

/**
 * 提交落到哪由**宿主**决定（外壳刻意不自动外发）：
 * 内存实现只记事件；REST 实现把这条记录真的 POST 到后端，然后重新读服务端计数 ——
 * 于是"数据进来了"不是靠日志自证，而是后端自己报出来的。
 */
async function onPageSubmit({ node, data }: { node: NavNode; data: Record<string, unknown> }) {
  log('page-submit', { node, data })
  if (storeKind.value !== 'rest') return
  if (node.kind !== 'form') return
  const formId = (node as { formId?: string }).formId
  if (!formId) return
  // 记录形状照官方 CollectRecord（id 用官方 genRecordId()，别自己拼随机串）
  await restStore.appendRecord(`fd_collect_${formId}`, {
    id: genRecordId(),
    time: new Date().toLocaleString('zh-CN', { hour12: false }),
    data: data,
  })
  await fetchServerStat()
  log('record-saved', { storageKey: `fd_collect_${formId}` })
}
</script>

<style src="./lowcode-nav-demo-scoped.css" scoped></style>
