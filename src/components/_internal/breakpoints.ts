/**
 * 视口断点 —— JS 侧的唯一来源。
 * 为什么单独一个模块：断点在 CSS 里是 `--bp-*` 令牌、在 JS 里过去是各写一遍的字面量，
 * 同一个 768 散在三个文件，改令牌不会带着它们走（侧栏判定和卡片视图判定会分叉）。
 * 值必须与 tokens.css 的 `--bp-*` 一一对应，由 `npm run check:constants` 卡住。
 */
export const BP_SM = 640
export const BP_MD = 768
export const BP_LG = 1024
