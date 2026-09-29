/**
 * 生成 demo 用的本地图片素材（无扩展名 PNG）。
 *
 * 为什么是「无扩展名的 PNG」这种怪东西：
 * 演示 imageDomains（图片域名白名单）要求素材能被**域名规则**识别，
 * 而 isImageUrl 的判定顺序是 data: 前缀 → 扩展名 → 域名清单 → 路径启发式。
 * 只要 URL 带 .png/.jpg 这类扩展名，第一步扩展名规则就命中，白名单开关就失去效果
 * —— 演示不出「传了 imageDomains 就整表替换默认清单」。
 * 故素材必须以**无扩展名路径**提供；PNG 内容 + 无扩展名，浏览器按内容嗅探照样渲染。
 *
 * 产物落 `demo-public/`（vite publicDir），并在 build 里 `copyPublicDir: false`
 * —— 这是 demo 资源，绝不能进 dist（那是要发布的 npm 包）。
 *
 * 用法：node scripts/gen-demo-assets.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** 把 RGBA 像素编码为 PNG（单 IDAT、无滤波，够小够稳） */
function encodePng(w, h, pixelAt) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    const rowStart = y * (w * 4 + 1)
    raw[rowStart] = 0 // filter: none
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixelAt(x, y)
      const o = rowStart + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = a
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crcTable = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
    let crc = 0xffffffff
    for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
    return Buffer.concat([len, body, crcBuf])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** 对角渐变头像：左上亮、右下深，中间一道浅色斜带，肉眼可辨是「图」而非纯色块 */
function avatarPng(size, hue) {
  const hsl = (h, s, l) => {
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
    const f = (n) => {
      const k = (n + h / 30) % 12
      return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    }
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
  }
  return encodePng(size, size, (x, y) => {
    const t = (x + y) / (size * 2)
    const band = Math.abs(x - y) < size * 0.12
    const [r, g, b] = hsl(hue, 62, band ? 78 : 62 - t * 26)
    // 圆形之外透明，视觉上就是一枚头像
    const dx = x - size / 2
    const dy = y - size / 2
    const inside = dx * dx + dy * dy <= (size / 2 - 1) ** 2
    return [r, g, b, inside ? 255 : 0]
  })
}

const OUT = 'demo-public/demo-assets'
const targets = [
  // 路径带 picsum.photos 是为了命中 isImageUrl 的**内置默认域名清单**；
  // 文件名保持无扩展名（扩展名规则会先命中，白名单演示就失效）
  [`${OUT}/picsum.photos/demo-a`, avatarPng(80, 212)],
  [`${OUT}/picsum.photos/demo-b`, avatarPng(80, 330)],
]

for (const [file, buf] of targets) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, buf)
  console.log(`写出 ${file}  ${buf.length} 字节`)
}
