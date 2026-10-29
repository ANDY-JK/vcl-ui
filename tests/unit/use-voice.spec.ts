/**
 * `useVoice` · 语音播报全链路（第 171 轮）
 *
 * 覆盖率实测语句 67.8% / 分支 65.9%：`doWarm`、自动解锁、voices 异步补发、
 * `stopSpeak`、`detectLang` **全部没有被执行过**（happy-dom 无 speechSynthesis，
 * 现有用例只在"无 API 直接 no-op"一条路上跑）。
 *
 * 桩法说明：happy-dom 的 `window.localStorage` 是只读 getter（赋值会抛
 * "which has only a getter"），所以这里**用真实 localStorage**（happy-dom 自带内存实现，
 * 每个用例前 clear），只对 `speechSynthesis` / `SpeechSynthesisUtterance` 用
 * `Object.defineProperty` 打桩；模块级状态（preWarmed / autoInited / pendingSpeak）
 * 靠 `vi.resetModules()` + 动态 import 隔离。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Utterance = {
  text: string
  rate: number
  pitch: number
  volume: number
  lang?: string
  voice?: { lang: string }
}

function makeTts(opts: { voices?: { lang: string; name: string }[]; cancelThrows?: boolean } = {}) {
  const spoken: Utterance[] = []
  const listeners: Array<() => void> = []
  const api = {
    cancel: vi.fn(() => {
      if (opts.cancelThrows) throw new Error('cancel failed')
    }),
    speak: vi.fn((u: Utterance) => {
      spoken.push(u)
    }),
    getVoices: vi.fn(() => opts.voices ?? []),
    addEventListener: vi.fn((_e: string, fn: () => void) => {
      listeners.push(fn)
    }),
    removeEventListener: vi.fn(),
  }
  return {
    api,
    spoken,
    /** 手动触发 voiceschanged */
    voicesChanged: () => listeners.splice(0).forEach((fn) => fn()),
    pendingListeners: () => listeners.length,
  }
}

const KEY = 'vue-lib-voice-unlocked'

async function fresh(tts: ReturnType<typeof makeTts> | null, seed: Record<string, string> = {}) {
  vi.resetModules()
  const g = globalThis as unknown as Record<string, unknown>
  const w = window as unknown as Record<string, unknown>

  localStorage.clear()
  for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v)

  Object.defineProperty(g, 'speechSynthesis', { configurable: true, writable: true, value: tts?.api })
  Object.defineProperty(w, 'speechSynthesis', { configurable: true, writable: true, value: tts?.api })
  Object.defineProperty(g, 'SpeechSynthesisUtterance', {
    configurable: true,
    writable: true,
    value: class {
      text: string
      rate = 1
      pitch = 1
      volume = 1
      lang = ''
      voice: { lang: string } | undefined
      constructor(text: string) {
        this.text = text
      }
    },
  })

  const mod = await import('@/components/feedback/composables/useVoice')
  return {
    mod,
    cleanup() {
      delete g.speechSynthesis
      delete w.speechSynthesis
      delete g.SpeechSynthesisUtterance
      // 复位 window 级幂等标记，避免污染下一个用例的 autoInit
      delete w.__vueLibVoiceInited
      localStorage.clear()
    },
  }
}

let active: { cleanup: () => void } | null = null
beforeEach(() => {
  active = null
})
afterEach(() => {
  active?.cleanup()
  vi.restoreAllMocks()
})

describe('useVoice · speak 的降级与参数钳制', () => {
  it('无 speechSynthesis → 直接返回，不抛错', async () => {
    const { mod, cleanup } = await fresh(null)
    active = { cleanup }
    expect(() => mod.speak('你好')).not.toThrow()
  })

  it('voices 已就绪 → 立即播报，rate/pitch 被钳制到合法区间', async () => {
    const tts = makeTts({ voices: [{ lang: 'zh-CN', name: '中文' }] })
    const { mod, cleanup } = await fresh(tts)
    active = { cleanup }
    mod.speak('你好', 99, -5)
    expect(tts.spoken.length).toBe(1)
    expect(tts.spoken[0].rate, 'rate 上限 10').toBe(10)
    expect(tts.spoken[0].pitch, 'pitch 下限 0').toBe(0)
    expect(tts.spoken[0].voice).toMatchObject({ lang: 'zh-CN' })
  })

  it('voices 尚未就绪 → 记下请求挂起，不立即播报', async () => {
    const tts = makeTts({ voices: [] })
    const { mod, cleanup } = await fresh(tts)
    active = { cleanup }
    mod.speak('你好')
    expect(tts.spoken.length, '不应立即播（会退化成系统默认音，语言错读）').toBe(0)
    expect(tts.pendingListeners()).toBeGreaterThan(0)
  })

  it('**挂起期间再次 speak → 只保留最后一次**（避免排队串读）', async () => {
    const tts = makeTts({ voices: [] })
    const { mod, cleanup } = await fresh(tts)
    active = { cleanup }
    mod.speak('第一条')
    mod.speak('第二条')
    // 必须让语音列表先就绪：仍为空时实现会继续挂起（那是正确行为，见下一条用例）
    ;(tts.api.getVoices as ReturnType<typeof vi.fn>).mockReturnValue([{ lang: 'zh-CN', name: '中文' }])
    tts.voicesChanged()
    expect(
      tts.spoken.map((u) => u.text),
      '只补发最后一次',
    ).toEqual(['第二条'])
  })

  it('voiceschanged 触发但列表仍为空 → 保持挂起并重新挂监听', async () => {
    const tts = makeTts({ voices: [] })
    const { mod, cleanup } = await fresh(tts)
    active = { cleanup }
    mod.speak('你好')
    tts.voicesChanged()
    expect(tts.spoken.length).toBe(0)
    expect(tts.pendingListeners(), 'Chrome 可能分多次推送，必须继续等').toBeGreaterThan(0)
  })

  it('voiceschanged 就绪后 → 补发挂起请求', async () => {
    const tts = makeTts({ voices: [] })
    const { mod, cleanup } = await fresh(tts)
    active = { cleanup }
    mod.speak('你好')
    ;(tts.api.getVoices as ReturnType<typeof vi.fn>).mockReturnValue([{ lang: 'zh-CN', name: '中文' }])
    tts.voicesChanged()
    expect(tts.spoken.map((u) => u.text)).toEqual(['你好'])
  })

  it('选不到目标语言的 voice → 用语言代码兜底，不抛错', async () => {
    const tts = makeTts({ voices: [{ lang: 'en-US', name: 'English' }] })
    const { mod, cleanup } = await fresh(tts)
    active = { cleanup }
    expect(() => mod.speak('你好')).not.toThrow()
    expect(tts.spoken[0].lang).toBe('zh')
  })
})

describe('useVoice · 语言自动检测（detectLang 的顺序）', () => {
  async function detectedLang(text: string): Promise<string> {
    const tts = makeTts({ voices: [] })
    const { mod, cleanup } = await fresh(tts)
    active = { cleanup }
    mod.speak(text, 1, 1, 'auto')
    ;(tts.api.getVoices as ReturnType<typeof vi.fn>).mockReturnValue([{ lang: 'zh-CN', name: 'x' }])
    tts.voicesChanged()
    return tts.spoken[0]?.lang ?? ''
  }

  it('纯中文 → zh', async () => {
    expect(await detectedLang('你好世界')).toContain('zh')
  })

  it('纯假名 → ja', async () => {
    expect(await detectedLang('こんにちは')).toContain('ja')
  })

  it('**日语（漢字＋假名混排）必须判成 ja，不能因为含漢字被判成 zh**', async () => {
    // 「日本語です」含漢字「日本語」——漢字范围检查若排在假名之前，就会用中文音读日文
    expect(await detectedLang('日本語です')).toContain('ja')
  })

  it('纯谚文 → ko', async () => {
    expect(await detectedLang('안녕하세요')).toContain('ko')
  })

  it('拉丁字符 → en', async () => {
    expect(await detectedLang('Hello world')).toContain('en')
  })
})

describe('useVoice · stopSpeak 与 pagehide 守卫', () => {
  it('stopSpeak 丢弃挂起请求（voices 就绪后不再补发）', async () => {
    const tts = makeTts({ voices: [] })
    const { mod, cleanup } = await fresh(tts)
    active = { cleanup }
    mod.speak('你好')
    mod.stopSpeak()
    ;(tts.api.getVoices as ReturnType<typeof vi.fn>).mockReturnValue([{ lang: 'zh-CN', name: 'x' }])
    tts.voicesChanged()
    expect(tts.spoken.length, '离开页面后不应再响一声').toBe(0)
  })

  it('无 API 时 stopSpeak 也是 no-op', async () => {
    const { mod, cleanup } = await fresh(null)
    active = { cleanup }
    expect(() => mod.stopSpeak()).not.toThrow()
  })

  it('cancel 抛错 → 只 warn，不把异常抛给调用方', async () => {
    const tts = makeTts({ voices: [{ lang: 'zh-CN', name: 'x' }], cancelThrows: true })
    const { mod, cleanup } = await fresh(tts)
    active = { cleanup }
    expect(() => mod.stopSpeak()).not.toThrow()
  })

  it('**播报发生时已装 pagehide 守卫**（SPA 跳转串读是修过的真实缺陷）', async () => {
    const tts = makeTts({ voices: [{ lang: 'zh-CN', name: 'x' }] })
    const { mod, cleanup } = await fresh(tts)
    active = { cleanup }
    const spy = vi.spyOn(window, 'addEventListener')
    mod.speak('你好')
    expect(
      spy.mock.calls.some((c) => c[0] === 'pagehide'),
      '没装 pagehide 守卫 → SPA 跳转后上一段语音会串读新页面',
    ).toBe(true)
  })
})

describe('useVoice · 解锁与预热', () => {
  it('unlockVoice → 预热一次空 utterance（volume 0），并写 localStorage 标记', async () => {
    const tts = makeTts({ voices: [] })
    const { mod, cleanup } = await fresh(tts)
    active = { cleanup }
    mod.unlockVoice()
    expect(tts.spoken.length).toBe(1)
    expect(tts.spoken[0].volume).toBe(0)
    expect(tts.spoken[0].text).toBe('')
    expect(localStorage.getItem(KEY)).toBe('1')
  })

  it('已有解锁标记 → unlockVoice 直接预热（不再等手势）', async () => {
    const tts = makeTts({ voices: [] })
    const { mod, cleanup } = await fresh(tts, { [KEY]: '1' })
    active = { cleanup }
    mod.unlockVoice()
    expect(tts.spoken.length).toBe(1)
  })

  it('预热时 speak 抛错 → 只 warn，不抛给调用方', async () => {
    const tts = makeTts({ voices: [] })
    ;(tts.api.speak as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('boom')
    })
    const { mod, cleanup } = await fresh(tts)
    active = { cleanup }
    expect(() => mod.unlockVoice()).not.toThrow()
  })

  it('**重复 unlockVoice 不重复预热**（preWarmed 幂等守卫）', async () => {
    const tts = makeTts({ voices: [] })
    const { mod, cleanup } = await fresh(tts)
    active = { cleanup }
    mod.unlockVoice()
    const n = tts.spoken.length
    mod.unlockVoice()
    mod.unlockVoice()
    expect(tts.spoken.length, 'preWarmed 守卫应挡住重复预热').toBe(n)
  })

  it('localStorage 抛错时预热仍然完成（标记写入失败不影响播报）', async () => {
    const tts = makeTts({ voices: [] })
    const { mod, cleanup } = await fresh(tts)
    active = { cleanup }
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => mod.unlockVoice()).not.toThrow()
    expect(tts.spoken.length).toBe(1)
  })
})