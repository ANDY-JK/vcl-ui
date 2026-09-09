// Web Speech API 语音播报
let preWarmed = false
const KEY = 'vue-lib-voice-unlocked'

function doWarm(): void {
  if (preWarmed || typeof window === 'undefined' || !window.speechSynthesis) return
  try {
    speechSynthesis.getVoices()
    const u = new SpeechSynthesisUtterance('')
    u.volume = 0
    u.rate = 2
    speechSynthesis.speak(u)
    preWarmed = true
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      console.warn('[useVoice] localStorage 不可用，静默降级')
    }
  } catch {
    console.warn('[useVoice] SpeechSynthesis 预热失败')
  }
}

// localStorage 持久化：上次访问已预热则跳过等待
// 幂等守卫：window 级标记防止库被多份拷贝打包时重复挂监听/重复预热（SSR 下 window 不存在直接跳过）
let autoInited = false
function autoInit(): void {
  if (autoInited || typeof window === 'undefined') return
  autoInited = true
  const win = window as unknown as { __vueLibVoiceInited?: boolean }
  if (win.__vueLibVoiceInited) return
  win.__vueLibVoiceInited = true
  // 页面离开（含 bfcache 前）停掉播报，否则 SPA 跳转后上一段语音会串读新页面
  window.addEventListener('pagehide', stopSpeak)
  try {
    if (localStorage.getItem(KEY) === '1') {
      doWarm()
    } else {
      const events = ['mousedown', 'touchstart', 'keydown']
      function auto() {
        doWarm()
        events.forEach((e) => document.removeEventListener(e, auto))
      }
      events.forEach((e) => document.addEventListener(e, auto, { once: true, passive: true }))
    }
  } catch {
    /* localStorage 不可用，跳过持久化逻辑 */
  }
}
autoInit()

export function unlockVoice(): void {
  doWarm()
}

/** 支持的语言代码 */
export type VoiceLang = 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'auto'

/** 待补发的播报请求：voices 异步就绪后重放一次（只保留最后一次，避免排队串读） */
let pendingSpeak: { text: string; rate: number; pitch: number; lang: VoiceLang } | null = null
let voicesListenerAttached = false

function doSpeak(text: string, rate: number, pitch: number, lang: VoiceLang): void {
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = rate
  u.pitch = pitch
  u.volume = 0.8
  // 语言选择：'auto' 根据文本特征推断，否则匹配指定语言前缀
  const targetLang = lang === 'auto' ? detectLang(text) : lang
  const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith(targetLang))
  if (voice) u.voice = voice
  u.lang = voice?.lang || targetLang
  speechSynthesis.speak(u)
}

function attachVoicesListener(): void {
  if (voicesListenerAttached) return
  voicesListenerAttached = true
  speechSynthesis.addEventListener('voiceschanged', onVoicesReady, { once: true })
}

function onVoicesReady(): void {
  // 一次性监听已消费，标记必须复位；否则下一次 speak 不会再挂监听，请求永远补发不出去
  voicesListenerAttached = false
  const p = pendingSpeak
  if (!p) return
  // Chrome 可能分多次推送语音列表：本次仍为空时保持挂起，重新挂监听等下一次
  if (!speechSynthesis.getVoices().length) {
    attachVoicesListener()
    return
  }
  pendingSpeak = null
  try {
    doSpeak(p.text, p.rate, p.pitch, p.lang)
  } catch {
    console.warn('[useVoice] 语音播报失败')
  }
}

/** 播报文字；rate 0.1~10，pitch 0~2；lang 指定语言（默认 'zh'），'auto' 为自动检测 */
export function speak(text: string, rate = 1, pitch = 1, lang: VoiceLang = 'zh'): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  rate = Math.max(0.1, Math.min(10, rate))
  pitch = Math.max(0, Math.min(2, pitch))
  try {
    if (!speechSynthesis.getVoices().length) {
      // Chrome 首次 getVoices() 常为空（语音列表异步加载）：直接播会退化成系统默认音（语言错读）。
      // 记下请求，voiceschanged 就绪后补发一次。
      pendingSpeak = { text, rate, pitch, lang }
      attachVoicesListener()
      return
    }
    doSpeak(text, rate, pitch, lang)
  } catch {
    console.warn('[useVoice] 语音播报失败')
  }
}

/** 简单语言检测：根据文本字符特征推断语言 */
function detectLang(text: string): string {
  // 中日韩文字范围检测
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh'
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja'
  if (/[\uac00-\ud7af]/.test(text)) return 'ko'
  // 默认英语
  return 'en'
}

export function stopSpeak(): void {
  // 停播后不再补发挂起的请求，否则离开页面后 voices 就绪还会响一声
  pendingSpeak = null
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  try {
    speechSynthesis.cancel()
  } catch {
    console.warn('[useVoice] speechSynthesis.cancel 失败')
  }
}
