/**
 * amapNav — 导航深度链接与平台探测（#462 从 amap-service.ts 拆出）
 *
 * `detectPlatform` 从 UA 判断 ios/android/web（SSR 无 navigator 时按 web）；
 * `buildNavLink` 按端拼不同形态的链接（web 走 restapi URI，iOS 走 iosamap://，
 * Android 走 amap://route/plan/），并保留 callnative 标记让 H5 端唤起原生 App。
 *
 * 本模块无高德 REST 依赖 —— 只是 URL 拼装与 UA 判断，纯函数。
 */

/** 检测当前平台 */
export function detectPlatform(): 'ios' | 'android' | 'web' {
  if (typeof navigator === 'undefined') return 'web'
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  return 'web'
}

/** 坐标点（导航用） */
export interface NavPoint {
  lon: number
  lat: number
  name: string
}

/** 导航链接：label（可读）+ url（当前端）+ webUrl（跨端兜底，复制/分享用） */
export interface NavLink {
  label: string
  url: string
  webUrl: string
}

/**
 * 生成单段导航链接（A → B，可选途经点）
 * 自动适配 iOS / Android / Web 三端
 */
export function buildNavLink(from: NavPoint, to: NavPoint, waypoints: NavPoint[] = []): NavLink {
  const label = `${from.name} → ${to.name}`
  const platform = detectPlatform()

  const viaStr = waypoints.map((wp) => `${wp.lon},${wp.lat}`).join(';')

  const webParams = new URLSearchParams({
    from: `${from.lon},${from.lat},${from.name}`,
    to: `${to.lon},${to.lat},${to.name}`,
    mode: 'car',
  })
  if (viaStr) webParams.set('via', viaStr)
  webParams.set('callnative', '1')
  const webUrl = `https://uri.amap.com/navigation?${webParams.toString()}`

  const iosParams = new URLSearchParams({
    sourceApplication: 'vcl-ui',
    sid: 'SV1',
    slat: String(from.lat),
    slon: String(from.lon),
    sname: from.name,
    did: 'SV2',
    dlat: String(to.lat),
    dlon: String(to.lon),
    dname: to.name,
    dev: '0',
    t: '0',
  })
  if (waypoints.length > 0) {
    iosParams.set('via', waypoints.map((wp) => `${wp.lon},${wp.lat},${wp.name}`).join(';'))
  }
  const iosUrl = `iosamap://path?${iosParams.toString()}`

  const androidParams = new URLSearchParams({
    sid: 'SV1',
    slat: String(from.lat),
    slon: String(from.lon),
    sname: from.name,
    did: 'SV2',
    dlat: String(to.lat),
    dlon: String(to.lon),
    dname: to.name,
    dev: '0',
    t: '0',
  })
  if (waypoints.length > 0) {
    androidParams.set('via', waypoints.map((wp) => `${wp.lon},${wp.lat},${wp.name}`).join(';'))
  }
  const androidUrl = `amap://route/plan/?${androidParams.toString()}`

  const url = platform === 'ios' ? iosUrl : platform === 'android' ? androidUrl : webUrl

  return { label, url, webUrl }
}
