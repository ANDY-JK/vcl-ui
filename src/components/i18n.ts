/**
 * i18n 公开子路径的稳定声明落点 — `vcl-ui/i18n` 的唯一公开入口
 *
 * ⛔ 契约（Q13）：`package.json` 的 `exports['./i18n'].types` 指向本文件产出的
 * `dist/i18n.d.ts`。实现位于 `./_internal/i18n`，那是内部路径，可随重构移动；
 * 公开 exports 不得暴露 `_internal` 路径（内部重组会静默打断消费方的类型解析），
 * 所以本文件只做 re-export，不加逻辑、不改形状。新增公开 i18n API 时加在这里，
 * 内部实现继续放在 `_internal/i18n`。
 *
 * 运行时 `import { … } from 'vcl-ui/i18n'` 仍解析到主 bundle（exports 的
 * import/require 指向 vcl-ui.js），本文件不产生第二份运行时实现。
 */

export { getLocale, i18n, registerMessages, setLocale, useI18n, useT, useTm } from './_internal/i18n'
export type { Locale } from './_internal/i18n'
