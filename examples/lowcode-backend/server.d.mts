// server.mjs 的类型声明（逻辑在 .mjs，本文件只声明签名；对齐 `scripts/theme-pure.d.mts` 的写法）。
//
// 为什么值得声明：这个文件既给宿主"照着部署"，也被 `vite.config.ts` 直接 import 当 demo 后端用 ——
// 没有签名时调用方只能拿到 any，"少传 token""把 prefix 拼错"这类错误就没人拦。

/** 一条收集记录（与库里的 `CollectRecord` 同形，此处不引库类型：后端工程不装 vcl-ui） */
export interface LowcodeRecord {
  id: string
  time: string
  data: Record<string, unknown>
}

/** 表单列表项（与库里 `FormStore.listForms()` 的返回同形） */
export interface LowcodeFormMeta {
  id: string
  name: string
  updatedAt: string
  collectKey: string
}

/** 存储层接口：**宿主换数据库时实现这个**（11 个方法），路由与鉴权不用动 */
export interface LowcodeStore {
  listForms(): Promise<LowcodeFormMeta[]>
  loadForm(id: string): Promise<unknown>
  saveForm(id: string | null, design: unknown, name?: string): Promise<LowcodeFormMeta>
  renameForm(id: string, name: string): Promise<void>
  deleteForm(id: string): Promise<void>
  loadRecords(storageKey: string): Promise<LowcodeRecord[]>
  appendRecord(storageKey: string, record: LowcodeRecord): Promise<void>
  updateRecord(storageKey: string, recordId: string, data: Record<string, unknown>): Promise<void>
  removeRecord(storageKey: string, recordId: string): Promise<void>
  clearRecords(storageKey: string): Promise<void>
  stats(): Promise<{ forms: number; records: number }>
}

export interface LowcodeBackendOptions {
  /** 全权令牌（可读可写、可见受限导航组）。**必填**：本参考实现不提供无鉴权模式 */
  token: string
  /** 只读令牌（写操作 403，看不到受限导航组） */
  limitedToken?: string
  /** 存储层；不给就用 `createMemoryStore()`（重启即丢） */
  store?: LowcodeStore
  /** 打请求日志（默认关：测试里不该制造噪音） */
  log?: boolean
  /** 挂载前缀，默认 `/api/lowcode` */
  prefix?: string
  /** 预置数据；**首次请求前落地**（内部 await，不存在"第一个请求看不见种子"的竞态） */
  seed?: (store: LowcodeStore) => Promise<void> | void
}

/** 请求处理器：可包成独立服务，也可挂进别人的服务器（Vite 中间件 / Express / Serverless 适配器） */
export function createLowcodeHandler(
  options: LowcodeBackendOptions,
): (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>

/** 建独立 HTTP 服务（不监听）：`server.listen(0)` 后读 `server.address().port` */
export function createLowcodeBackend(
  options: LowcodeBackendOptions,
): import('node:http').Server

/** 内存存储：**删掉它、换成你的数据库**（方法签名照抄 `LowcodeStore` 即可） */
export function createMemoryStore(): LowcodeStore