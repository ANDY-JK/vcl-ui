/**
 * 预置模板：容器布局示例（含嵌套容器）
 *
 * 与 registration/inspection/contract 三个「平铺字段」模板不同，
 * 本模板直接导出 DesignerNode[] 树，展示 v3 的容器能力：
 * - grid 容器（多列栅格）
 * - tabs 容器（标签页分页）
 * - collapse 容器（折叠面板）
 * - steps 容器（步骤条）
 *
 * 字段通过 containerSlot 归属到 tabs/collapse/steps 的具体槽位。
 */

import type { DesignerNode, FormMeta } from '../designer/types'

export const containerDemoNodes: DesignerNode[] = [
  // ── grid 容器：基本信息（2 列） ──
  {
    id: 'c-grid-basic',
    type: 'grid',
    label: '基本信息',
    isContainer: true,
    containerConfig: { columns: 2 },
    children: [
      { id: 'f-name', type: 'text', label: '姓名', key: 'name', required: true, placeholder: '真实姓名', span: 12 },
      { id: 'f-phone', type: 'text', label: '手机号', key: 'phone', required: true, placeholder: '11 位手机号', span: 12 },
      { id: 'f-email', type: 'text', label: '邮箱', key: 'email', placeholder: 'example@domain.com', span: 12 },
      { id: 'f-gender', type: 'radio', label: '性别', key: 'gender', options: ['男', '女'], span: 12 },
    ],
  },

  // ── tabs 容器：信息分页（2 个标签页） ──
  {
    id: 'c-tabs-info',
    type: 'tabs',
    label: '信息分页',
    isContainer: true,
    containerConfig: {
      tabs: [
        { label: '个人资料', name: 'profile' },
        { label: '工作信息', name: 'work' },
      ],
      activeTab: 'profile',
    },
    children: [
      { id: 'f-birth', type: 'date', label: '出生日期', key: 'birthday', placeholder: '选择日期', containerSlot: 0 },
      { id: 'f-address', type: 'text', label: '详细地址', key: 'address', placeholder: '街道门牌号', containerSlot: 0 },
      { id: 'f-company', type: 'text', label: '公司名称', key: 'company', placeholder: '所在公司', containerSlot: 1 },
      { id: 'f-title', type: 'text', label: '职位', key: 'jobTitle', placeholder: '当前职位', containerSlot: 1 },
    ],
  },

  // ── collapse 容器：更多信息（2 个折叠项） ──
  {
    id: 'c-collapse-more',
    type: 'collapse',
    label: '更多信息',
    isContainer: true,
    containerConfig: {
      collapseItems: [
        { title: '兴趣爱好', expanded: true },
        { title: '补充说明', expanded: false },
      ],
      activeCollapse: 0,
    },
    children: [
      {
        id: 'f-hobbies',
        type: 'checkbox',
        label: '兴趣爱好',
        key: 'hobbies',
        options: ['阅读', '运动', '音乐', '旅行', '编程'],
        containerSlot: 0,
      },
      {
        id: 'f-remark',
        type: 'textarea',
        label: '备注',
        key: 'remark',
        placeholder: '其他需要说明的信息（可选）',
        rows: 3,
        containerSlot: 1,
      },
    ],
  },

  // ── steps 容器：审批流程（2 个步骤） ──
  {
    id: 'c-steps-flow',
    type: 'steps',
    label: '审批流程',
    isContainer: true,
    containerConfig: {
      steps: [{ title: '申请人信息' }, { title: '审批人信息' }],
      activeStep: 0,
    },
    children: [
      { id: 'f-applicant', type: 'text', label: '申请人', key: 'applicant', placeholder: '申请人姓名', containerSlot: 0 },
      {
        id: 'f-approver',
        type: 'select',
        label: '审批人',
        key: 'approver',
        placeholder: '选择审批人',
        options: ['张经理', '李主管', '王总监'],
        containerSlot: 1,
      },
    ],
  },
]

export const containerDemoMeta: FormMeta = {
  title: '容器布局示例',
  description: '演示 grid / tabs / collapse / steps 四种容器嵌套',
  submitText: '提交',
  resetText: '重置',
}
