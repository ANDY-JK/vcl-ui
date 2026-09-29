/**
 * demo 图片素材 —— 全部是内联 SVG data URI，无任何网络依赖。
 *
 * 为什么不用 picsum.photos / dicebear 这类在线图床（本文件替换的旧写法）：
 * 1. **资源会消失**：第三方图床随时可能改版、限流、下线，一旦不可用一种页面全是破图，
 *    而 demo 的首要职责是「打开就能看到组件长什么样」。
 * 2. **断网即废**：离线/内网环境（含 CI 无外网时）整页图片演示全部失效。
 * 3. **口径一致**：本库的零运行期取件原则——高德主题图钉、zxing 解码 wasm、
 *    SheetJS 都已从外链改为随包或仓内 vendor，图标数据也全部落在 `_internal/`。
 *    demo 层没有理由留一个例外。
 * 4. 尺寸可控：演示 Image/ImagePreview 的宽高比，本来就需要确定的像素尺寸，
 *    图床按 seed 返回的尺寸反而不直观。
 *
 * 内联 SVG 的好处：每个几百字节、无额外文件与构建配置、断网可用、
 * 且 `data:image/` 前缀本就落在 Image 组件的合法来源判定里。
 */

/** 生成一张渐变照片风格图（含尺寸标注，便于肉眼核对宽高比） */
function photo(w: number, h: number, hue: number, label: string): string {
  const fs = Math.max(12, Math.round(Math.min(w, h) / 8))
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue} 62% 64%)"/>` +
    `<stop offset="1" stop-color="hsl(${(hue + 46) % 360} 58% 42%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>` +
    `<text x="${w / 2}" y="${h / 2}" font-family="system-ui,sans-serif" font-size="${fs}" ` +
    `fill="#fff" fill-opacity="0.94" text-anchor="middle" dominant-baseline="middle">${label}</text>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** 生成一枚头像（圆形底 + 首字），用于 Avatar / 表格头像列 */
function avatar(name: string, hue: number, size = 96): string {
  const initial = name.slice(0, 1)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue} 68% 60%)"/>` +
    `<stop offset="1" stop-color="hsl(${(hue + 34) % 360} 62% 40%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="${size}" height="${size}" rx="${size / 2}" fill="url(#a)"/>` +
    `<text x="${size / 2}" y="${size / 2}" font-family="system-ui,sans-serif" ` +
    `font-size="${Math.round(size / 2.4)}" fill="#fff" text-anchor="middle" dominant-baseline="central">${initial}</text>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Image 组件基础演示：一张常规横图 */
export const demoPhoto = photo(400, 300, 212, '400×300')

/** 预览单图按钮用的三张（演示不同宽高比在预览器里的适配） */
export const demoWide = photo(1200, 600, 268, '1200×600 宽')
export const demoTall = photo(600, 1200, 158, '600×1200 长')
export const demoLarge = photo(1600, 900, 24, '1600×900 大')

/**
 * ImagePreview 多图演示：四张不同比例。
 * ⚠️ label 文案被 e2e 当作**按钮可访问名**定位（`image-preview-gesture.spec.ts` 按
 * 「风景照 — 宽幅」点开预览），改动会直接打断测试——保持与原先一致的措辞。
 */
export const demoMulti = [
  { url: photo(1200, 800, 205, '1200×800 宽幅'), label: '风景照 — 宽幅' },
  { url: photo(800, 1200, 330, '800×1200 竖幅'), label: '人像照 — 竖幅' },
  { url: photo(1600, 900, 42, '1600×900 大图'), label: '建筑照 — 大图' },
  { url: photo(600, 900, 174, '600×900 小图'), label: '静物照 — 小图' },
]

/** 表格头像列：三个不同色的头像 */
export const demoAvatars = [avatar('爱', 212), avatar('陈', 330), avatar('丁', 24)]

/** 域名白名单演示用（同样本地生成，不依赖图床） */
export const demoAvatarA = avatar('甲', 268, 80)
export const demoAvatarB = avatar('乙', 158, 80)

/** 刻意的坏链接：Image 组件的加载失败态演示。保留 example.com——IANA 保留域名，永不解析 */
export const demoBrokenUrl = 'https://invalid.example.com/broken.jpg'
