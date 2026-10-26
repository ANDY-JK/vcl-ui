# 技术债台账

> **跨轮次的债登记表。** 审查报告是一次性的（当时快照），这里记的是**长期有效**的已知妥协。
>
> 规矩：
>
> - **只登记核实过的**——写进来就要有 `file:line` 或可复现命令，不许"听说"。
> - **`accepted` 必须写复核触发条件**——否则"接受"会变成"遗忘"。
> - **修完不删行，改状态为 `closed` 并写明提交**——保留历史，否则下一轮会重新"发现"它。
> - 每轮审查/大改后回来更新一次。
>
> **闸口**：`npm run check:tech-debt`（整链第 31 步）。它校验：① `closed` 的提交号真实存在；
> ② `accepted` 必须写「触发条件」；③ 两张表的列数/编号/级别/状态合法且编号唯一；
> ④ **陈旧度**——台账最后被改的提交之后，动过 `src/` 的提交数不得超过 5；⑤ ADR 索引与文件一一对应。

## 字段说明

| 字段 | 含义 |
| --- | --- |
| 编号 | `TD-NN`，只增不复用 |
| 级别 | P0 致命 / P1 高 / P2 中 / P3 低 |
| 状态 | `open` 待修 · `accepted` 有意接受（须写触发条件）· `deferred` 推迟到指定版本 · `closed` 已修 |
| 引入 | 引入该债的提交（能查到就写） |
| 目标 | 计划偿还的版本/时点 |

**`accepted` 的写法**：`触发条件：…… → 那时……`。闸口会检查目标列里含「触发条件」四字，否则判红。

**`closed` 的写法**：提交列必须是**真实存在**的哈希（闸口用 `git cat-file -e` 校验）。
`accepted` 项**留在「当前未结项」表里**（它们是"有意接受的未结项"，不是已修）。

---

## 当前未结项

| 编号 | 一句话 | 证据 | 级别 | 状态 | 目标 |
| --- | --- | --- | --- | --- | --- |
| TD-24 | **部署形态未定**：A 用户自有后端调 API / B 随库附 BFF / C 未定。已按 A 推进（REST 契约 + 参考后端 + 两套存储），但 B 需要的 BFF 层没做——若最终选 B，这层是净新增工作量 | 契约与样板见 `docs-site/guide/lowcode.md` §3、`examples/lowcode-backend/`；需求方**多次追问未答复** | P2 | `open` | 目标：**需求方答复后**。选 A → 把 `baseUrl` 与令牌接上即可（已有 `createRestFormStore`）；选 B → 需新增 BFF 层 |
| TD-22 | **`node:sqlite` 是 Node 实验性 API**：仓储层 import 时会打 `ExperimentalWarning`（已由噪音棘轮的"Node 运行时告警"豁免规则接住，不影响闸口），但 API 形态仍可能变 | `examples/lowcode-backend/sqlite-store.mjs:34`；豁免规则见 `scripts/check-console-noise.mjs` 的 `NODE_RUNTIME_WARNING` | P3 | `accepted` | 触发条件：要把参考后端的 SQLite 用在生产，或 Node 把该 API 标稳定 → 那时要么锁 Node 版本，要么换 `better-sqlite3`（同样 11 个方法体） |
| TD-25 | **`check:vendor-vulns` 的离线兜底只看本地缓存**：缓存文件在 `reports/`（gitignore），CI 若无网且无热缓存仍会红；兜底结果最长可能有 7 天延迟 | `scripts/check-vendor-vulns.mjs:27`（`MAX_AGE_DAYS = 7`）；四场景自测见审查报告 #164 | P3 | `accepted` | 触发条件：要在无网 CI 上跑整链 → 那时把该步拆成"必须联网"的独立流水线，或把缓存提交进受控的 `ci/` 目录 |
| TD-26 | **`silent-error-states` 棘轮只判"模板里有没有这个名字"，判不了可见性**：把渲染条件改成 `v-if="false"` 时棘轮仍绿（名字还在模板里） | `tests/unit/silent-error-states.spec.ts:47`（`REVIEWED` 清单与判据说明）；该局限已写进报告 #165 的负向对照 | P3 | `accepted` | 触发条件：出现一例"名字在模板里但条件恒假/被 CSS 隐藏"的真实缺陷 → 那时把判据升级为渲染后节点存在的行为级检查（或直接靠行为测试覆盖） |
| TD-27 | **台账陈旧度用"提交数"近似"轮次"**：口径是"台账最后被改的提交之后，动过 `src/` 的提交数 > 5 就判红"。提交频次不等于轮次，纯文档轮也会推高计数 | `scripts/check-tech-debt.mjs`（`STALE_SRC_COMMITS`）；本次盘点实测：台账最后更新 `d51dcfc` → 其后 **82 个提交、13 个动过 src** | P3 | `accepted` | 触发条件：阈值出现误报/漏报（如一次大重构跨 10 个提交但台账确实不该动）→ 那时改按"审查报告新增行数"或日期窗口计算，或给 `--stale-limit` 常态化豁免 |
| TD-04 | **`check:console-noise` 依赖 spool 文件**：手动跑过 `check` 而未跑 `test:unit` 会读到空 spool | 空采集守卫已加并按**过滤前**类别数判定（第 108 轮修正）；但**执行顺序仍然脆弱** | P3 | `accepted` | 触发条件：再次出现"0 类误判"或 spool 被外部清理 → 改为 `check` 内部强制先跑单测 |
| TD-05 | **性能闸口在慢机器上只能"未判定"**，无法区分真回归 | `scripts/bench.mjs` 的 `CALIBRATION_TOLERANCE`；实测同代码连跑 6 次 ×1.06–2.75 | P3 | `accepted` | 触发条件：需要严格性能门时 → 上 CI 固定机型或容器化 benchmark |
| TD-07 | **`docs/` 与 `docs-site/` 是两套叙事**，只有后者进站；前者的审查报告不进站也无法被站内搜索 | `docs/*.md` 共 8 份，`docs-site/` 不含它们；`check:facts` 刻意不扫 `docs/` | P3 | `accepted` | 触发条件：需要对外披露审查过程时 → 择要进站，不必全量 |
| TD-08 | **历史审查报告保留当时数字**，与 `facts.md` 的当前真源必然不一致 | `check:facts` 不扫 `docs/`（脚本内有注释说明） | P3 | `accepted` | 触发条件：有人把历史报告当"当前事实"引用 → 在报告头部加过期横幅 |
| TD-09 | **`walk()` 类工具函数的目录排除曾按整路径匹配**，导致体积预算只看 9% 文件 | 已修（`scripts/verify-pkg.mjs` 按 basename 判）；**同类写法可能还有** | P3 | `accepted` | 触发条件：新增任何目录遍历脚本时 → 用 basename 判，并写负向对照 |
| TD-29 |**`FormCollect.vue` 已贴住域止涨线**：改动后一度 818 行 > 810 被 `check:constants` 拦下，抽出冲突识别函数后 805 行（余量 5 行 / 0.6%），下次再动它会立刻触线 |`src/components/form-builder/FormCollect.vue`；`scripts/check-constants.mjs` 的 [7] 行数止涨线（form-builder 域 810） |P3 |`open` |触发条件：下一次要改 `FormCollect.vue` 时 → 先把审核提交（`handleRecordSubmit` + 记录弹窗状态）、导入（`onImportFile` 三条链）、导出（Excel/CSV）各抽成一个 composable，再改功能；抽完把止涨线降到实测值|
| TD-30 |**「连自定义后端」只验到"连上 + 读到自报的数"，没验"写进去"**：e2e 覆盖了探活/断开/坏地址不发请求，但"连上后提交一条记录 → 断连重连仍在"这条写入闭环没有端到端用例（写入路径本身在上位 e2e 里对**内置演示后端**验过） |`tests/e2e/lowcode-backend-connect.spec.ts`（2 例，均只读）；`src/demos/lowcode/useBackendConnection.ts`；参考后端已支持全部写路由 |P3 |`accepted` |触发条件：下一次动演示站（或用户真的要接自己后端）时 → 补一条 e2e：连上 → 在设计器存一份表单/提交一条记录 → 断开 → 重连 → 数据仍在；顺手把 `__stats` 两份数与界面显示对账|

## 已结项（保留历史）

| 编号 | 一句话 | 修法 | 提交 |
| --- | --- | --- | --- |
| TD-28 |**官方 `createRestFormStore` 没用 `rev`**：并发保护只到数据层，宿主得自己在 body 带 rev，409 也没人处理 |读时记版本（`listForms`/`loadRecords` 填缓存）→ 写时自动带上 → 409 抛 `RestStoreConflictError`（带 `currentRev`）；需要覆盖语义的传 `onConflict: "retry"`（重读后重试**一次**，仍冲突照抛）。默认**不自动重试**：静默重试等于回到"后写覆盖"。**读到过才带**，老后端行为不变 |af6767b |
| TD-23 |**参考后端没有迁移体系、没有并发控制**：示例是「后写覆盖」，多端同时编辑同一表单会互相盖掉；表结构变更也没有版本化迁移 |加 `schema_version` + 只增的 `MIGRATIONS`（v2 给两表加 `rev`），打开库自动升级、每版一事务、失败回滚且带 `cause`；写接口接受可选 `expectedRev`，不一致抛 `ConflictError` → **409** `{ error: "conflict", currentRev }`（不带 rev 仍是后写覆盖，老客户端不受影响）。用例手写一个 v1 老库验证「升级后数据不丢」，并验两版 rev 语义一致 |4e7e8c0 |
| TD-00 | **台账维护本身没有闸口**，靠人记得更新，而"记得"最不可靠 | 建 `scripts/check-tech-debt.mjs` 并接入整链（校验 closed 提交号可查 + ADR 索引一一对应）。**第 110 轮盘点时的实际情况**：闸口确实存在，但 ① 只查这两项、② 台账本身已 **82 个提交 / 13 个动过 src** 未回填 —— 说明"有闸口"不等于"台账会更新"。故本轮追加三项判据（结构、`accepted` 必须写触发条件、陈旧度），并把该缺口另立为 TD-27 跟踪口径 | b3adb44 |
| TD-21 | **一类用户可见缺陷："错误状态被赋值、模板从不渲染"**：`FormCollect` 导入失败（空文件/坏 JSON/写库失败）在界面上毫无反馈 | 渲染 `importError`（`role="alert"`）；三条用例改断言渲染文本；新增类级棘轮 `tests/unit/silent-error-states.spec.ts`（候选集 ⇄ 已分诊清单双向比对） | 7755854 |
| TD-20 | **整链唯一联网门禁在网络抖动时把整链判红**（两轮共 3 次，第 13 步一断其后 19 步不执行） | 加"上次成功结果缓存"：只存完整成功、按 `包名@版本` 做键、7 天上限、超期/无缓存照旧红；四场景自测 | 7086937 |
| TD-19 | **单测池 `vmThreads` 并发串台**（Vite 转换缓存被多 worker 共用 → `.vue` 主模块与 `?vue&type=style` 子模块串台），全量 9 次跑出 4 次红，假红最高 185 例 | 换 `pool: 'forks'`（7 次全绿，代价 +27s）；`check:coverage-domains` 复验不降 | 2e9ceae |
| TD-10 | **P0：真实客户业务预设 + 明文口令默认值随包分发**（公司名/人名/门店资料/表单预填密码） | `store-report.ts` 全量脱敏为示例数据；另发现并转换 **57 条真实门店记录**（含 41 个真实手机号）；加 6 条守护测试 + 阴性对照 | 37ede8b |
| TD-11 | **JSON 图标数据的 `.d.ts` 内联整份字面量类型**（570 KB + 236 KB = 806 KB 纯浪费） | `vite-plugin-dts` 的 `exclude` 加 `**/*.json`；两处消费点本就显式收窄 | 92f0959 |
| TD-12 | **`html2canvas` 常驻 `dependencies`，而唯一导入路径是动态 `import()`** → 消费者白装 3.3 MB | 移到 `peerDependencies` + `peerDependenciesMeta.optional`（与 `echarts` 同一先例） | b3adb44 |
| TD-13 | **体积闸口 91% 盲区**：`walk('dist')` 只看到 36/420 个文件 | 目录排除改按 basename 判；修复后可达性从 20→46 | 92f0959 |
| TD-14 | **性能闸口假阳性**（四轮迭代） | 阈值 2.2 → median 比对 → 可守护门槛 → 二次确认 → **算力校准环境门** | 97e9cad |
| TD-15 | **可观测性 API 建好但只有 2 处在用** | 升级 13 个失败点为结构化事件（2→15 码）+ 生成 `observability.md` | 97e9cad |
| TD-16 | **`check:console-noise --no-run` 空 spool 静默判绿** | 加空采集守卫，0 类判红并给出正确操作顺序 | 97e9cad |
| TD-17 | **口径三处不一致**（域数 14 vs 13、组件 60+ vs 65） | 建 `facts.md` 生成物 + `check:facts` 双查（漂移 + 正文数字冲突） | d35b783 |
| TD-18 | **破坏性变更只有摘要、没有迁移指引** | 建 `migration-2.0.md`；`check:release-consistency` 加"有 BREAKING 段就必须有迁移页" | 1b6f83f |
| TD-02 | DataTable.vue 2822 行，止涨线 2950，余量 128 | 矩形选区指针编排（163 行含 12 个模块级可变变量与 7 个 document 监听器）下沉 useRangePointer；2822 → 2688 行，止涨线收到 2760；下沉前补了 6 条覆盖鼠标拖选的测试 | 8d74c64 |
| TD-03 | 覆盖率最低的域是 form（语句 56.4% / 分支 52.4% / 函数 52.3%） | **实际最洼的是 login**（`forgot-*.vue` 215 行/19 函数、`portal_login.vue` 194 行/12 函数完全零测试）。补 26 条行为测试，login 域 → 80.3/70.9/61.2；补测中发现真缺陷：portal_login 没有防重复提交 | 880cdc4 |
| TD-01 | 主 CSS 体积口径错误（只看未压缩 345.6 KB） | 改双轨（gzip 60KB / raw 420KB 双守 + 域 CSS 30/220）；**顺带发现主 CSS 预算一直静默失效**（`/dist/vcl-ui.css$` 要求前导斜杠，而 walk 返回相对路径） | 922b194 |
| TD-06 | **`--no-run` 与整链的耦合**：整链里 check:console-noise 曾自己跑一遍全量单测，同一轮跑两次 | package.json 的 check-console-noise 已带 `--no-run`，复用第 15 步的 spool；实测该步 0.7s | c304666 |

---

## 与 ADR 的分工

- **本台账**记「**已知的坏**」——欠着没做的、有意接受的妥协。
- **[ADR](adr/)** 记「**当初为什么这么定**」——已经做完且不打算改的决策及其权衡。

一件事可能同时出现在两边：ADR 说"决定这样做"，台账说"这个决定的代价是 X，我接受/待偿"。
例：ADR-001 定了依赖三档制，TD-12 记着"`html2canvas` 档位当初放错了"。

## 怎么用这张表

1. **接手项目**：先读本表的 `open` 项，那是已知的坑；再读 `accepted`，那是"看着像坑但有意为之"，别去"修"。
2. **改代码前**：搜一下要动的文件有没有对应 TD 编号，有的话先看触发条件是否已满足。
3. **每轮审查后**：把新发现且核实过的加进来；把已修的移到 `closed` 并写提交号，然后跑 `npm run check:tech-debt`。
