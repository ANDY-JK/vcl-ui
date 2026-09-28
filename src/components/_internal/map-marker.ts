/**
 * 地图标记图钉（自绘内联 SVG）。
 *
 * 为什么不用高德官方主题图：`https://webapi.amap.com/theme/v1.3/markers/n/*.png` 是运行时向
 * 高德取的位图，且**已经在掉件**——`mark_g.png` 于 2026-09-27 实测 404 下线（当时改成自绘，
 * 见 AmapWidget.vue 的记录）。图库依赖留着，用户看到的就是一枚不显示的标记，而且没人能预告它哪天没。
 *
 * 尺寸与取色来自 2026-09-28 对高德仍在发的三张主题图的实测（Playwright 载入 canvas 逐像素取样）：
 * 三张都是 19×31 的水滴形；红＝rgb(245,54,66)、蓝＝rgb(64,150,251)，
 * 而 `start.png`（路径规划起点）取样与蓝针同色——所以起点直接用蓝。
 * 形状自绘成库内统一的一枚（viewBox 24×24，与 09-27 那颗 green 完全同款），只换填充色，
 * 不复制高德位图的像素与轮廓。
 */

/** 实测自高德 `mark_r.png` 主体色（rgb 245,54,66） */
export const MAP_MARKER_RED = '#f53642'
/** 实测自高德 `mark_b.png` 与 `start.png` 主体色（rgb 64,150,251） */
export const MAP_MARKER_BLUE = '#4096fb'
/** 09-27 自绘那颗沿用的绿（高德主题绿，此前实测） */
export const MAP_MARKER_GREEN = '#1aaf5d'

/**
 * 生成一枚内联水滴标记（data URI）。
 * 用 `encodeURIComponent` 而非 `;utf8,` 形态：产物里 `<img src>` 由地图 SDK 生成，
 * 百分号编码形态已被 axe 豁免条锚定（tests/e2e/axe-a11y.spec.ts 的 THIRD_PARTY）。
 */
export function mapMarkerIcon(fill: string): string {
  return (
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
        '<path d="M12 2C7.9 2 4.5 5.4 4.5 9.5c0 5.2 6.4 11.6 6.7 11.9.2.2.5.4.8.4s.6-.1.8-.4c.3-.3 6.7-6.7 6.7-11.9C19.5 5.4 16.1 2 12 2z" fill="' +
        fill +
        '"/>' +
        '<circle cx="12" cy="9.5" r="3.2" fill="#fff"/>' +
        '</svg>',
    )
  )
}
