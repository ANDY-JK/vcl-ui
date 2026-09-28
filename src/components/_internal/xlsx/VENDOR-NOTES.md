# 仓内 vendor：SheetJS `xlsx@0.20.3`

- **正源**：`node_modules/xlsx`（安装自 `https://git.sheetjs.com/SheetJS/sheetjs` 的 npm 发布物；SheetJS 不发 registry，
  0.20.3 那条依赖原本写成 `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`）
- **许可**：Apache-2.0（全文见同目录 `LICENSE`，随本库分发时按 Apache-2.0 §4 保留）
- **为什么在仓里**：装机器不再需要访问 `cdn.sheetjs.com`，且不再绕过 registry 审计留下盲区
- **别手改**：`xlsx.mjs` / `types.d.ts` / `LICENSE` 与 `VENDOR.json` 登记的字节必须逐字一致，
  校验＝`node scripts/vendor-sheetjs.mjs --check`（整链里的 `check:vendor-data` 会跑）
- **换版**：升级后重跑 `node scripts/vendor-sheetjs.mjs`（要能访问上游 tarball 装一次），
  再跑整链——许可清单 `dist/THIRD-PARTY-LICENSES.md` 里的版本与 sha 会跟着变

| 仓内文件 | 上游路径 | 字节 | sha256 |
| --- | --- | --- | --- |
| `xlsx.mjs` | `xlsx.mjs` | 1,008,308 | `1a0fb062ee9781b1…` |
| `types.d.ts` | `types/index.d.ts` | 27,917 | `191e4e6aceae3602…` |
| `LICENSE` | `LICENSE` | 11,355 | `4d2a38ac35cda06a…` |

代码内的版本标记 `XLSX.version` ＝ `0.20.3`（与 package.json 的 0.20.3 同值才算搬对）。
