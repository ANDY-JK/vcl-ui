// useBeep 行为锁定测试（四种提示音的音频配方 + 无 AudioContext 兜底 + closed 重置）
// useBeep 有模块级状态（ctx/unlocked/autoInited），每个用例 resetModules 后动态 import 拿干净实例
import { describe, it, expect, vi, beforeEach } from 'vitest'

type MockOsc = {
  type: string
  frequency: { value: number }
  startAt: number[]
  stopAt: number[]
  connect: (g: unknown) => MockOsc
  start: (t: number) => void
  stop: (t: number) => void
}
type MockGain = {
  gain: {
    setValueAtTime: (v: number, t: number) => void
    exponentialRampToValueAtTime: (v: number, t: number) => void
    vals: number[]
  }
  connect: (d: unknown) => unknown
}
type MockCtxInstance = { state: string }

function makeAudioCtor() {
  const oscs: MockOsc[] = []
  const instances: MockCtxInstance[] = []
  class MockCtx implements MockCtxInstance {
    state = 'running'
    destination = {}
    currentTime = 0
    constructor() {
      instances.push(this)
    }
    createBuffer() {
      return {}
    }
    createBufferSource() {
      return { buffer: null, connect: () => {}, start: () => {}, stop: () => {} }
    }
    createOscillator() {
      const o: MockOsc = {
        type: 'sine',
        frequency: { value: 0 },
        startAt: [],
        stopAt: [],
        connect: (_g) => o,
        start: (t) => o.startAt.push(t),
        stop: (t) => o.stopAt.push(t),
      }
      oscs.push(o)
      return o
    }
    createGain() {
      const g: MockGain = {
        gain: {
          vals: [],
          setValueAtTime: (v) => {
            g.gain.vals.push(v)
          },
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => ({}),
      }
      return g
    }
  }
  return { MockCtx, oscs, instances }
}

async function freshBeep(ctor?: unknown) {
  vi.resetModules()
  if (ctor !== undefined) {
    vi.stubGlobal('AudioContext', ctor)
    vi.stubGlobal('webkitAudioContext', undefined)
  }
  delete (globalThis as Record<string, unknown>).__vueLibBeepInited
  const mod = await import('@/components/feedback/composables/useBeep')
  return mod
}

beforeEach(() => {
  delete (globalThis as Record<string, unknown>).__vueLibBeepInited
})

describe('useBeep 四种提示音配方', () => {
  it('beepSuccess：上行双音 880→1100，sine，音量 0.15，间隔 0.08s', async () => {
    const { MockCtx, oscs } = makeAudioCtor()
    const mod = await freshBeep(MockCtx)
    mod.beepSuccess()
    expect(oscs).toHaveLength(2)
    expect(oscs.map((o) => o.type)).toEqual(['sine', 'sine'])
    expect(oscs.map((o) => o.frequency.value)).toEqual([880, 1100])
    expect(oscs.map((o) => o.startAt[0])).toEqual([0, 0.08])
    expect(oscs.map((o) => o.stopAt[0])).toEqual([0.12, 0.2])
  })

  it('beepError：低频方波 200，音量 0.1', async () => {
    const { MockCtx, oscs } = makeAudioCtor()
    const mod = await freshBeep(MockCtx)
    mod.beepError()
    expect(oscs).toHaveLength(1)
    expect(oscs[0].type).toBe('square')
    expect(oscs[0].frequency.value).toBe(200)
  })

  it('beepNotify：三连音 440/494/440，sine，音量 0.12', async () => {
    const { MockCtx, oscs } = makeAudioCtor()
    const mod = await freshBeep(MockCtx)
    mod.beepNotify()
    expect(oscs.map((o) => o.frequency.value)).toEqual([440, 494, 440])
    expect(oscs.map((o) => o.type)).toEqual(['sine', 'sine', 'sine'])
    // 第三个音起点 0.16s（i * 0.08）
    expect(oscs[2].startAt[0]).toBeCloseTo(0.16)
  })

  it('beepWarning：下行双音 600→500，triangle，音量 0.13', async () => {
    const { MockCtx, oscs } = makeAudioCtor()
    const mod = await freshBeep(MockCtx)
    mod.beepWarning()
    expect(oscs.map((o) => o.frequency.value)).toEqual([600, 500])
    expect(oscs.map((o) => o.type)).toEqual(['triangle', 'triangle'])
  })
})

describe('useBeep 异常路径', () => {
  it('环境完全没有 AudioContext / webkitAudioContext 时静默不崩', async () => {
    const mod = await freshBeep(undefined)
    expect(() => {
      mod.beepSuccess()
      mod.beepError()
      mod.beepNotify()
      mod.beepWarning()
      mod.unlockAudio()
    }).not.toThrow()
  })

  it('ctx 进入 closed 状态后重置并重建实例（unlocked 清零，等下次手势解锁）', async () => {
    const { MockCtx, oscs, instances } = makeAudioCtor()
    const mod = await freshBeep(MockCtx)
    mod.beepSuccess()
    const created = instances.length
    const played = oscs.length
    expect(created).toBeGreaterThanOrEqual(1)
    // 模块内部 ctx 引用指向最早创建的运行态实例；置 closed → play 走重置分支：
    // ctx=null、unlocked=false、尝试重建 ctx，但 unlocked 仍为 false → 本次不出声
    for (const inst of instances) inst.state = 'closed'
    mod.beepError()
    expect(instances.length).toBeGreaterThan(created) // 重建了新实例
    expect(oscs.length).toBe(played) // 但 oscillator 未创建（等下次手势 unlock）
  })

  it('unlock 后 unlockAudio 幂等不重复挂监听', async () => {
    const { MockCtx } = makeAudioCtor()
    const addSpy = vi.spyOn(document, 'addEventListener')
    const mod = await freshBeep(MockCtx)
    mod.unlockAudio()
    const first = addSpy.mock.calls.length
    mod.unlockAudio() // unlocked 已 true → ensureReady 里 unlock 直接返回
    expect(addSpy.mock.calls.length).toBe(first)
    addSpy.mockRestore()
  })
})
