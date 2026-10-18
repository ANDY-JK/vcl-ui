/**
 * storage-scope —— 存储键的**租户/工作区作用域**（H.1 第 4 项：多租户隔离）
 *
 * 问题：低代码平台的本地键是**全局固定**的（`fd_forms_index` / `fd_form_<id>` / `fd_collect_<id>`）。
 * 同一浏览器里跑两个团队/两个工作区时，只要表单 id 撞上（自增或同名都会撞），
 * 就会出现「A 团队的表单列表里出现 B 团队的表单」「收集记录串桶」——这是**数据串租**，
 * 不是显示问题。
 *
 * 做法：给所有平台存储键加一个**可选前缀**。默认作用域为空 → 键与改造前**逐字一致**，
 * 老数据不受影响；宿主多租户部署时设一次作用域即可完成隔离：
 *
 *   setStorageScope('tenant-a')   →  fd_forms_index 变 tenant-a::fd_forms_index
 *
 * 作用域字符串**必须由宿主可信来源提供**（如登录后的租户 id），不要直接取 URL 参数——
 * 那等于把租户选择权交给访问者。
 */

/** 允许的字符：字母数字与 `_ . -`，长度 1–64。避免空格/冒号等会破坏键结构或造成歧义的字符。 */
const SCOPE_RE = /^[A-Za-z0-9_.-]{1,64}$/

/** 作用域分隔符（用双冒号便于人眼分辨，且不在白名单内，故作用域里不可能出现） */
const SEP = '::'

let scope = ''

/**
 * 设置当前作用域。
 * @param value 作用域名；传 null / 空串 / 非法值 → 取消作用域（回到全局键）
 * @returns 实际生效的作用域（非法输入会被拒绝并保持原值）
 */
export function setStorageScope(value: string | null): string {
  if (value === null || value === '') {
    scope = ''
    return scope
  }
  if (!SCOPE_RE.test(value)) return scope // 非法值不生效，保持原作用域
  scope = value
  return scope
}

/** 读取当前作用域（未设置返回空串） */
export function getStorageScope(): string {
  return scope
}

/**
 * 给一个存储键加上当前作用域。
 * 作用域为空时**原样返回**——这是「默认行为零变化」的关键。
 */
export function scopedKey(key: string): string {
  return scope ? `${scope}${SEP}${key}` : key
}
