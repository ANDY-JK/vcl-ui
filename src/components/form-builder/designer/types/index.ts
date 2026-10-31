/**
 * 设计器类型与工具聚合 — 拆分自单体 types.ts（超 800 行约束整改）。
 * domain: 节点树模型/树操作/字段注册元信息；to-schema: 设计数据 → FormSchema 转换。
 * 外部统一从本 index 导入，原 './types' 引用路径不变。
 */
export * from './domain'
export * from './to-schema'
// 树操作已从 domain 拆出（2026-11-01）：桶文件继续转发，调用方 './types' 路径不变
export * from '../tree-ops'
