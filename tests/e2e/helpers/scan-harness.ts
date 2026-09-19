// 扫码公共设施：qrcode 生成真实二维码 → 手工编码 I420 y4m → Chromium 虚拟摄像头喂帧
import QRCode from 'qrcode'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const W = 1280
const H = 720
const FRAMES = 60 // 2s @30fps，静态画面，循环播放

/**
 * 生成喂帧视频，返回落盘路径。
 * 文件名必须按 worker 分岔：本函数在每个 worker 的模块顶层各跑一次，多个 worker 跑同一份
 * spec（`--repeat-each`、或将来把用例拆进同一文件）时会并发覆写同一个文件，
 * Edge 读到写了一半的 y4m → 摄像头出不了帧 → 扫 45s 一个码都识别不出，表现为偶发红且失败点会漂。
 */
export async function makeY4m(name: string, items: { text: string; cx: number; cy: number }[]): Promise<string> {
  const y = Buffer.alloc(W * H, 235)
  const u = Buffer.alloc((W / 2) * (H / 2), 128)
  const v = Buffer.alloc((W / 2) * (H / 2), 128)
  for (const item of items) {
    const qr = QRCode.create(item.text, { errorCorrectionLevel: 'M' })
    const n = qr.modules.size
    const quiet = 4
    const cells = n + quiet * 2
    const cell = 190 / cells // 目标总高约 190px
    const originX = Math.round(item.cx - (cells * cell) / 2)
    const originY = Math.round(item.cy - (cells * cell) / 2)
    const dark = (row: number, col: number): boolean => {
      if (row < quiet || col < quiet || row >= quiet + n || col >= quiet + n) return false
      return qr.modules.data[(row - quiet) * n + (col - quiet)] === 1
    }
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        if (!dark(r, c)) continue
        const x0 = Math.round(originX + c * cell)
        const y0 = Math.round(originY + r * cell)
        const x1 = Math.round(originX + (c + 1) * cell)
        const y1 = Math.round(originY + (r + 1) * cell)
        for (let py = y0; py < y1; py++) {
          for (let px = x0; px < x1; px++) y[py * W + px] = 16
        }
      }
    }
  }
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`)
  const frame = Buffer.concat([Buffer.from('FRAME\n'), y, u, v])
  const parts: Buffer[] = [header]
  for (let i = 0; i < FRAMES; i++) parts.push(frame)
  const worker = process.env.TEST_WORKER_INDEX ?? '0'
  const tagged = name.replace(/\.y4m$/, '') + `-w${worker}.y4m`
  const file = path.join(tmpdir(), tagged)
  writeFileSync(file, Buffer.concat(parts))
  return file
}

export async function openScanModal(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/#/capture')
  await page.getByRole('button', { name: /打开扫码弹窗/ }).click()
  // 弹窗内的扫描区（合并后的采集页常驻多个演示实例，必须限定 modal 作用域）
  const modal = page.locator('.modal-box')
  await modal.locator('.scan-live').waitFor({ state: 'visible', timeout: SCAN_BUDGET })
  return
}

/**
 * 虚拟摄像头 + wasm 解码的时间预算（毫秒）。
 * 实测本机：空载单跑该用例约 8-10s，8 个 worker 满载时 13-21s —— 假摄像头起流与
 * zxing wasm 初始化都吃 CPU，机器一忙就整体后移。断言给足余量，这样超时只在
 * 「码始终识别不出来」时触发，不会因为机器忙而误报（曾因固定 15s 出现过 2/3 概率的假红）。
 */
export const SCAN_BUDGET = 45_000

/** 单条扫码用例的总时长上限，必须显著大于 SCAN_BUDGET，否则断言还没到期整条用例先超时 */
export const SCAN_TEST_TIMEOUT = 120_000
