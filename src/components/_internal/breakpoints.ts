/**
 * 视口断点 —— JS 侧的唯一来源。
 * 为什么单独一个模块：断点在 CSS 里是 `--bp-*` 令牌、在 JS 里过去是各写一遍的字面量，
 * 同一个 768 散在三个文件，改令牌不会带着它们走（侧栏判定和卡片视图判定会分叉）。
 * 值必须与 tokens.css 的 `--bp-*` 一一对应，由 `npm run check:constants` 卡住。
 *
 * CSS @media 对应关系（max-width 形式，整数像素视口下与 JS 的 `<` 语义等价）：
 *   `w < BP_MD`  ↔ `@media (max-width: 767px)`
 *   `w < BP_LG`  ↔ `@media (max-width: 1023px)`
 * 规范档位全集：480 / 640 / 767 / 1023（小档 480、640 为 CSS 独立的紧凑微调档），
 * 由 `npm run check:css-breakpoints` 卡住——禁止再散落 600/768/900/1100 这类漂移值。
 */
export const BP_SM = 640
export const BP_MD = 768
export const BP_LG = 1024
