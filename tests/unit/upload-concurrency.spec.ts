// 上传并发闸门护栏：一次投喂大量文件时，同时在飞的压缩+上传必须被限住。
// 背景：循环里过去直接 compressImage(f).then(upload)，选整目录几百个文件就是几百路并发
//（几百次 canvas 解码 + 几百个定时器 + 同域 6 连接塞满后触发服务端限流）。
import { describe, it, expect } from 'vitest'
import { useUploadQueue } from '@/components/form/utils/useUploadQueue'
import type { UploadFile } from '@/components/form/Upload.vue'

function makeFiles(n: number): File[] {
  return Array.from({ length: n }, (_, i) => new File([`content-${i}`], `f${i}.png`, { type: 'image/png' }))
}

function setup(customRequest?: (f: File) => Promise<{ url: string }>) {
  const props = {
    modelValue: [] as UploadFile[],
    accept: '',
    multiple: true,
    maxSize: 10,
    variant: 'default' as const,
    compress: false,
    maxWidth: 1200,
    compressQuality: 0.8,
    customRequest,
  }
  // emit 是函数式调用（emit('change', ...)），不是回调对象
  const emit = (() => {}) as unknown as Parameters<typeof useUploadQueue>[0]['emit']
  return useUploadQueue({ props, emit })
}

/** 手动可控的上传：resolve 由测试决定，用来观察瞬时并发数 */
function deferredQueue(n = 8) {
  let inFlight = 0
  let peak = 0
  const resolvers: Array<() => void> = []
  const customRequest = () => {
    inFlight++
    peak = Math.max(peak, inFlight)
    return new Promise<{ url: string }>((resolve) => {
      resolvers.push(() => {
        inFlight--
        resolve({ url: 'blob:x' })
      })
    })
  }
  const q = setup(customRequest)
  q.processFiles(makeFiles(n))
  return { q, resolvers, peakOf: () => peak, inFlightOf: () => inFlight }
}

/** gatedUpload 里有 await acquireSlot() + await compressImage()，要多轮宏任务才能刷到起跑 */
async function flush(turns = 6) {
  for (let i = 0; i < turns; i++) await new Promise((r) => setTimeout(r, 0))
}

describe('useUploadQueue 并发闸门', () => {
  it('投喂 8 个文件：同时起飞的不超过 3 路', async () => {
    const { resolvers, peakOf, inFlightOf } = deferredQueue(8)
    await flush()
    expect(inFlightOf(), `首帧并发 ${inFlightOf()} 应等于闸门上限`).toBeLessThanOrEqual(3)
    expect(resolvers.length, '应恰好放行 3 个').toBe(3)

    // 逐个放行：每完成一个才补进一个，峰值不得突破上限
    for (let i = 0; i < 5; i++) {
      resolvers.shift()!()
      await flush(3)
    }
    expect(peakOf(), `峰值并发到了 ${peakOf()}`).toBeLessThanOrEqual(3)
    expect(peakOf(), '闸门不该把上传堵死（应确有并发）').toBeGreaterThan(1)
  })

  it('放行全部后队列收敛，不留下悬挂任务', async () => {
    const { q, resolvers } = deferredQueue(6)
    await flush()
    let guard = 0
    while (resolvers.length && guard++ < 50) {
      resolvers.shift()!()
      await flush(3)
    }
    expect(q.files.value.every((f) => f.status === 'done'), '全部应完成').toBe(true)
  })
})
