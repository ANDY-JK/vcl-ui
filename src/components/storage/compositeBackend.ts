/**
 * compositeBackend — CompositeBackend 实现（#461 从 contract-storage.ts 拆出）
 *
 * 双写编排器：本地 IndexedDB 恒为可信副本，云端（Supabase/S3）为跨设备同步层。
 * 四条编排不变量（都在代码注释里钉过，随代码搬家）：
 *   1. **在飞排队**：同门店的上传/删除按链式 Promise 排队，防止「删除后上传又复活对象」；
 *   2. **本地优先恢复**：云端失败不阻断本地恢复；本地有真实字节时云端 URL 引用不覆盖本地；
 *   3. **死链与残留清理**：本地 URL 引用而云端无对象 → 清；墓碑表明别处已删且本地数据不新 → 清；
 *   4. **补传守卫**：本地有真实字节而云端缺对象 → 后台补传；墓碑门店且本地数据不新则跳过。
 */
import { reportEvent, reportWarn } from '@/components/_internal/runtime-observer'
import type { StoreUploadState, StorageBackend } from './contract-storage'
import { IndexedDBBackend, SupabaseBackend } from './contract-storage'
import type { SupabaseConfig } from './contract-storage'

/** CompositeBackend 对账所需的最小云端能力（SupabaseBackend/S3Backend 实现；测试可注入假实现） */
export interface CloudBackend {
  readonly kind: 'supabase' | 's3'
  readonly tombstones: Map<number, { name: string; ts: number }>
  loadAll(slotKeys?: string[]): Promise<Map<number, StoreUploadState>>
  saveRecord(appleId: number, state: StoreUploadState): Promise<void>
  clearAll(): Promise<void>
}

/** URL 引用判定：非 data: 前缀的字符串 = 指向云端对象的引用（不是真实字节） */
export function isUrlRef(dataUrl: string | Blob | undefined): boolean {
  return typeof dataUrl === 'string' && !dataUrl.startsWith('data:')
}

export interface CompositeInternals {
  local?: StorageBackend
  cloud?: CloudBackend | null
}

export class CompositeBackend implements StorageBackend {
  readonly kind: 'local' | 'supabase' | 's3'
  private local: StorageBackend = new IndexedDBBackend()
  private cloud: CloudBackend | null
  /** 每个 appleId 在飞的上传 Promise：清空/删除前先等它完成，避免「删除后上传又复活对象」 */
  private pendingCloud = new Map<number, Promise<void>>()
  /** 云端标记为已删除的门店（appleId → 删除时间戳）：由 cloud.loadAll 填充，对账据此清理残留/跳过补传 */
  readonly tombstones = new Map<number, number>()

  /**
   * cloud 为 null 时退化为纯本地；否则本地 + 云端双写。
   * onSyncError：云端后台同步失败时回调（上传本地成功但云端没传上时，用户需要知道）。
   * internals：仅供测试注入假本地/假云端；业务调用不传
   */
  constructor(
    cloud: SupabaseConfig | null,
    private onSyncError?: (appleId: number, e: unknown) => void,
    internals?: CompositeInternals,
  ) {
    // 工厂级防御：即使调用方跳过 validateStorageConfig，配置不合法也在此拒绝
    this.cloud = cloud ? new SupabaseBackend(cloud) : null
    if (internals?.cloud !== undefined) this.cloud = internals.cloud
    if (internals?.local) this.local = internals.local
    this.kind = this.cloud ? this.cloud.kind : 'local'
  }

  /** 记录在飞上传；同门店操作链式排队（上传→删除按序执行） */
  private trackPending(appleId: number, p: Promise<void>): void {
    const prev = this.pendingCloud.get(appleId)
    const next = (prev ?? Promise.resolve()).then(() => p).catch(() => {})
    this.pendingCloud.set(appleId, next)
    next.finally(() => {
      if (this.pendingCloud.get(appleId) === next) this.pendingCloud.delete(appleId)
    })
  }

  /** 等待在飞上传完成；appleId 为空则等全部 */
  private async waitPending(appleId?: number): Promise<void> {
    if (appleId != null) {
      const p = this.pendingCloud.get(appleId)
      if (p) await p
      return
    }
    const all = [...this.pendingCloud.values()]
    if (all.length) await Promise.all(all)
  }

  async loadAll(slotKeys: string[] = ['contract']): Promise<Map<number, StoreUploadState>> {
    const localMap = await this.local.loadAll(slotKeys)
    if (!this.cloud) return localMap
    // 云端失败不阻断本地恢复（真机相机返回刷新后本地数据优先可用），错误留日志
    let cloudMap: Map<number, StoreUploadState>
    try {
      cloudMap = await this.cloud.loadAll(slotKeys)
    } catch (e) {
      reportEvent(
        'storage/reconcile-failed',
        '[contract-storage] 云端对账失败，仅恢复本地:',
        { error: String(e) },
        'warn',
      )
      return localMap
    }
    // 同步云端墓碑集合（appleId → 删除时间戳），决定对账时哪些门店「已删除」
    this.tombstones.clear()
    for (const [id, tb] of this.cloud.tombstones) this.tombstones.set(id, tb.ts)
    // 本地为真实图片（Blob 或 base64）时保持本地为准：云端 URL 只是引用，对象删除即死链。
    for (const [id, state] of cloudMap) {
      const localState = localMap.get(id)
      const localHasBytes = !!localState?.slots && Object.values(localState.slots).some((f) => !isUrlRef(f.dataUrl))
      if (localHasBytes) continue
      localMap.set(id, state)
      // 云端数据回写本地缓存（保留云端 URL 引用；下次打开仍可读到）
      this.local.saveRecord(id, state).catch(() => {})
    }
    // 清理本地死链：本地存的是云端 URL 引用而云端已无该对象 → 引用失效，删掉让用户重新上传。
    for (const [id, state] of localMap) {
      const hasRef = state.slots && Object.values(state.slots).some((f) => isUrlRef(f.dataUrl))
      if (hasRef && !cloudMap.has(id)) {
        this.local.saveRecord(id, { slots: {}, ts: state.ts }).catch(() => {})
        localMap.delete(id)
        reportWarn('[contract-storage] 清理失效的云端引用:', id)
      }
    }
    // 清理云端已删除门店的本地残留字节：本地记录时间晚于墓碑 = 删除之后重拍的新照片，保留。
    for (const [id, tbTs] of this.tombstones) {
      if (!localMap.has(id)) continue
      const localTs = localMap.get(id)?.ts ?? 0
      if (localTs > tbTs) continue
      this.local.saveRecord(id, { slots: {}, ts: Date.now() }).catch(() => {})
      localMap.delete(id)
      reportWarn('[contract-storage] 清理已删除门店的本地残留:', id)
    }
    // 对账补传：本地有真实字节而云端既没有对象也没有「有效的」墓碑 → 后台补传不阻塞。
    for (const [id, state] of localMap) {
      const hasBytes = !!state.slots && Object.values(state.slots).some((f) => !isUrlRef(f.dataUrl))
      if (!hasBytes) continue // URL 引用不可补传（源对象已删则无处取）
      if (!cloudMap.has(id)) {
        const tbTs = this.tombstones.get(id)
        if (tbTs !== undefined && (state.ts ?? 0) <= tbTs) continue
        this.cloud.saveRecord(id, state).catch((e) => {
          reportWarn('[contract-storage] 对账补传失败:', e)
          this.onSyncError?.(id, e)
        })
      }
    }
    return localMap
  }

  async saveRecord(appleId: number, state: StoreUploadState): Promise<void> {
    // 本地先落盘（await，快速），页面刷新/进程被杀前数据已保住
    await this.local.saveRecord(appleId, state)
    if (!this.cloud) return
    const hasAny = !!state.slots && Object.keys(state.slots).length > 0
    // 删除场景：先等该门店在飞的上传完成（对象已存在），再删云端，避免「删了又复活」。
    // 删除失败必须向上抛（不吞）：否则本地已置空、云端还在，下次加载云端覆盖回来 = 删掉又复活。
    if (!hasAny) {
      await this.waitPending(appleId)
      const p = this.cloud.saveRecord(appleId, state).catch((e) => {
        reportWarn('[contract-storage] 云端删除失败:', e)
        throw e
      })
      this.trackPending(appleId, p)
      await p // 删除需确保完成：云端对象已删才返回
      return
    }
    // 上传场景：云端后台同步（不阻塞 UI）；同步失败不能静默 → onSyncError
    const p = this.cloud.saveRecord(appleId, state).catch((e) => {
      reportWarn('[contract-storage] 云端同步失败:', e)
      this.onSyncError?.(appleId, e)
    })
    this.trackPending(appleId, p)
  }

  async clearAll(): Promise<void> {
    // 先等所有在飞上传完成（对象都已落云端），再清空，避免清完又被上传复活
    await this.waitPending()
    await this.local.clearAll()
    this.tombstones.clear()
    if (this.cloud) await this.cloud.clearAll()
  }
}
