/**
 * env-guard.ts — 库产物的构建期环境变量出口（唯一真相源）
 *
 * ⛔ 规则：本库任何模块不得直接写 `import.meta.env.VITE_*`。
 * Vite 会把 `import.meta.env` 静态替换成字面量对象，直接读等于把密钥烧进 dist。
 * 一律走 runtimeEnv()：生产构建下 `import.meta.env.DEV` 被替换为 false，
 * 整个三元左侧连同 env 对象被摇树消除，产物里不留任何变量值。
 *
 * 语义：环境变量只是**开发期便利**（demo 站点免手填）。生产环境必须由宿主
 * 在运行时注入（setAmapKey() / 传入 config），库自身不携带任何凭证。
 */

/** 环境变量集合（VITE_* 为字符串，DEV/PROD/MODE 为内置字段） */
export type EnvRecord = Record<string, string | boolean | undefined>

/** 开发期返回完整 env；生产构建返回空对象（密钥值不进产物） */
export function runtimeEnv(): EnvRecord {
  return import.meta.env.DEV ? { ...import.meta.env } : {}
}

/** 取单个 VITE_* 变量；生产构建恒为 undefined */
export function envValue(key: string): string | undefined {
  const v = runtimeEnv()[key]
  return typeof v === 'string' && v !== '' ? v : undefined
}
