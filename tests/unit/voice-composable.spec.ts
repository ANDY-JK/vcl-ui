// 修复锁定 #21：useVoice
//   1. Chrome 首次 getVoices() 常为空（异步加载），旧实现同步把 voicesLoaded 置 true，
//      onvoiceschanged 是死代码 → 首次播报找不到中文 voice，退化成系统默认音（语言错读）。
//      现在 voices 为空时挂 voiceschanged，就绪后补发一次。
//   2. 页面离开（pagehide）要 cancel，否则 SPA 跳转后上一段播报继续串读新页面。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

interface FakeVoice {
  lang: string
  name: string
}

class FakeUtterance {
  text: string
  rate = 1
  pitch = 1
  volume = 1
  lang = ''
  voice: FakeVoice | null = null
  constructor(text: string) {
    this.text = text
  }
}

const zhVoice: FakeVoice = { lang: 'zh-CN', name: 'Chinese' }
const enVoice: FakeVoice = { lang: 'en-US', name: 'English' }

function makeSynth(initial: FakeVoice[] = []) {
  let voices = initial
  const listeners = new Map<string, Set<() => void>>()
  return {
    getVoices: () => voices,
    speak: vi.fn(),
    cancel: vi.fn(),
    addEventListener(type: string, cb: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(cb)
    },
    removeEventListener(type: string, cb: () => void) {
      listeners.get(type)?.delete(cb)
    },
    setVoices(next: FakeVoice[]) {
      voices = next
    },
    fire(type: string) {
      listeners.get(type)?.forEach((cb) => cb())
    },
  }
}

let synth: ReturnType<typeof makeSynth>

async function loadUseVoice() {
  vi.resetModules()
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  vi.stubGlobal('speechSynthesis', synth)
  // 代码读 window.speechSynthesis，happy-dom 下确保两者指向同一对象
  ;(window as unknown as { speechSynthesis: unknown }).speechSynthesis = synth
  return import('@/components/feedback/composables/useVoice')
}

beforeEach(() => {
  synth = makeSynth([])
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useVoice · 语音列表异步就绪', () => {
  it('voices 为空时先挂起，voiceschanged 后补发并选中中文 voice', async () => {
    const { speak } = await loadUseVoice()

    speak('网络异常')
    expect(synth.speak).not.toHaveBeenCalled()

    synth.setVoices([enVoice, zhVoice])
    synth.fire('voiceschanged')

    expect(synth.speak).toHaveBeenCalledTimes(1)
    const u = synth.speak.mock.calls[0][0] as FakeUtterance
    expect(u.text).toBe('网络异常')
    expect(u.voice).toBe(zhVoice)
    expect(u.lang).toBe('zh-CN')
  })

  it('voices 就绪时立即播报，无需等 voiceschanged', async () => {
    synth = makeSynth([zhVoice])
    const { speak } = await loadUseVoice()

    speak('就绪播报')
    expect(synth.speak).toHaveBeenCalledTimes(1)
    const u = synth.speak.mock.calls[0][0] as FakeUtterance
    expect(u.voice).toBe(zhVoice)
  })

  it('voiceschanged 触发时语音仍为空：不丢挂起请求，并重新挂监听等下一次', async () => {
    const addSpy = vi.spyOn(synth, 'addEventListener')
    const { speak } = await loadUseVoice()

    speak('第一句')
    expect(synth.speak).not.toHaveBeenCalled()
    expect(addSpy).toHaveBeenCalledTimes(1)

    // Chrome 可能分多次推送语音列表：第一次 voiceschanged 时仍为空，不能就此丢掉请求
    synth.fire('voiceschanged')
    expect(synth.speak).not.toHaveBeenCalled()
    expect(addSpy).toHaveBeenCalledTimes(2)

    // 语音真正就绪后的下一次 voiceschanged 补发挂起的那句，并选中中文 voice
    synth.setVoices([enVoice, zhVoice])
    synth.fire('voiceschanged')

    expect(synth.speak).toHaveBeenCalledTimes(1)
    const u = synth.speak.mock.calls[0][0] as FakeUtterance
    expect(u.text).toBe('第一句')
    expect(u.voice).toBe(zhVoice)
  })
})

describe('useVoice · 页面离开清理', () => {
  it('播报过后 pagehide 触发 cancel，避免离开页面后继续播报', async () => {
    const { speak } = await loadUseVoice()
    // 守卫改为首次播报时装（库不再在 import 期挂 window 监听），故先说一句再有 pagehide ——
    // 这也更贴近该用例原本要防的场景：没有播报过就没有"串读"可防。
    speak('离开前的一句')
    window.dispatchEvent(new Event('pagehide'))
    expect(synth.cancel).toHaveBeenCalled()
  })
})
