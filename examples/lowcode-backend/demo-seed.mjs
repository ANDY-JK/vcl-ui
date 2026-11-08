/**
 * 演示站低代码仓储的**种子数据**（唯一一份）
 *
 * 为什么单独成文件：dev 中间件（vite.config.ts）与产物静态服务（scripts/serve-demo-dist.mjs）
 * 必须给同一份种子 —— 否则「dev 能过、产物报错」这类分叉会一直存在，
 * 而 lowcode-nav-shell / lowcode-backend-connect 这几条 e2e 验的正是"种子里那份表单"。
 *
 * 预置的这份"服务端才有的表单"（名字带「服务端：」前缀）是刻意设计的：
 * 切到 REST 仓储后，导航项若从「客户台账 / 工单」变成「服务端：客户台账」，
 * 就证明确实是**从 HTTP 取的**，而不是复用内存里那两份。
 */
export const DEMO_STORE_TOKEN = 'demo-token-r105'
export const DEMO_STORE_PREFIX = '/api/lowcode-demo/store'

export async function seedDemoStore(store) {
  await store.saveForm(
    'rest-customers',
    {
      schemaVersion: 3,
      meta: { title: '服务端：客户台账', submitText: '提交' },
      nodes: [
        { id: 's1', type: 'text', label: '服务端字段·客户名称', key: 'name', required: true },
        { id: 's2', type: 'textarea', label: '服务端字段·备注', key: 'note' },
      ],
    },
    '服务端：客户台账',
  )
}

/**
 * 后端下发的**导航定义**载荷（低代码导航外壳的 api 来源）。
 *
 * 故意混进一个 `javascript:` 链接与一个未知 kind：真实后端一定会下发脏数据，
 * 演示页要能让人**亲眼看到**"合规项照常渲染、坏项不渲染且问题可查"。
 */
export const DEMO_NAV_PAYLOAD = {
  code: 0,
  data: {
    items: [
      {
        key: 'group-biz',
        label: '业务台账',
        kind: 'group',
        children: [
          { key: 'form-customers', label: '客户台账', kind: 'form', formId: 'demo-customers', icon: 'clipboard' },
          { key: 'form-tickets', label: '工单', kind: 'form', formId: 'demo-tickets' },
        ],
      },
      { key: 'link-doc', label: '帮助文档', kind: 'link', url: 'https://example.com/help' },
      { key: 'bad-js', label: '脏数据（会被拒）', kind: 'link', url: 'javascript:alert(1)' },
      { key: 'bad-kind', label: '未知类型（会被丢弃）', kind: 'mystery' },
    ],
  },
}

/** 演示页用的一张固定表格数据 */
export const DEMO_ROWS = [
  { sku: 'SP-1001', name: '门店 A · 冷藏柜', qty: 12, amount: 3840, updatedAt: '2026-10-18 09:12' },
  { sku: 'SP-1002', name: '门店 B · 收银台', qty: 3, amount: 1290, updatedAt: '2026-10-18 10:05' },
  { sku: 'SP-1003', name: '门店 C · 货架区', qty: 27, amount: 8650, updatedAt: '2026-10-18 11:40' },
]
