// ⚠️ 生成文件·勿手改 —— 正源：node_modules/zxing-wasm/dist/reader/zxing_reader.wasm
// 生成：node scripts/gen-zxing-wasm-data.mjs ／ 只检不改：node scripts/gen-zxing-wasm-data.mjs --check
//
// 用途：把 zxing-wasm 的解码 wasm 二进制随本包分发，使首次扫码不再向 fastly.jsdelivr.net 取件
// （zxing-wasm 默认 locateFile 走那个 CDN，网络一抖就是「识别中…」长挂，根因见
//  docs/全量审查报告-2026-09-28.md §9.7）。消费方见 useBarcodeScanner.ts 的 warmBarcodeDecoder。
//
// 体积：base64 文本 1.21MB（原始 953,527 字节），
// 由 manualChunks 拆成独立懒加载 chunk，只有真的打开扫码界面才会加载。
// 分片：base64 被切成 2 片（zxing-wasm-data.part-1..2），本文件只做拼接与元数据（#416）。
// 换版：升级 zxing-wasm 后重跑本脚本；sha256 与 zxing-wasm 自己导出的 ZXING_WASM_SHA256 由
// tests/unit/zxing-wasm-data.spec.ts 做同源断言，对不上就是正源被换过（会红，别改断言迁就）。
import { PART_1 } from './zxing-wasm-data.part-1'
import { PART_2 } from './zxing-wasm-data.part-2'

/** 随包 wasm 来自哪个 zxing-wasm 版本（版本与宿主装的 JS 不一致时，运行时退回默认取件方式） */
export const ZXING_WASM_DATA_VERSION: string = '3.1.4'

/** 随包 wasm 的 sha256 —— 与 zxing-wasm 包内导出的 ZXING_WASM_SHA256 同值 */
export const ZXING_WASM_DATA_SHA256: string = 'e8af31edb56d0522f4de74495839385ef019ba8bc90d38e5ecb2f18795d86fb2'

/** 随包 wasm 的原始字节数（base64 解码后必须正好是这个数） */
export const ZXING_WASM_DATA_BYTES: number = 953527

/**
 * zxing_reader.wasm 的 base64（无 data: 前缀，解码见 useBarcodeScanner.ts），由各分片按序拼接。
 * 常量显式标了类型：不标的话 vite-plugin-dts 会把这个字面量类型抄进
 * `dist/_internal/zxing-wasm-data.d.ts`，同一份 base64 在发布包里白带两遍。
 */
export const ZXING_WASM_DATA_BASE64: string = PART_1 + PART_2
