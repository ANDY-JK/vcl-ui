/**
 * useFormNav —— 把「用户自建的表单」变成导航项（动态导航）
 *
 * 解决的场景（宿主的产品形态）：
 *   宿主只提供**一个导航外壳 + 一个低代码入口**，其余导航项由用户自己创建。
 *   用户在设计器里存下的表单，应当**自动出现在导航里**，而不是每加一个表单就要
 *   宿主编译一次、写一条硬编码路由。
 *
 * 数据来源是 `FormStore`（`listForms()`）——所以「对接自己的数据库」这件事只有一处：
 * 宿主把 FormStore 换成自己后端的实现（`setActiveFormStore(...)`），导航就跟着走，
 * 本模块不需要任何改动、也不需要知道数据从哪来。
 *
 * 用法（宿主外壳里）：
 *   const { items, refresh } = useFormNav({ basePath: '/f' })
 *   // items → [{ key, label, path: '/f/<formId>', collectKey, updatedAt }]
 *   // 用户在设计器里新建/改名/删除后调用 refresh() 即可同步
 *
 * 边界（如实声明）：
 *   · 本模块**只产出数据**，不渲染导航 UI——宿主用什么导航组件是宿主的选择；
 *   · `path` 只是**建议值**，宿主有自己的路由约定时自行映射（formId 是稳定锚点）；
 *   · 不做权限过滤，`filter` 由宿主按自己的权限模型实现。
 */
import { ref, onMounted, type Ref } from 'vue'
import { getActiveFormStore, type FormMetaItem, type FormStore } from './designer/store'

/** 一个导航项：由一条表单元信息映射而来 */
export interface FormNavItem {
  /** 导航唯一键（= 表单 id，稳定，可直接作 v-for 的 key） */
  key: string
  /** 显示名（= 表单名，用户可随时在设计器里改） */
  label: string
  /** 表单 id（宿主路由的稳定锚点） */
  formId: string
  /** 建议路由路径：`${basePath}/${formId}` */
  path: string
  /** 该表单收集记录的存储键（宿主渲染"数据/审核"页时用） */
  collectKey: string
  /** 最后更新时间（ISO） */
  updatedAt: string
  /** 图标名（仅当 options.icon 提供时存在） */
  icon?: string
}

/** 生成导航项的可选项（全部可选，默认行为见各字段说明） */
export interface FormNavOptions {
  /** 路径前缀，默认 `/form`；最终生成 `${basePath}/${formId}`。与 toPath 同时给时以 toPath 为准 */
  basePath?: string
  /**
   * 自定义路径生成（宿主有自己的路由约定时用）。
   * 例：本仓示例站的路由是 `#/form/S.<formId>`（短链），就传
   * `toPath: (f) => '/form/' + encodeShareId(f.id)`。
   * 不传则回落 `${basePath}/${formId}`。
   */
  toPath?: (form: FormMetaItem) => string
  /** 过滤哪些表单进导航；默认全部。权限/分组由宿主在此实现 */
  filter?: (form: FormMetaItem) => boolean
  /** 排序；默认按 `updatedAt` 倒序（最近改动的在最前） */
  sort?: (a: FormMetaItem, b: FormMetaItem) => number
  /** 图标名，或按表单计算的函数；不传则导航项不带 icon 字段 */
  icon?: string | ((form: FormMetaItem) => string | undefined)
}

/**
 * 纯函数：表单元信息列表 → 导航项列表。
 *
 * 抽成纯函数是为了可单测、也可在宿主自己的数据管道里用（例如宿主已有表单列表缓存，
 * 只想要映射逻辑，不需要本模块的加载副作用）。
 */
export function buildFormNavItems(forms: FormMetaItem[], options: FormNavOptions = {}): FormNavItem[] {
  const basePath = options.basePath ?? '/form'
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  const filter = options.filter
  const sort =
    options.sort ??
    ((a: FormMetaItem, b: FormMetaItem) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))

  const list = filter ? forms.filter(filter) : forms.slice()
  return list.sort(sort).map((form) => {
    const icon = typeof options.icon === 'function' ? options.icon(form) : options.icon
    const item: FormNavItem = {
      key: form.id,
      label: form.name,
      formId: form.id,
      path: options.toPath ? options.toPath(form) : `${base}/${form.id}`,
      collectKey: form.collectKey,
      updatedAt: form.updatedAt,
    }
    return icon ? { ...item, icon } : item
  })
}

/** `useFormNav` 的可选项：在映射选项之上加数据源与加载时机 */
export interface UseFormNavOptions extends FormNavOptions {
  /** 数据源；不传则用 `getActiveFormStore()`（宿主经 setActiveFormStore 注入的后端） */
  store?: FormStore
  /**
   * 是否在挂载时自动加载，默认 true。
   * 宿主若想在路由守卫里先加载再渲染，可传 false 后自行 await refresh()。
   */
  autoLoad?: boolean
}

/** `useFormNav` 的返回值 */
export interface UseFormNavResult {
  /** 导航项（响应式；refresh 后更新） */
  items: Ref<FormNavItem[]>
  /** 是否正在加载 */
  loading: Ref<boolean>
  /** 上次加载失败的原因（成功时为 null）——**不静默吞错**，宿主可据此提示或回退 */
  error: Ref<string | null>
  /** 重新从存储加载并重建导航项 */
  refresh: () => Promise<FormNavItem[]>
}

/**
 * 组合式函数：从当前 FormStore 加载表单列表并转成导航项。
 *
 * 失败语义：`listForms()` 抛错时 `error` 置为原因、`items` 保持上一次的值（不清空）——
 * 导航不该因为一次网络抖动整条消失。
 */
export function useFormNav(options: UseFormNavOptions = {}): UseFormNavResult {
  const items = ref<FormNavItem[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh(): Promise<FormNavItem[]> {
    loading.value = true
    error.value = null
    try {
      const store = options.store ?? getActiveFormStore()
      const forms = await store.listForms()
      const next = buildFormNavItems(forms, options)
      items.value = next
      return next
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      return items.value // 保留上一次的导航，不因抖动清空
    } finally {
      loading.value = false
    }
  }

  if (options.autoLoad !== false) {
    onMounted(() => {
      void refresh()
    })
  }

  return { items, loading, error, refresh }
}
