// ⚠️ 生成文件·勿手改 —— 正源：node_modules/zxing-wasm/dist/reader/zxing_reader.wasm
// 生成：node scripts/gen-zxing-wasm-data.mjs ／ 只检不改：node scripts/gen-zxing-wasm-data.mjs --check
//
// 为什么单独成文件（#417）：运行期要先拿 sha256 判断"随包 wasm 与宿主装的 zxing JS 是否配套"，
// 若这一步就得把 1.27MB base64 拉进来，就没法既早校验又晚取字节。元数据只有几百字节，
// 分片（zxing-wasm-data.part-N.ts）仍然只在真要用解码器时才下载。
/** 随包 wasm 来自哪个 zxing-wasm 版本（版本与宿主装的 JS 不一致时，运行时退回默认取件方式） */
export const ZXING_WASM_DATA_VERSION: string = '3.1.4'

/** 随包 wasm 的 sha256 —— 与 zxing-wasm 包内导出的 ZXING_WASM_SHA256 同值 */
export const ZXING_WASM_DATA_SHA256: string = 'e8af31edb56d0522f4de74495839385ef019ba8bc90d38e5ecb2f18795d86fb2'

/** 随包 wasm 的原始字节数（base64 解码后必须正好是这个数） */
export const ZXING_WASM_DATA_BYTES: number = 953527
