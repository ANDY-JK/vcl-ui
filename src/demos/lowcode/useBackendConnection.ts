/**
 * 「连接你自己的后端」——把一个**用户输入的** baseUrl + 令牌变成可用的 `FormStore` 与导航来源。
 *
 * ## 为什么需要它
 *
 * 之前演示站把后端地址与令牌**写死在源码里**（`/api/lowcode-demo/store` + 固定令牌），
 * 等于"想接自己的库就得改代码再构建"。而用户的原话是"用户要完全自己其它导航项对接自己数据库"——
 * 那就必须能在页面上填地址、当场验证连通，而不是改源码。
 *
 * ## 安全前提（这一条不能省）
 *
 * 这是**用户输入**的地址，不是宿主可信配置：默认只允许**同源 / 相对路径**
 * （复用 `checkApiUrl` + `policyFromOrigins`）。要连跨域后端，宿主在自己代码里显式放行——
 * 演示站不替用户把这个口子开大，否则"点一下就能把牌子（Authorization）发到任意域名"。
 *
 * ## 令牌怎么存
 *
 * `baseUrl` 总是持久化（刷新不丢）；**令牌默认不落盘**（localStorage 是 XSS 可读的），
 * 需要"记住"时用户显式勾选，并在界面上写明这意味着什么。
 */
import { computed, ref } from 'vue'
import { checkApiUrl, policyFromOrigins } from '@/components/form-builder/api-url-guard'
import { createRestFormStore } from '@/components/form-builder/designer/rest-form-store'
import type { FormStore } from '@/components/form-builder/designer/store'
import type { NavSource } from '@/components/form-builder/lowcode/useLowCodeNav'

export type BackendStatus = 'idle' | 'connecting' | 'connected' | 'error'

/** 连通性探测结果：**从后端自己报的数**读，才证明真的连上了、真的落了库 */
export interface BackendProbe {
  forms: number
  records: number
}

export interface BackendConnectionOptions {
  /** 预填的地址（演示站内置参考后端） */
  defaultBaseUrl?: string
  /** 预填的令牌 */
  defaultToken?: string
  /** 注入 fetch（测试用） */
  fetchImpl?: typeof fetch
  /** localStorage 键前缀（多实例隔离用） */
  storageKey?: string
}

const URL_KEY = 'vcl.lowcode.backend.url'
const TOKEN_KEY = 'vcl.lowcode.backend.token'
const REMEMBER_KEY = 'vcl.lowcode.backend.remember'

/** 去掉尾部斜杠，空串保持空串 */
function trimBase(raw: string): string {
  const s = raw.trim()
  return s.endsWith('/') ? s.replace(/\/+$/, '') : s
}

/**
 * 建一个"后端连接"状态机。返回的 `store` / `navSource` 只在 connected 时非空，
 * 调用方（演示页或宿主）据此决定用哪个 store / 哪种导航来源。
 */
export function useBackendConnection(options: BackendConnectionOptions = {}) {
  const doFetch = options.fetchImpl ?? fetch
  const prefix = options.storageKey ?? ''
  const key = (k: string) => `${prefix}${k}`

  const baseUrl = ref(options.defaultBaseUrl ?? '')
  const token = ref(options.defaultToken ?? '')
  const rememberToken = ref(false)
  const status = ref<BackendStatus>('idle')
  const error = ref('')
  const probe = ref<BackendProbe | null>(null)

  /** 只在浏览器里读；测试环境（happy-dom）也有 localStorage，读不到就当没有 */
  function readStored(k: string): string | null {
    try {
      return localStorage.getItem(key(k))
    } catch {
      return null
    }
  }
  function writeStored(k: string, v: string | null): void {
    try {
      if (v === null) localStorage.removeItem(key(k))
      else localStorage.setItem(key(k), v)
    } catch {
      // 隐私模式/容量满：持久化失败不影响本次会话可用
    }
  }

  // 启动时恢复：地址总是恢复；令牌只在"上次勾了记住"时恢复
  const storedUrl = readStored(URL_KEY)
  if (storedUrl) baseUrl.value = storedUrl
  if (readStored(REMEMBER_KEY) === '1') {
    rememberToken.value = true
    token.value = readStored(TOKEN_KEY) ?? token.value
  }

  const connected = computed(() => status.value === 'connected')
  /** 规整后的地址（空串表示没填） */
  const normalizedBase = computed(() => trimBase(baseUrl.value))

  /** 校验用户输入：协议/同源/形状。返回 ok 或给人看的原因 */
  function validate(): { ok: true; base: string } | { ok: false; reason: string } {
    const base = normalizedBase.value
    if (!base) return { ok: false, reason: '请填写后端地址（例如 /api/lowcode 或 https://你的域名/api/lowcode）' }
    const verdict = checkApiUrl(base, policyFromOrigins([location.origin]), location.origin)
    if (!verdict.ok) return { ok: false, reason: `地址不被允许：${verdict.reason}` }
    return { ok: true, base }
  }

  const authHeaders = () =>
    token.value.trim() ? { Authorization: `Bearer ${token.value.trim()}` } : ({} as Record<string, string>)

  /** 试连：读一次后端自检（`__stats`），顺带把"表单/记录"两份数带回来 */
  async function connect(): Promise<boolean> {
    const v = validate()
    if (!v.ok) {
      status.value = 'error'
      error.value = v.reason
      probe.value = null
      return false
    }
    status.value = 'connecting'
    error.value = ''
    probe.value = null
    const url = `${v.base}/__stats`
    try {
      const res = await doFetch(url, { headers: { Accept: 'application/json', ...authHeaders() } })
      if (res.status === 401 || res.status === 403) {
        status.value = 'error'
        // 分开说：401 是"没带/带错令牌"，403 是"令牌有效但没权限"——排障方向完全不同
        error.value =
          res.status === 401 ? '令牌无效或已过期（401）：请检查令牌' : '令牌有效但没有权限（403）：需要 store:read'
        return false
      }
      if (res.status === 404) {
        status.value = 'error'
        error.value = `该地址下没有参考后端的自检路由（404 ${url}）：请确认 baseUrl 指向 /api/lowcode 这类前缀`
        return false
      }
      if (!res.ok) {
        status.value = 'error'
        error.value = `连接失败：HTTP ${res.status}`
        return false
      }
      const body = (await res.json()) as Partial<BackendProbe> | null
      const forms = typeof body?.forms === 'number' ? body.forms : 0
      const records = typeof body?.records === 'number' ? body.records : 0
      probe.value = { forms, records }
      status.value = 'connected'
      writeStored(URL_KEY, normalizedBase.value)
      writeStored(REMEMBER_KEY, rememberToken.value ? '1' : null)
      writeStored(TOKEN_KEY, rememberToken.value ? token.value.trim() : null)
      return true
    } catch (e) {
      status.value = 'error'
      error.value = `连不上：${e instanceof Error ? e.message : String(e)}（地址对吗？后端起了吗？）`
      return false
    }
  }

  /** 断开：保留输入，清状态（下次点连接不用重填） */
  function disconnect(): void {
    status.value = 'idle'
    error.value = ''
    probe.value = null
  }

  /**
   * 连接成功后可用的仓储；未连接返回 null（调用方据此回退到本地/内置后端）。
   *
   * **实例缓存**：每次调用都 new 一个的话身份会漂移（同一份仓储换实例 → 重复请求、
   * 依赖它的 computed 反复求值），也没法判断"读和写用的是不是同一个"。
   */
  let cached: FormStore | null = null
  function store(): FormStore | null {
    if (!connected.value) {
      cached = null
      return null
    }
    if (!cached) {
      cached = createRestFormStore({
        baseUrl: normalizedBase.value,
        headers: authHeaders,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      })
    }
    return cached
  }

  /**
   * **读和写必须用同一个 store** —— 这条是第 115 轮教训的收口：
   * 之前导航/设计走远程、提交却写死内置实现，记录悄悄落到另一个库。
   * 把"用哪个 store"收成这一个入口，别让调用方各挑各的。
   */
  function resolveStore(local: FormStore): FormStore {
    return store() ?? local
  }

  /** 连接成功后的导航来源：后端下发的导航项（`dataPath: 'data.items'`） */
  function navSource(): NavSource | null {
    if (!connected.value) return null
    return { kind: 'api', url: `${normalizedBase.value}/nav`, dataPath: 'data.items' } as NavSource
  }

  return {
    baseUrl,
    token,
    rememberToken,
    status,
    error,
    probe,
    connected,
    connect,
    disconnect,
    store,
    resolveStore,
    navSource,
  }
}
