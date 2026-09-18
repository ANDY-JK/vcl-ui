/**
 * 草稿保存的容量策略 —— 表单数据草稿（useFormStorage）与设计器草稿（useDesignerDraft）共用一份。
 * 过去两个文件各写一遍同样的 TTL 与体积上限，改一处另一处就悄悄落后：
 * 它们本来就落在同一个浏览器存储配额里。
 */

/** 草稿存活时长：7 天 */
export const DRAFT_TTL = 7 * 24 * 60 * 60 * 1000

/** 单份草稿最大 2MB：防超出浏览器存储配额（配额吃满后新写入会整体失败） */
export const DRAFT_MAX_SIZE = 2 * 1024 * 1024
