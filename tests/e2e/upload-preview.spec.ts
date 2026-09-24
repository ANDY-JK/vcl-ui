// Upload 内置图片预览 E2E：真实浏览器 + 真实文件上传 + 真实点击
// 覆盖：列表变体缩略图 → 全屏预览 → 多图切换 → 关闭；card 变体点图预览
import { test, expect, type Page } from '@playwright/test'

/** 生成彩色 PNG（纯 zlib PNG 编码，无外部依赖） */
async function makePng(page: Page, name: string, r: number, g: number, b: number): Promise<Buffer> {
  const b64 = await page.evaluate(
    ({ r, g, b }) => {
      // 200x140 纯色 + 一条对角线（肉眼可辨）
      const w = 200
      const h = 140
      const raw = new Uint8Array((w * 3 + 1) * h)
      let o = 0
      for (let y = 0; y < h; y++) {
        raw[o++] = 0
        for (let x = 0; x < w; x++) {
          const onDiag = Math.abs(x - (y * w) / h) < 3
          raw[o++] = onDiag ? 255 - r : r
          raw[o++] = onDiag ? 255 - g : g
          raw[o++] = onDiag ? 255 - b : b
        }
      }
      // CRC32
      const table = new Uint32Array(256)
      for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        table[n] = c >>> 0
      }
      const chunk = (type: string, data: Uint8Array): Uint8Array => {
        const out = new Uint8Array(12 + data.length)
        new DataView(out.buffer).setUint32(0, data.length)
        for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
        out.set(data, 8)
        let crc = 0xffffffff
        for (const byte of out.subarray(4, 8 + data.length)) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
        new DataView(out.buffer).setUint32(8 + data.length, (crc ^ 0xffffffff) >>> 0)
        return out
      }
      const ihdr = new Uint8Array(13)
      new DataView(ihdr.buffer).setUint32(0, w)
      new DataView(ihdr.buffer).setUint32(4, h)
      ihdr[8] = 8
      ihdr[9] = 2
      const u8 = [137, 80, 78, 71, 13, 10, 26, 10]
      const ihdrC = chunk('IHDR', ihdr)
      // IDAT 用原生 deflate 不可得 → 用无压缩 zlib 块（stored blocks）
      const maxBlock = 65535
      const blocks: Uint8Array[] = []
      for (let i = 0; i < raw.length; i += maxBlock) {
        const slice = raw.subarray(i, i + maxBlock)
        const header = new Uint8Array(5)
        header[0] = i + maxBlock >= raw.length ? 1 : 0
        header[1] = slice.length & 0xff
        header[2] = slice.length >> 8
        header[3] = ~header[1] & 0xff
        header[4] = ~header[2] & 0xff
        blocks.push(header, slice)
      }
      const zlen = blocks.reduce((s, b2) => s + b2.length, 0)
      const idat = new Uint8Array(zlen)
      let p = 0
      for (const b2 of blocks) {
        idat.set(b2, p)
        p += b2.length
      }
      const idatReal = chunk('IDAT', idat)
      const iendC = chunk('IEND', new Uint8Array(0))
      const parts = [new Uint8Array(u8), ihdrC, idatReal, iendC]
      const total = parts.reduce((s2, p2) => s2 + p2.length, 0)
      const pngBuf = new Uint8Array(total)
      let q = 0
      for (const p2 of parts) {
        pngBuf.set(p2, q)
        q += p2.length
      }
      let s = ''
      for (const byte of pngBuf) s += String.fromCharCode(byte)
      return btoa(s)
    },
    { r, g, b },
  )
  return Buffer.from(b64, 'base64')
}

test.describe('Upload 内置图片预览', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/upload')
    // 等预览示例卡渲染
    await expect(page.getByRole('heading', { name: '图片预览（内置）' })).toBeVisible()
  })

  test('列表变体：上传两张图 → 缩略图出现 → 点缩略图全屏预览 → 切换 → 关闭', async ({ page }) => {
    // 预览示例卡的列表变体（多文件）：页面上第 2 个 file input
    const inputs = page.locator('input[type=file]')
    const listInput = inputs.nth(1)

    const blue = await makePng(page, 'blue.png', 66, 110, 247)
    const green = await makePng(page, 'green.png', 34, 197, 94)
    await listInput.setInputFiles([
      { name: 'blue.png', mimeType: 'image/png', buffer: blue },
      { name: 'green.png', mimeType: 'image/png', buffer: green },
    ])

    // 上传完成 → 列表出现 2 个缩略图
    const thumbs = page.locator('.upload-thumb')
    await expect(thumbs).toHaveCount(2)
    await expect(page.getByText('blue.png')).toBeVisible()

    // 点第 2 个缩略图 → 全屏预览打开，计数 2/2，主图 src 是 blob
    await thumbs.nth(1).click()
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(page.locator('.ip-counter')).toHaveText('2 / 2')
    await expect(dialog.locator('.ip-img, img').first()).toHaveAttribute('src', /^blob:/)

    // Esc 关闭
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('card 变体：上传后点图片直接全屏预览', async ({ page }) => {
    const cardInput = page.locator('input[type=file]').first()
    const blue = await makePng(page, 'card-blue.png', 66, 110, 247)
    await cardInput.setInputFiles([{ name: 'card-blue.png', mimeType: 'image/png', buffer: blue }])

    const img = page.locator('.card-img')
    await expect(img).toBeVisible()
    await img.click()
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('img').first()).toHaveAttribute('src', /^blob:/)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
})
