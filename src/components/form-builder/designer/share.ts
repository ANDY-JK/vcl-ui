/**
 * 表单分享码 — 把 FormDesign 压缩为可复制的短串，跨设备/跨人还原表单
 *
 * 格式：`FD1.<base64url(JSON)>`
 * - 前缀带版本号，导入端按前缀识别（粘贴纯 JSON 走原有导入路径，互不干扰）
 * - base64url（+→- /→_ 去 =）可安全放入 URL/聊天窗口，不含换行
 * - UTF-8 经 TextEncoder 编码后转二进制串再 btoa，支持中文内容
 */

import { FORM_DESIGN_VERSION, type FormDesign } from './types'

export const SHARE_CODE_PREFIX = 'FD1.'

/** FormDesign → 分享码（内容不加密：仅传输编码，敏感表单请勿外发） */
export function encodeShareCode(design: FormDesign): string {
  const payload = {
    schemaVersion: design.schemaVersion ?? FORM_DESIGN_VERSION,
    meta: design.meta ?? {},
    nodes: design.nodes ?? design.fields ?? [],
  }
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  // 分块转二进制串：String.fromCharCode 展开超 65535 参数会栈溢出
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return SHARE_CODE_PREFIX + b64
}

/** 分享码 → FormDesign；非分享码/损坏内容返回 null（导入面板据此走 JSON 路径或报错） */
export function decodeShareCode(code: string): FormDesign | null {
  const raw = (code ?? '').trim()
  if (!raw.startsWith(SHARE_CODE_PREFIX)) return null
  try {
    let b64 = raw.slice(SHARE_CODE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const data = JSON.parse(new TextDecoder().decode(bytes)) as Partial<FormDesign>
    if (!data || typeof data !== 'object') return null
    // nodes（v3）或 fields（v2）任一为数组才认定有效
    if (!Array.isArray(data.nodes) && !Array.isArray(data.fields)) return null
    return { ...data, meta: data.meta ?? {}, nodes: (data.nodes ?? data.fields ?? []) as FormDesign['nodes'] }
  } catch {
    return null
  }
}
