/**
 * 预置 Schema：动态表单审核流程
 *
 * 从旧版 DynamicForm.vue 的 mode='review' 审核模式 + apiUrl/saveUrl 链路抽取。
 * 原逻辑：全字段可编辑 + GET 加载数据 + IndexedDB 缓存 + 防抖自动保存 POST 提交。
 *
 * 在 form-builder 低代码体系中，审核模式转化为多步骤审批流程模板：
 * - 步骤 1：申请人填写基础信息（姓名、部门、事项、金额）
 * - 步骤 2：审核人审核（审核状态、审核意见、签名）
 * - 步骤 3：附件与确认（附件上传、最终备注）
 *
 * API 提交链路由 form-builder 的 submitConfig（提交配置）承接，
 * 远程数据源由 dataConfig.sourceType=api 承接，
 * 审核自动保存可配置 submitConfig.autoSave（防抖间隔 ms）。
 *
 * 函数化：模块求值早于 setLocale，文案在调用时刻按当前语言翻译
 */

import type { FormSchema } from '../types'
import { validators } from '../useFormValidator'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：纯 .ts 文件，各函数直接用 */
const t = useT()

export function reviewFormSchema(): FormSchema {
  return {
    title: t('fbPre.rvTitle'),
    description: t('fbPre.rvDesc'),
    layout: 'steps',
    submitText: t('fbPre.rvSubmit'),
    validateOnChange: true,
    /**
     * 表单级 API 提交链路（承接旧版 DynamicForm 审核模式）
     * - mode: review — 全字段可编辑 + GET 加载 + 变更防抖自动保存
     * - apiUrl: 挂载时 GET 加载审核单数据并回填（响应取 json.data ?? json）
     * - saveUrl: 提交按钮 POST 提交；review 模式同时作为防抖自动保存目标
     * - reviewAutoSave: 自动保存防抖 ms（0 禁用）
     * - params: GET 附加 query（如 ?id=xxx 定位审核单），POST 并入 body
     *
     * 业务接入时把下方示例地址替换为真实接口即可，其余逻辑零改动。
     */
    submitConfig: {
      mode: 'review',
      apiUrl: '/api/review-form',
      saveUrl: '/api/review-form',
      reviewAutoSave: 3000,
      params: { id: 1001 },
    },
    steps: [
      { title: t('fbPre.rvStepApply'), fields: ['applicant', 'dept', 'item', 'amount', 'date'] },
      { title: t('fbPre.rvStepReview'), fields: ['reviewStatus', 'reviewComment', 'reviewerSign'] },
      { title: t('fbPre.rvStepConfirm'), fields: ['attachments', 'finalRemark'] },
    ],
    fields: [
      // ─── 步骤1：申请信息 ───
      {
        key: 'applicant',
        label: t('fbPre.rvApplicant'),
        type: 'text',
        required: true,
        placeholder: t('fbPre.rvApplicantPh'),
        group: t('fbPre.rvStepApply'),
      },
      {
        key: 'dept',
        label: t('fbPre.rvDept'),
        type: 'select',
        required: true,
        placeholder: t('fbPre.rvDeptPh'),
        options: [
          { value: 'sales', label: t('fbPre.rvDeptSales') },
          { value: 'tech', label: t('fbPre.rvDeptTech') },
          { value: 'ops', label: t('fbPre.rvDeptOps') },
          { value: 'finance', label: t('fbPre.rvDeptFinance') },
        ],
        group: t('fbPre.rvStepApply'),
      },
      {
        key: 'item',
        label: t('fbPre.rvItem'),
        type: 'textarea',
        required: true,
        placeholder: t('fbPre.rvItemPh'),
        span: 24,
        props: { rows: 3 },
        group: t('fbPre.rvStepApply'),
      },
      {
        key: 'amount',
        label: t('fbPre.rvAmount'),
        type: 'number',
        required: true,
        placeholder: t('fbPre.rvAmountPh'),
        props: { stepper: true, min: 0, precision: 2 },
        rules: [validators.minVal(0, t('fbPre.rvAmount'))],
        group: t('fbPre.rvStepApply'),
      },
      {
        key: 'date',
        label: t('fbPre.rvDate'),
        type: 'date',
        required: true,
        props: { format: 'YYYY-MM-DD' },
        group: t('fbPre.rvStepApply'),
      },

      // ─── 步骤2：审核 ───
      {
        key: 'reviewStatus',
        label: t('fbPre.rvStatus'),
        type: 'radio',
        required: true,
        props: { direction: 'horizontal' },
        options: [
          { value: 'approve', label: t('fbPre.rvStatusApprove') },
          { value: 'reject', label: t('fbPre.rvStatusReject') },
          { value: 'revise', label: t('fbPre.rvStatusRevise') },
        ],
        group: t('fbPre.rvStepReview'),
      },
      {
        key: 'reviewComment',
        label: t('fbPre.rvComment'),
        type: 'textarea',
        required: true,
        placeholder: t('fbPre.rvCommentPh'),
        span: 24,
        props: { rows: 4 },
        rules: [validators.minLen(10, t('fbPre.rvComment'))],
        group: t('fbPre.rvStepReview'),
      },
      {
        key: 'reviewerSign',
        label: t('fbPre.rvSign'),
        type: 'signature',
        required: true,
        hint: t('fbPre.rvSignHint'),
        group: t('fbPre.rvStepReview'),
      },

      // ─── 步骤3：附件与确认 ───
      {
        key: 'attachments',
        label: t('fbPre.rvAttachments'),
        type: 'image-upload',
        hint: t('fbPre.rvAttachmentsHint'),
        props: {
          variant: 'card',
          accept: 'image/*',
          multiple: true,
          maxSize: 10,
          mobileMenu: true,
          compress: true,
        },
        group: t('fbPre.rvStepConfirm'),
      },
      {
        key: 'finalRemark',
        label: t('fbPre.rvFinalRemark'),
        type: 'textarea',
        placeholder: t('fbPre.rvFinalRemarkPh'),
        span: 24,
        props: { rows: 3 },
        rules: [validators.maxLen(500, t('fbPre.rvFinalRemark'))],
        group: t('fbPre.rvStepConfirm'),
      },
    ],
  }
}
