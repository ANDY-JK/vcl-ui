// S3Backend 真实云端 CRUD（缤纷云 Bitiful 实桶）——按需运行，避免 CI/离线环境失败
// 运行：S3_REAL_TEST=1 npx vitest run tests/unit/s3-real.spec.ts（配置读 .env.local）
// @vitest-environment node（真实网络走 node 原生 fetch，不经 happy-dom 拦截）
import { describe, it, expect, beforeAll } from 'vitest'
import { loadEnv } from 'vite'
import { S3Backend } from '@/components/storage/contract-storage'
import type { StoreUploadState } from '@/components/storage/contract-storage'

const env = loadEnv('test', process.cwd(), '')
const run = process.env.S3_REAL_TEST === '1' && Boolean(env.VITE_S3_ENDPOINT)

describe.skipIf(!run)('S3Backend · 真实云端 CRUD（缤纷云实桶）', () => {
  const backend = new S3Backend({
    endpoint: env.VITE_S3_ENDPOINT,
    region: env.VITE_S3_REGION || 'us-east-1',
    bucket: env.VITE_S3_BUCKET,
    accessKeyId: env.VITE_S3_ACCESS_KEY_ID,
    secretAccessKey: env.VITE_S3_SECRET_ACCESS_KEY,
  })
  // 测试专用 appleId（与真实数据隔离；结束清空）
  const TEST_ID = 999_999_901
  const pngB64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  const stateWith = (slotKey: string, name: string): StoreUploadState => ({
    slots: { [slotKey]: { name, dataUrl: `data:image/png;base64,${pngB64}`, size: 95, type: 'image/png' } },
    ts: Date.now(),
  })

  beforeAll(async () => {
    // 清测试残留（含墓碑），保证幂等；真实网络放宽钩子超时
  }, 30_000)

  it('saveRecord 上传 → loadAll 读回（对象名/大小/预签名可访问）', { timeout: 30_000 }, async () => {
    await backend.saveRecord(TEST_ID, stateWith('contract', '测试合同.png'))
    const map = await backend.loadAll()
    const state = map.get(TEST_ID)
    expect(state).toBeTruthy()
    const file = state!.slots!['contract'] ?? state!.contract
    expect(file).toBeTruthy()
    expect(file!.name).toContain('png')
    expect(file!.size).toBe(70) // 1×1 PNG base64 解码后 70 字节
    // 预签名 URL 真实可访问且返回图片字节
    const resp = await fetch(String(file!.dataUrl))
    expect(resp.ok).toBe(true)
    expect(resp.headers.get('content-type')).toContain('image/png')
  })

  it('多照片位 saveRecord → loadAll 合并读取', { timeout: 30_000 }, async () => {
    await backend.saveRecord(TEST_ID, stateWith('frontPhoto', 'front.png'))
    const map = await backend.loadAll(['contract', 'frontPhoto'])
    const file = map.get(TEST_ID)?.slots?.['frontPhoto']
    expect(file).toBeTruthy()
  })

  it('saveRecord 空 slots = 删除：对象清空 + 墓碑广播', { timeout: 30_000 }, async () => {
    await backend.saveRecord(TEST_ID, { slots: {}, ts: Date.now() })
    const map = await backend.loadAll()
    expect(map.has(TEST_ID)).toBe(false)
    expect(backend.tombstones.has(TEST_ID)).toBe(true)
  })

  it('clearAll 清空测试残留', { timeout: 60_000 }, async () => {
    await backend.saveRecord(TEST_ID, stateWith('contract', 'cleanup.png'))
    await backend.clearAll()
    const map = await backend.loadAll()
    expect(map.has(TEST_ID)).toBe(false)
  })
})
