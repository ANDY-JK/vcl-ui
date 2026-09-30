import { reportWarn } from '@/components/_internal/runtime-observer'
// 纯 Web Audio API 蜂鸣——无外部音频文件依赖
let ctx: AudioContext | null = null
let unlocked = false

/** 首次用户交互时解锁 AudioContext，一次解锁永久可用 */
function unlock(): void {
  if (unlocked || ctx?.state === 'running') return
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') ctx.resume()
    const buf = ctx.createBuffer(1, 1, 22050)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start(0)
    src.stop(ctx.currentTime + 0.001)
    unlocked = true
    // 解锁后移除监听器
    ;['mousedown', 'touchstart', 'keydown', 'click'].forEach((e) => document.removeEventListener(e, unlock))
  } catch {
    // 非用户手势，等下次交互重试
  }
}

// 用户首次点击/按键时自动解锁，之后 beep 直接可用
// 幂等守卫：window 级标记防止库被多份拷贝打包时重复挂监听（SSR 下 window 不存在直接跳过）
let autoInited = false
function autoInit(): void {
  if (autoInited || typeof window === 'undefined') return
  autoInited = true
  const win = window as unknown as { __vueLibBeepInited?: boolean }
  if (win.__vueLibBeepInited) return
  win.__vueLibBeepInited = true
  ;['mousedown', 'touchstart', 'keydown', 'click'].forEach((e) =>
    document.addEventListener(e, unlock, { passive: true, once: true }),
  )
}

/** 首次发声时才挂解锁监听 —— 库不得在 import 期改宿主全局状态（只引一个 Button 也会挂 4 个监听） */
function ensureReady(): void {
  autoInit()
  // play() 的调用栈通常正处于用户手势内（点按钮→扫描→提示音），当场试一次解锁，
  // 免得"首次注册监听、下次手势才生效"导致第一声静默。
  if (!unlocked) unlock()
}

/** 首次用户交互后显式解锁 AudioContext（浏览器自动播放策略要求；一次解锁永久可用） */
export function unlockAudio(): void {
  ensureReady()
}

function play(freqs: number[], type: OscillatorType, vol: number): void {
  if (!Array.isArray(freqs) || freqs.length === 0) return
  if (typeof vol !== 'number' || vol <= 0) return
  const validTypes: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle', 'custom']
  if (!validTypes.includes(type)) return

  ensureReady()

  if (ctx?.state === 'closed') {
    ctx = null
    unlocked = false
  }
  if (!ctx || !unlocked) {
    try {
      // 旧 iOS Safari（<14.5）只有 webkitAudioContext 前缀实现
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      ctx = new Ctor()
    } catch {
      return
    }
  }

  const a = ctx
  if (!a || !unlocked) return
  try {
    const t = a.currentTime
    freqs.forEach((f, i) => {
      const o = a.createOscillator()
      const g = a.createGain()
      o.type = type
      o.frequency.value = f
      g.gain.setValueAtTime(vol, t + i * 0.08)
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.12)
      o.connect(g).connect(a.destination)
      o.start(t + i * 0.08)
      o.stop(t + i * 0.08 + 0.12)
    })
  } catch {
    reportWarn('[useBeep] 播放失败')
  }
}

// 四种提示音（纯 Web Audio 合成，无外部音频文件）
/** 成功提示音（上行双音） */
export function beepSuccess(): void {
  play([880, 1100], 'sine', 0.15)
}
/** 错误提示音（低频方波） */
export function beepError(): void {
  play([200], 'square', 0.1)
}
/** 通知提示音（三连中性音） */
export function beepNotify(): void {
  play([440, 494, 440], 'sine', 0.12)
}
/** 警告提示音（下行双音） */
export function beepWarning(): void {
  play([600, 500], 'triangle', 0.13)
}
