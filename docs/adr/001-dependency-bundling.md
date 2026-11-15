# ADR-001：依赖打包策略——external / 打进包 / vendor 落仓 三档制

- 状态：已接受（2026-09-30 起文；决策实际形成于 2026-09-20~09-28 的多轮 PoC 与审查）
- 决策人：维护者
- 关联：README《依赖选型记录》、`scripts/gen-third-party-licenses.mjs`、`scripts/check-vendor-data.mjs`

## 背景

组件库把依赖分发给下游时，每一件都有三个互斥的去处：保持 external（宿主自装）、打进产物（bundled）、或整份搬进仓（vendored）。选错档位的代价是静默的：external 档让宿主多装、版本漂移；bundled 档有许可声明义务；vendored 档会脱离 npm 审计与自动升级。此前这些选择散落在 rollup external 表、README 选型记录与审查报告三处，没有一个单一事实源，新依赖进来时容易「按能跑就 external」惯性演进（2026-09-28 审查 F1 即由此起）。

## 决策

依赖按下列三档归类，档位选择以「运行期可用性 → 许可义务 → 审计覆盖」顺序裁定：

1. **external（宿主自装）**：框架本体（vue / vue-router）与宿主大概率已有的生态件（echarts 系、@lucide/vue、@iconify/vue、morphicons、zxing-wasm 的 JS）。判据：宿主必装或该领域惯例 peer；打进包反而制造双实例（Vue 上下文断裂类故障）。
2. **bundled（打进产物，随包声明许可）**：能力型小件（vue-i18n、jszip、qrcode、html2canvas）与随包数据件（图标几何数据、zxing 解码 wasm、SheetJS）。判据：库自带能力不应强迫宿主感知其存在；每件必须进 `dist/THIRD-PARTY-LICENSES.md` 并过 `check:licenses` 双向对账。许可白名单：MIT / Apache-2.0 / ISC / CC-BY-4.0（数据）；copyleft 命中即红、需人工裁决。
3. **vendored（整份搬进仓）**：仅当上游发布通道不可靠且运行期取件不可接受时启用。现有两件：SheetJS xlsx 0.20.3（npm registry 停更，改走 cdn.sheetjs.com 会破坏离线装机；逐字节落仓 + `VENDOR.json` 登记 + `check:vendor-data` 逐字节对账）、zxing-wasm 的解码 wasm 二进制（默认 locateFile 联网取件，断网即挂；按原字节 base64 内联，sha256 四路对账）。vendored 件的升级是人工动作：重跑生成脚本 + 整链验证，不再被 `npm update` 自动带走——这是买断审计确定性的代价，接受。

配套约束：任何新依赖进来必须先落档位决定（改动 external 表或进许可清单），`check:licenses` 的「外部件没声明 dependencies/进包件不在运行期闭包」双向对账会把漏登记卡在 CI；构建期环境变量进产物由 CI canary 步骤证明不发生。

## 后果

- 正：离线/内网可装机；随包件有 SBOM 片段与许可全文；vendored 件字节固定可审；漏登记依赖在 CI 即红。
- 负：仓内多 1.0MB 上游代码；SheetJS/wasm 升级需人工重搬重生成；html2canvas 等停更件随包分发，替代评估挂 v3 议题（见 README 选型记录的 re-evaluate 条件）。
- 复核触发条件：SheetJS 恢复 npm 发布、modern-screenshot 修复 `:root[data-theme]` 捕获、zxing-wasm 改为自带离线 wasm——任一发生应重开本 ADR 评审对应档位。
