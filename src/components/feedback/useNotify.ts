// Web Notification API — Windows / macOS 系统通知

export interface NotifyOptions {
  body?: string
  /** 点击通知时回调；默认聚焦窗口并关闭通知 */
  onClick?: () => void
  /** 点击通知时打开的 URL */
  url?: string
  /** 自动关闭毫秒数，0 = 不自动关闭 */
  autoClose?: number
}

async function ensure(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

/** 发送系统通知——首次调用时请求权限 */
export async function notify(title: string, bodyOrOptions?: string | NotifyOptions): Promise<void> {
  try {
    if (!(await ensure())) {
      if (Notification.permission === 'denied') {
        console.warn('[useNotify] 通知权限已被拒绝，请在浏览器设置中开启')
      }
      return
    }
    const opts: NotifyOptions = typeof bodyOrOptions === 'string'
      ? { body: bodyOrOptions }
      : (bodyOrOptions || {})

    const n = new Notification(title, { body: opts.body || '' })

    // 默认点击行为：聚焦窗口 + 关闭
    n.onclick = () => {
      if (opts.onClick) { opts.onClick() }
      else if (opts.url) { window.open(opts.url, '_blank') }
      else { window.focus() }
      n.close()
    }

    if (opts.autoClose && opts.autoClose > 0) {
      setTimeout(() => { try { n.close() } catch { console.warn('[useNotify] 自动关闭通知失败') } }, opts.autoClose)
    }
  } catch { console.warn('[useNotify] 通知发送失败') }
}

/** 获取当前通知权限状态 */
export function getNotifyStatus(): 'granted' | 'denied' | 'prompt' | 'unsupported' {
  if (!window.isSecureContext) return 'unsupported'
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission as 'granted' | 'denied' | 'prompt'
}
