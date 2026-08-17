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
    const src = ctx.createBufferSource(); src.buffer = buf
    src.connect(ctx.destination); src.start(0); src.stop(ctx.currentTime + 0.001)
    unlocked = true
    // 解锁后移除监听器
    ;['mousedown', 'touchstart', 'keydown', 'click'].forEach(e =>
      document.removeEventListener(e, unlock))
  } catch {
    // 非用户手势，等下次交互重试
  }
}

// 用户首次点击/按键时自动解锁，之后 beep 直接可用
if (typeof window !== 'undefined') {
  ;['mousedown', 'touchstart', 'keydown', 'click'].forEach(e =>
    document.addEventListener(e, unlock, { passive: true, once: true }))
}

export function unlockAudio(): void { unlock() }

function play(freqs: number[], type: OscillatorType, vol: number): void {
  if (!Array.isArray(freqs) || freqs.length === 0) return
  if (typeof vol !== 'number' || vol <= 0) return
  const validTypes: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle', 'custom']
  if (!validTypes.includes(type)) return

  if (ctx?.state === 'closed') {
    ctx = null
    unlocked = false
  }
  if (!ctx || !unlocked) {
    try {
      ctx = new AudioContext()
    } catch {
      return
    }
  }

  const a = ctx; if (!a || !unlocked) return
  try {
    const t = a.currentTime
    freqs.forEach((f, i) => {
      const o = a.createOscillator(); const g = a.createGain()
      o.type = type; o.frequency.value = f
      g.gain.setValueAtTime(vol, t + i * 0.08)
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.12)
      o.connect(g).connect(a.destination)
      o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.12)
    })
  } catch { console.warn('[useBeep] 播放失败') }
}

// 三种提示音
export function beepSuccess(): void { play([880, 1100], 'sine', 0.15) }
export function beepError(): void { play([200], 'square', 0.1) }
export function beepNotify(): void { play([440, 494, 440], 'sine', 0.12) }
