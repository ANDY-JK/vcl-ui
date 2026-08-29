// M9 契约固化测试：contract-storage 依赖 StoreItem 包装格式 + 墓碑/对账逻辑
// ⛔ 本测试锁定的是「契约形状」：dbPut 的 value 必须含 appleId 冗余、dbGetAll 返回解包后 value。
// 若 indexedDB.ts 的 StoreItem 包装格式变更，或 contract-storage 的 LocalRecord 形状变更，此处立即红。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  CompositeBackend, sanitizeObjectKeyPart,
  type StorageBackend, type StoreUploadState,
} from '@/components/storage/contract-storage'

// 本测试故意触发云端故障/降级路径，预期 console.warn/error 输出——静默避免污染测试日志
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ===== 假后端（注入 CompositeBackend，测对账逻辑，不碰真实 IndexedDB） =====

/** 内存本地后端：记录原始 value 形状，供断言 StoreItem 解包契约 */
class FakeLocalBackend implements StorageBackend {
  readonly kind = 'local' as const
  private rows = new Map<number, StoreUploadState>()

  async loadAll() {
    // 手动深拷贝（structuredClone 在 happy-dom 下把 Blob 降级为普通对象，不用它）：
    // 模拟真实 IndexedDB「读回」语义——调用方修改返回的 Map 不回流底层
    const copy = new Map<number, StoreUploadState>()
    for (const [id, state] of this.rows) {
      copy.set(id, { contract: state.contract ? { ...state.contract } : undefined, ts: state.ts })
    }
    return copy
  }
  async saveRecord(appleId: number, state: StoreUploadState) {
    this.rows.set(appleId, { contract: state.contract ? { ...state.contract } : undefined, ts: state.ts })
  }
  async clearAll() { this.rows.clear() }
  get size() { return this.rows.size }
  has(id: number) { return this.rows.has(id) }
  get(id: number) { return this.rows.get(id) }
}

/** 假云端后端：记录墓碑与图片对象，模拟 SupabaseBackend 行为 */
class FakeCloudBackend {
  readonly kind = 'supabase' as const
  /** appleId → 墓碑对象（name+ts），模拟 SupabaseBackend.tombstones */
  tombstones = new Map<number, { name: string; ts: number }>()
  private objects = new Map<number, StoreUploadState>()
  failNext = false

  async loadAll() {
    if (this.failNext) throw new Error('cloud down')
    const map = new Map<number, StoreUploadState>()
    for (const [id, state] of this.objects) map.set(id, state)
    return map
  }
  async saveRecord(appleId: number, state: StoreUploadState) {
    if (this.failNext) throw new Error('cloud down')
    if (state.contract) this.objects.set(appleId, state)
    else this.objects.delete(appleId)
  }
  async clearAll() { this.objects.clear() }
  get size() { return this.objects.size }
  has(id: number) { return this.objects.has(id) }
}

/** 构造 CompositeBackend 并注入假后端 */
function makeBackend(local?: FakeLocalBackend, cloud?: FakeCloudBackend | null) {
  const backend = new CompositeBackend(null, undefined, {
    local: local ?? new FakeLocalBackend(),
    cloud: cloud ?? new FakeCloudBackend(),
  })
  return backend
}

const blob = new Blob(['fake-image'], { type: 'image/png' })
const urlState: StoreUploadState = { contract: { name: 'a.png', dataUrl: 'https://cdn.example.com/a.png', size: 10, type: 'image/png' }, ts: 100 }
const blobState: StoreUploadState = { contract: { name: 'a.png', dataUrl: blob, size: 10, type: 'image/png' }, ts: 100 }

describe('M9 contract-storage 契约锁定', () => {
  beforeEach(() => {})

  // ---------- sanitizeObjectKeyPart（Supabase 对象键 ASCII 契约） ----------
  describe('sanitizeObjectKeyPart（对象键 ASCII 契约）', () => {
    it('中文文件名 → ASCII，扩展名保留', () => {
      expect(sanitizeObjectKeyPart('拍照-001.jpg')).toBe('001.jpg')
    })
    it('含 URL 敏感字符 → 下划线', () => {
      expect(sanitizeObjectKeyPart('a/b:c.jpg')).toBe('a_b_c.jpg')
    })
    it('纯中文无扩展名 → file 回退', () => {
      expect(sanitizeObjectKeyPart('图片')).toBe('file')
    })
    it('超长主体截断到 60 字符', () => {
      const long = 'x'.repeat(80) + '.png'
      expect(sanitizeObjectKeyPart(long).length).toBeLessThanOrEqual(64)
    })
    it('非 ASCII 扩展名丢弃', () => {
      expect(sanitizeObjectKeyPart('photo.照片')).toBe('photo')
    })
  })

  // ---------- CompositeBackend 对账行为 ----------
  describe('CompositeBackend 对账（契约行为锁定）', () => {
    it('无云时纯本地：saveRecord/loadAll 直通', async () => {
      const local = new FakeLocalBackend()
      const backend = makeBackend(local, null)
      await backend.saveRecord(1, blobState)
      const map = await backend.loadAll()
      expect(map.get(1)?.contract?.name).toBe('a.png')
    })

    it('本地有真实字节时以本地为准，云端覆盖仅当本地缺记录', async () => {
      const local = new FakeLocalBackend()
      const cloud = new FakeCloudBackend()
      const backend = makeBackend(local, cloud)
      // 本地 Blob 真实字节 + 云端 URL 引用（对象已删）
      await local.saveRecord(1, blobState)
      await cloud.saveRecord(1, urlState)
      const map = await backend.loadAll()
      // 本地为准：返回 Blob 而非云端 URL
      expect(map.get(1)?.contract?.dataUrl).toBeInstanceOf(Blob)
    })

    it('本地缺记录时云端数据回填本地（含 URL 引用）', async () => {
      const local = new FakeLocalBackend()
      const cloud = new FakeCloudBackend()
      const backend = makeBackend(local, cloud)
      await cloud.saveRecord(2, urlState)
      const map = await backend.loadAll()
      expect(map.get(2)?.contract?.dataUrl).toBe('https://cdn.example.com/a.png')
      // 云端数据回写本地缓存
      expect(local.has(2)).toBe(true)
    })

    it('本地存 URL 引用但云端已无对象 → 清理死链', async () => {
      const local = new FakeLocalBackend()
      const cloud = new FakeCloudBackend()
      const backend = makeBackend(local, cloud)
      await local.saveRecord(3, urlState) // 本地是 URL 引用
      // 云端空 → 引用失效
      const map = await backend.loadAll()
      expect(map.has(3)).toBe(false)
      // 本地写回「contract 置空」记录（墓碑语义），引用不再残留
      expect(local.get(3)?.contract).toBeUndefined()
    })

    it('墓碑门店且本地数据不新 → 不补传（防删除复活）', async () => {
      const local = new FakeLocalBackend()
      const cloud = new FakeCloudBackend()
      const backend = makeBackend(local, cloud)
      await local.saveRecord(4, blobState)
      cloud.tombstones.set(4, { name: '4-__deleted__-500', ts: 500 }) // 删除时间晚于本地 ts
      const map = await backend.loadAll()
      expect(map.has(4)).toBe(false) // 本地残留被清理
      expect(cloud.has(4)).toBe(false) // 未补传回云端
    })

    it('墓碑门店但本地数据更新（删除后重拍）→ 保留并补传', async () => {
      const local = new FakeLocalBackend()
      const cloud = new FakeCloudBackend()
      const backend = makeBackend(local, cloud)
      await local.saveRecord(5, { contract: { name: 'a.png', dataUrl: blob, size: 10, type: 'image/png' }, ts: 900 })
      cloud.tombstones.set(5, { name: '5-__deleted__-500', ts: 500 }) // 删除时间早于本地 ts
      const map = await backend.loadAll()
      expect(map.has(5)).toBe(true) // 保留
      // 对账补传已触发（本地有字节、云端缺、非墓碑新数据）
      await new Promise((r) => setTimeout(r, 10))
      expect(cloud.has(5)).toBe(true)
    })

    it('删除场景：先等本地落盘 + 云端删除，删除失败抛错（不静默）', async () => {
      const local = new FakeLocalBackend()
      const cloud = new FakeCloudBackend()
      const backend = makeBackend(local, cloud)
      await backend.saveRecord(6, blobState)
      cloud.failNext = true
      await expect(backend.saveRecord(6, { contract: undefined, ts: 200 })).rejects.toThrow()
    })

    it('云 loadAll 失败时降级为纯本地恢复（不阻断）', async () => {
      const local = new FakeLocalBackend()
      const cloud = new FakeCloudBackend()
      const backend = makeBackend(local, cloud)
      await local.saveRecord(7, blobState)
      cloud.failNext = true
      const map = await backend.loadAll()
      expect(map.get(7)?.contract?.dataUrl).toBeInstanceOf(Blob)
    })

    it('clearAll：等待在飞上传后清空本地 + 云端', async () => {
      const local = new FakeLocalBackend()
      const cloud = new FakeCloudBackend()
      const backend = makeBackend(local, cloud)
      await backend.saveRecord(8, blobState)
      await backend.clearAll()
      expect(local.size).toBe(0)
      expect(cloud.size).toBe(0)
    })

    it('上传同步失败触发 onSyncError 回调（本地成功但云端没传上，用户必须知情）', async () => {
      const local = new FakeLocalBackend()
      const cloud = new FakeCloudBackend()
      const onSyncError = vi.fn()
      const backend = new CompositeBackend(null, onSyncError, { local, cloud })
      cloud.failNext = true
      await backend.saveRecord(9, blobState) // 上传为后台同步，不 reject
      await vi.waitFor(() => expect(onSyncError).toHaveBeenCalledTimes(1))
      expect(onSyncError.mock.calls[0][0]).toBe(9)
      expect(local.get(9)?.contract?.name).toBe('a.png') // 本地已落盘
    })

    it('同门店 上传→删除 排队：删除等在飞上传完成后再执行（防删后复活）', async () => {
      const local = new FakeLocalBackend()
      const cloud = new FakeCloudBackend()
      const backend = makeBackend(local, cloud)
      // 慢上传：记录云端 saveRecord 调用顺序
      const calls: string[] = []
      let releaseUpload: (() => void) | null = null
      const gate = new Promise<void>((r) => { releaseUpload = r })
      vi.spyOn(cloud, 'saveRecord').mockImplementation(async (id, state) => {
        if (state.contract) {
          calls.push('upload')
          await gate // 上传卡在途中
          return Object.getPrototypeOf(cloud).saveRecord.call(cloud, id, state)
        }
        calls.push('delete')
        await Object.getPrototypeOf(cloud).saveRecord.call(cloud, id, state)
      })
      await backend.saveRecord(10, blobState) // 触发后台上传（被 gate 卡住）
      const del = backend.saveRecord(10, { contract: undefined, ts: 300 }) // 删除应等上传完成
      await Promise.resolve()
      releaseUpload!()
      await del
      expect(calls).toEqual(['upload', 'delete']) // 顺序锁定：先传完再删
      expect(cloud.has(10)).toBe(false)
    })
  })
})
