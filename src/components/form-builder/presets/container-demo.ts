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
 *
 * 函数化：模块求值早于 setLocale，文案在调用时刻按当前语言翻译
 */

import type { DesignerNode, FormMeta } from '../designer/types'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：纯 .ts 文件，各函数直接用 */
const t = useT()

export function containerDemoNodes(): DesignerNode[] {
  return [
    // ── grid 容器：基本信息（2 列） ──
    {
      id: 'c-grid-basic',
      type: 'grid',
      label: t('fbPre.groupBasic'),
      isContainer: true,
      containerConfig: { columns: 2 },
      children: [
        {
          id: 'f-name',
          type: 'text',
          label: t('fb.sampleName'),
          key: 'name',
          required: true,
          placeholder: t('fbPre.regNamePh'),
          span: 12,
        },
        {
          id: 'f-phone',
          type: 'text',
          label: t('fbPre.regPhone'),
          key: 'phone',
          required: true,
          placeholder: t('fbPre.regPhonePh'),
          span: 12,
        },
        {
          id: 'f-email',
          type: 'text',
          label: t('fbPre.regEmail'),
          key: 'email',
          placeholder: 'example@domain.com',
          span: 12,
        },
        {
          id: 'f-gender',
          type: 'radio',
          label: t('fbPre.regGender'),
          key: 'gender',
          options: [t('fbPre.regMale'), t('fbPre.regFemale')],
          span: 12,
        },
      ],
    },

    // ── tabs 容器：信息分页（2 个标签页） ──
    {
      id: 'c-tabs-info',
      type: 'tabs',
      label: t('fbPre.cdTabsInfo'),
      isContainer: true,
      containerConfig: {
        tabs: [
          { label: t('fbPre.cdTabProfile'), name: 'profile' },
          { label: t('fbPre.cdTabWork'), name: 'work' },
        ],
        activeTab: 'profile',
      },
      children: [
        {
          id: 'f-birth',
          type: 'date',
          label: t('fbPre.regBirthday'),
          key: 'birthday',
          placeholder: t('fbPre.cdDatePh'),
          containerSlot: 0,
        },
        {
          id: 'f-address',
          type: 'text',
          label: t('formBuilder.addressPlaceholder'),
          key: 'address',
          placeholder: t('fbPre.regAddressPh'),
          containerSlot: 0,
        },
        {
          id: 'f-company',
          type: 'text',
          label: t('fbPre.cdCompany'),
          key: 'company',
          placeholder: t('fbPre.cdCompanyPh'),
          containerSlot: 1,
        },
        {
          id: 'f-title',
          type: 'text',
          label: t('fbPre.cdJobTitle'),
          key: 'jobTitle',
          placeholder: t('fbPre.cdJobTitlePh'),
          containerSlot: 1,
        },
      ],
    },

    // ── collapse 容器：更多信息（2 个折叠项） ──
    {
      id: 'c-collapse-more',
      type: 'collapse',
      label: t('fbPre.cdCollapseMore'),
      isContainer: true,
      containerConfig: {
        collapseItems: [
          { title: t('fbPre.regHobbies'), expanded: true },
          { title: t('fbPre.cdSupplement'), expanded: false },
        ],
        activeCollapse: 0,
      },
      children: [
        {
          id: 'f-hobbies',
          type: 'checkbox',
          label: t('fbPre.regHobbies'),
          key: 'hobbies',
          options: [
            t('fbPre.regOptReading'),
            t('fbPre.regOptSports'),
            t('fbPre.regOptMusic'),
            t('fbPre.regOptTravel'),
            t('fbPre.regOptCoding'),
          ],
          containerSlot: 0,
        },
        {
          id: 'f-remark',
          type: 'textarea',
          label: t('fbPre.regRemark'),
          key: 'remark',
          placeholder: t('fbPre.regRemarkPh'),
          rows: 3,
          containerSlot: 1,
        },
      ],
    },

    // ── steps 容器：审批流程（2 个步骤） ──
    {
      id: 'c-steps-flow',
      type: 'steps',
      label: t('fbPre.cdStepsFlow'),
      isContainer: true,
      containerConfig: {
        steps: [{ title: t('fbPre.cdStepApplicant') }, { title: t('fbPre.cdStepApprover') }],
        activeStep: 0,
      },
      children: [
        {
          id: 'f-applicant',
          type: 'text',
          label: t('fbPre.cdApplicant'),
          key: 'applicant',
          placeholder: t('fbPre.cdApplicantPh'),
          containerSlot: 0,
        },
        {
          id: 'f-approver',
          type: 'select',
          label: t('fbPre.cdApprover'),
          key: 'approver',
          placeholder: t('fbPre.cdApproverPh'),
          options: [t('fbPre.cdOptMgrZhang'), t('fbPre.cdOptSupLi'), t('fbPre.cdOptDirWang')],
          containerSlot: 1,
        },
      ],
    },
  ]
}

export function containerDemoMeta(): FormMeta {
  return {
    title: t('fbPre.cdMetaTitle'),
    description: t('fbPre.cdMetaDesc'),
    submitText: t('common.submit'),
    resetText: t('common.reset'),
  }
}
