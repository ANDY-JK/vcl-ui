// 分享码编解码 + 存储模式/云端配置持久化 + 活动 store 单例 — 行为锁定
// 背景：FormDesigner 增强轮新增 designer/share.ts 与 store 模式层（本地/云端切换），挂载前纯函数护栏
import { describe, it, expect, beforeEach } from 'vitest'
import { encodeShareCode, decodeShareCode, SHARE_CODE_PREFIX } from '@/components/form-builder/designer/share'
import {
  createLocalFormStore,
  createCloudFormStore,
  getActiveFormStore,
  setActiveFormStore,
  loadStoreMode,
  saveStoreMode,
  loadCloudConfig,
  saveCloudConfig,
} from '@/components/form-builder/designer/store'
import type { FormDesign } from '@/components/form-builder/designer/types'
import type { SupabaseConfig } from '@/components/storage/supabase-transport'

const design: FormDesign = {
  schemaVersion: 3,
  meta: { title: '客户满意度调查 ✨', description: '含中文与 emoji 的标题' },
  nodes: [
    { id: 'n1', type: 'text', label: '姓名', key: 'name' },
    { id: 'n2', type: 'select', label: '评分', key: 'score', options: ['满意', '一般'] },
  ],
}

describe('分享码编解码（share.ts）', () => {
  it('encode → decode 往返还原 meta 与 nodes（中文/emoji 安全）', () => {
    const code = encodeShareCode(design)
    expect(code.startsWith(SHARE_CODE_PREFIX)).toBe(true)
    // base64url 字符集：不含 + / = 与换行，可安全放入 URL/聊天窗口
    expect(code).toMatch(/^FD1\.[A-Za-z0-9_-]+$/)
    const back = decodeShareCode(code)
    expect(back).not.toBeNull()
    expect(back!.meta).toEqual(design.meta)
    expect(back!.nodes).toEqual(design.nodes)
  })

  it('v2 旧格式（fields）导入端兼容还原为 nodes', () => {
    const code = encodeShareCode({
      schemaVersion: 2,
      meta: { title: '旧' },
      fields: design.nodes,
    } as unknown as FormDesign)
    const back = decodeShareCode(code)
    expect(back!.nodes).toEqual(design.nodes)
  })

  it('非分享码前缀返回 null（走原 JSON 导入路径）', () => {
    expect(decodeShareCode('{"meta":{},"nodes":[]}')).toBeNull()
    expect(decodeShareCode('')).toBeNull()
  })

  it('损坏内容（坏 base64 / nodes 非数组）返回 null 不抛异常', () => {
    expect(decodeShareCode('FD1.!!!not-base64!!!')).toBeNull()
    expect(decodeShareCode('FD1.' + btoa('{"meta":{}}'))).toBeNull()
  })
})

describe('存储模式与云端配置持久化', () => {
  beforeEach(() => localStorage.clear())

  it('模式默认 local；保存后读回一致；非法值回退 local', () => {
    expect(loadStoreMode()).toBe('local')
    saveStoreMode('cloud')
    expect(loadStoreMode()).toBe('cloud')
    localStorage.setItem('fd_store_mode_v1', 'hacked')
    expect(loadStoreMode()).toBe('local')
  })

  it('云端配置保存/读取/清除；不完整配置视为未配置', () => {
    expect(loadCloudConfig()).toBeNull()
    saveCloudConfig({ url: 'https://x.supabase.co', anonKey: 'k', bucket: 'b' })
    expect(loadCloudConfig()).toEqual({ url: 'https://x.supabase.co', anonKey: 'k', bucket: 'b' })
    // 缺字段 → null
    localStorage.setItem('fd_cloud_cfg_v1', JSON.stringify({ url: 'https://x' }))
    expect(loadCloudConfig()).toBeNull()
    saveCloudConfig(null)
    expect(loadCloudConfig()).toBeNull()
  })
})

describe('活动 FormStore 单例', () => {
  beforeEach(() => localStorage.clear())

  it('默认返回本地实现（异步契约：listForms 返回 Promise）', async () => {
    setActiveFormStore(createLocalFormStore())
    const store = getActiveFormStore()
    const list = await store.listForms()
    expect(Array.isArray(list)).toBe(true)
  })

  it('setActiveFormStore 覆盖后 getActiveFormStore 跟随（宿主注入场景）', async () => {
    const custom = createLocalFormStore()
    setActiveFormStore(custom)
    expect(getActiveFormStore()).toBe(custom)
  })

  it('云端工厂：配置非法时抛错（调用方决定降级）', () => {
    const bad = { url: '', anonKey: '', bucket: '' } as unknown as SupabaseConfig
    expect(() => createCloudFormStore(bad)).toThrow()
  })
})
