/**
 * 随包 wasm 的运行期取件口（#417）。
 *
 * 为什么不直接 `import('zxing-wasm-data')`：
 * · 那个 barrel 静态拼接了全部分片 → Rollup 会把 1.27MB 打成一个 chunk；
 * · 而 esbuild 对 **单次 >1MiB 的输入** 会落一个临时文件再交给子进程，随后删除这个文件
 *   （这台 Windows 上必现 `remove …: Access is denied.`，见 TD-129）→ 构建直接失败。
 *
 * 这里把两片**分别**动态 import：Rollup 为每个动态入口各出一个 chunk（各 ~640KB），
 * 任何一次 transform 的输入都在阈值内。元数据（sha256/version）单独在
 * `zxing-wasm-data-meta.ts`，只有几百字节，用来"早校验、晚取字节"。
 *
 * 顺序即拼接顺序：PART_1 在前。两片在一次 Promise.all 里并发取，失败整体拒绝
 * （调用方 `warmBarcodeDecoder` 有硬超时兜底，不会把界面挂死）。
 */
export async function loadWasmBase64(): Promise<string> {
  const [a, b] = await Promise.all([import('./zxing-wasm-data.part-1'), import('./zxing-wasm-data.part-2')])
  return a.PART_1 + b.PART_2
}
