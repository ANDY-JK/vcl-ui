/**
 * 生成玻璃拟态门户的风景底图（摄影感暖沙丘）→ demo-public/vcl-wallpaper.png
 *
 * 为什么是程序化逐像素 PNG：参考门户用真实摄影图，素材必须离线（check:offline），
 * 外链图床不可用、SVG 只能画「平的」抽象色块（第一版被用户判丑爆）。
 * 逐像素按「垂直渐变天空 + 三层 sin 曲线沙丘（受光亮坡/背光深坡）+ 地平线雾带」
 * 合成出有光影体积的照片感画面，PNG 编码复用 gen-demo-assets.mjs 的实现。
 *
 * 调色原则（对照参考图采样）：低饱和、高明度、顶部灰雾、地平线最亮；丘面往下加深。
 * 冷暖分工：天空冷灰蓝（通透）、丘面暖沙（温度），两层不要互相串味。
 * 用法：node scripts/gen-glass-wallpaper.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { deflateSync } from 'node:zlib'

const W = 1536
const H = 864

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
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const chunks = []
  const type = (s) => Buffer.from(s, 'ascii')
  const crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  const crc32 = (buf) => {
    let c = 0xffffffff
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (t, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([t, data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  chunks.push(chunk(type('IHDR'), ihdr))
  chunks.push(chunk(type('IDAT'), deflateSync(raw)))
  chunks.push(chunk(type('IEND'), Buffer.alloc(0)))
  return Buffer.concat([signature, ...chunks])
}

const hex = (h) => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const lerp = (a, b, k) => a + (b - a) * Math.min(1, Math.max(0, k))

/** 天空：冷灰蓝 → 雾带近白（采样自参考图 #a6b5bc → #e9e8e1；
    冷雾调是整张画面的可读性与高级感的关键——第一版误用暖褐灰被用户判土黄味） */
const SKY = [
  [0, hex('#a6b5bc')],
  [0.15, hex('#b6c2c0')],
  [0.3, hex('#c6cec8')],
  [0.42, hex('#dde0d8')],
  [0.52, hex('#eae9e2')],
  [0.58, hex('#e9e8e1')],
  [1, hex('#e9e8e1')],
]
function skyAt(y) {
  for (let i = 1; i < SKY.length; i++) {
    if (y / H <= SKY[i][0]) {
      const [t0, c0] = SKY[i - 1]
      const [t1, c1] = SKY[i]
      const k = (y / H - t0) / (t1 - t0)
      return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k)]
    }
  }
  return SKY[SKY.length - 1][1]
}

const ridgeY = (x, base, amp, freq, phase) => base + amp * Math.sin((x / W) * freq * Math.PI * 2 + phase)

/** 三层沙丘：受光面亮（top）、往画面底部转深（bot）；edge = 沿坡羽化带宽度。
    远层顶亮压灰白（融进雾里），中层受光暖沙主坡，层底转深灰压住画面 */
const LAYERS = [
  { base: H * 0.545, amp: H * 0.042, freq: 2.3, phase: 0.8, top: hex('#e6e3d9'), bot: hex('#8a7d6b'), edge: 10 },
  { base: H * 0.63, amp: H * 0.052, freq: 1.5, phase: 2.9, top: hex('#e4e0d6'), bot: hex('#c9b590'), edge: 14 },
  { base: H * 0.775, amp: H * 0.068, freq: 1.1, phase: 5.1, top: hex('#e4cd9e'), bot: hex('#8f8270'), edge: 18 },
]
const SUN = { cx: W * 0.66, cy: H * 0.4, r: W * 0.42, color: hex('#f7eedd'), peak: 0.75 }
const HAZE = { center: H * 0.53, sigma: H * 0.075, peak: 0.5 }
const WASH = 0.06 // 全图白 wash：去脏提雾

const buf = encodePng(W, H, (x, y) => {
  let [r, g, b] = skyAt(y)
  // 太阳光晕
  const dx = (x - SUN.cx) / SUN.r
  const dy = (y - SUN.cy) / SUN.r
  const glow = SUN.peak * Math.exp(-(dx * dx + dy * dy) * 3)
  r = lerp(r, SUN.color[0], glow)
  g = lerp(g, SUN.color[1], glow)
  b = lerp(b, SUN.color[2], glow)
  // 沙丘（远→近，逐层覆盖）
  for (const L of LAYERS) {
    const yb = ridgeY(x, L.base, L.amp, L.freq, L.phase)
    if (y >= yb) {
      const k = Math.min(1, (y - yb) / L.edge) // 坡顶羽化
      const depth = (y - yb) / (H - yb) // 层内垂直明暗
      const lr = lerp(L.top[0], L.bot[0], depth)
      const lg = lerp(L.top[1], L.bot[1], depth)
      const lb = lerp(L.top[2], L.bot[2], depth)
      r = lerp(r, lr, k)
      g = lerp(g, lg, k)
      b = lerp(b, lb, k)
    }
  }
  // 地平线雾带
  const hz = HAZE.peak * Math.exp(-Math.pow((y - HAZE.center) / HAZE.sigma, 2))
  r = lerp(r, 245, hz)
  g = lerp(g, 238, hz)
  b = lerp(b, 224, hz)
  // 全图 wash
  r = lerp(r, 255, WASH)
  g = lerp(g, 255, WASH)
  b = lerp(b, 255, WASH)
  return [r, g, b, 255]
})

const file = 'demo-public/vcl-wallpaper.png'
mkdirSync(dirname(file), { recursive: true })
writeFileSync(file, buf)
console.log(`✅ 已生成 ${file}（${(buf.length / 1024).toFixed(1)}KB）`)
