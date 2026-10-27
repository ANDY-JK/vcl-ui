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
| TD-31 |**`clearRecords` 的条数护栏库不自动带**：后端支持 `DELETE /records/{key}?count=N`（条数不符 → 409），但库的 `clearRecords` 只在"读全过记录"时才可能知道准确条数，没读全就替你猜会让清空莫名其妙 409 —— 所以库故意不带，护栏留给需要它的宿主显式传 |`src/components/form-builder/designer/rest-form-store.ts` 的 `clearRecords`（注释写明为何不带）；`tests/unit/rest-form-store-rev.spec.ts` 有一条断言"清空就是裸 DELETE、不加 count"；后端侧见 `examples/lowcode-backend/README.md` 路由表 |P3 |`accepted` |触发条件：出现一例"清空时把并发写入的记录一起抹掉"的真实反馈 → 那时让 `loadRecords` 记下每个 key 的**已读全**标记、只在读全时带 `count`，或给 `clearRecords` 加显式的 `expectedCount` 参数由宿主传入|
| TD-32 |**两条 e2e 偶发 flaky（重试即过）**：`icon-color-picker`（取色器收到解析后的主题色）与 `print-media`（打印时缩放归位为 -1）在本轮整链里各偶发红一次、重试均通过；两者都是**时序敏感**：前者等的是异步回填的主题色，后者等的是打印前的一次布局结算 | 整链第 31 步 e2e 留痕：`reports/quality-check-logs/` 里 `2 flaky / 98 passed`（重试全过，未掩盖真实失败） |P3 |`accepted` |触发条件：同一条用例在**连续三轮**整链里各偶发红一次（**第 150 轮新增观察**：`site-audit.spec.ts`「全站逐页交互」重试后通过 —— 单次 4.5 分钟的全站遍历最吃 CPU，机器整体变慢时它第一个超时；这是它的**第 1 次**，另两条仍是 0 次） → 那时查它的等待条件（多半是 `toHaveCount`/`toBeVisible` 缺少状态收敛判据），改成等待具体状态而不是"轮询一次"；在此之前它们重试即过，不阻塞闸口 |
| TD-35 |**`events.onFocus` 有类型、有导出，但运行时没有触发链路**：`useFormEvents.handleFieldChange(field, trigger)` 只接受 `change` / `blur`，`FormBuilder.vue` 的四处在 `@change` 与 `FormFieldGroup` 的转发也只派发这两个；`FieldEvents.onFocus` 类型存在、设计器面板原来也提供开关，但打开后**什么都不会发生** |`src/components/form-builder/useFormEvents.ts`（`trigger: "change" ‖ "blur"`）、`designer/types/to-schema.ts`（曾导出 events.onFocus）、`designer/PropsEventPage.vue`（曾是面板里的"获得焦点"卡片） | P3 | accepted | 第 131 轮已把**面板开关与 to-schema 导出移除**（不再往 schema 写无效数据），`FieldEvents.onFocus` 公开类型保留（手写 schema 仍可声明）。**待办**：真要做 focus 动作，需 ① 渲染层把 `@focus` 派发到 `handleFieldChange(field, "focus")` ② 扩展触发器联合类型 ③ 恢复面板卡片与 to-schema 导出 ④ 把 `designer-props-event-page.spec.ts` 里"运行时只有 change/blur"那条用例改成正向断言。**触发条件**：用户提出需要"聚焦时联动/取值"类需求，或有人反馈手写 `events.onFocus` 不生效 |
| TD-41 | **`toggleVisible` 改造后无法表达"有值时隐藏"**：第 139 轮把它从「每事件翻转」改为「值驱动」（有内容→显示、清空→隐藏），修掉了逐键 change 导致的奇偶抖动；代价是**反方向不再可达**——旧语义在单选/复选这类单次事件控件上可以做到"选了就隐藏目标字段" | `src/components/form-builder/useFormEvents.ts`（`isFilled` 与 `toggleVisible` 分支）；类型契约写在 `src/components/form-builder/types.ts` 的 `targetField` 注释 | P3 | `accepted` | 触发条件：出现需要"有值时隐藏"的真实 schema 需求时，给 `FieldEventAction` 加 `invert?: boolean` 并在设计器事件页提供开关（含 `toSchema` 映射与用例）；在此之前不要再往这个动作上叠加隐式语义 |
| TD-42 | **全库 `<button>` 普遍未标 `type="button"`**（本轮实测 230 处裸 `<button`，仅 36 个文件标了 type）：HTML 默认 type 是 `submit`，宿主把带按钮的组件放进自己的 `<form>` 时，**点按钮就把表单提交了**。本轮只修了风险最高、且已有可对照实现的分页页脚（页脚翻页是高频操作），其余（DataTable 工具栏、筛选、列设置，FormCollect 分页，ChartTable 开关等）未动 | 实测命令：`git grep -n "<button" -- src/components` 后排除含 `type=` 的行，共 230 处；已修示例 `src/components/data/DataTablePagination.vue`（三处按钮）；对照实现 `src/components/nav/Pagination.vue`（本就带 type） | P2 | `accepted` | 触发条件：① 收到"点表格按钮后页面刷新、表单被提交"的反馈；或 ② 某组件开始被放进 `<form>` 内使用。届时按文件批量补 `type="button"`（机械修改，配合渲染快照用例核对 DOM 不变） |

## 已结项（保留历史）

| 编号 | 一句话 | 修法 | 提交 |
| --- | --- | --- | --- |
| TD-33 |**性能闸口在本机贴着阈值，两轮整链被误判为回归**：算力校准基线（33.9ms）是空载时测的，实测 45–54ms（×1.32–1.59，阈值 ×1.6）—— 一旦过 1.6 环境健康门就完全不再判回归，没过 1.6 又丝毫不折算；同一场景实测 31.77 / 12.11 / 14.97ms，抖动本身 ×1.5~2.6 |**触发条件（同一场景连续两轮整链超阈）在第 148/149 轮满足**，按台账自己写的修法执行：判定改为 `现在 > 基线 × RATCHET × calRatio`（`calRatio` = 本次校准 / 基线校准），报告**同时打印原始比值与折算后比值**并说明扣掉了多少 —— 折算只是扣掉机器整体降速，不是藏起来。决定性证据：同一台机器同一份代码 **11 个场景全部变慢**（×1.76~4.13，连 0.0021ms 的纯算术归一化都 ×2.14），而算力探针只报 ×1.42 —— 纯算术循环跑得短、吃 turbo，**低估了内存/GC 敏感场景的降速**。负向对照：把排序场景工作量真放大 4 倍 → 原始 ×9.79、折算后 ×8.79 → 仍判红并点名 | 207a695 |
| TD-45 |**`check:rtl-semantics` 遇到浏览器中断会带着栈回溯崩掉**：`posOf()` 只有 `finally` 没有 `catch`，Chromium 被系统回收时 `page.goto` 抛 `Target page, context or browser has been closed` → 整条闸口崩，既没报告"哪些探针验过"，也没机会跑那 5411 个元素的扫描；输出只剩栈回溯，读的人分不清"代码有问题"还是"这次没测成" |`posOf()` 加 catch 并返回结构化结果（`ok`/`missing`/`error`）；探针 SKIP **区分原因**（`页面打不开` vs `元素不存在`）；扫描循环的 `ctx.close()` 与收尾 `browser.close()` 加 `.catch()`；新增 `RTL_SCAN_LIMIT`（默认全量、生效即打印醒目提示）。回归守卫 `tests/unit/rtl-gate-robustness.spec.ts` **分两层**：默认 4 例静态断言（毫秒级，不启浏览器），行为级 4 例需 `RTL_GATE_BEHAVIOR=1`（真跑闸口，11.3s）—— 起初把行为级放进 `test:unit` 直接害得 `chart-wordcloud-degrade` 与 ZIP 导出两条被 CPU 争用拖过超时（去掉后 5425 例全过 / 120s）| e10987e |
| TD-44 |**删一个已经不在的表单也报"已删除"**：存储层 `deleteForm(id): Promise<void>` 找不到目标就静默 `return`（不抛错）→"被别人删掉了"和"真的删掉了"返回值一样，`useFormManager.deleteForm()` 一律提示成功。多标签页/多人共用后端时表现为"删成功了，刷新又回来" |删前先 `listForms()` 查索引，目标不在就不调存储层、提示「该表单已不存在（可能已被其他窗口删除）」并返回 `false`；补 2 例 + 负向对照 4/4。**残留**：根治要让存储层返回"删掉几个"而非 `void`，本轮先用查索引绕过 | a7be455 |
| TD-43 |**重命名没生效却提示"已重命名"**：`renameForm` 用 `trim()` 回落原名兜底不写空串（正确），但无论是否真改名都提示成功 → 空白名/只加空格时名字没变、界面说改成功了 |先算 `next`，`next === item.name` 时不写库、提示「名称未变化（不能为空）」并返回 `false`（调用方保持弹窗让用户重填）；契约从"回落原名再写一遍"改为"名没变不写库"，同步更新旧用例并写明原因；负向对照 5/5 | a40751d |
| TD-30 |**「连自定义后端」只验到"连上 + 读到自报的数"，没验"写进去"** |补 e2e 写入闭环：连上 → 导航里出现**库中表单派生**的表单项 → 点开的是后端那份设计 → 提交 → 后端自报记录数 **+1** → 断开重连**仍在**。过程中它又抓出两个真缺陷（读远程写本地、面板显示陈旧数字）并顺带修了共享库导致的跨用例污染（旧断言写死绝对条数 → 改断言增量） |d01b061 |
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
| TD-36 |**`StoreFormModal` 三处静默毁数据**：① `watch(props.visible)` 缺 `immediate`，以 `v-if`+静态 `visible` 挂载时表单永不回填，保存会用空值覆盖原门店；② `v-model.number` 清空给 `""`，`?? null` 兜不住 → 库里出现 `longitude: ""`（类型是 number 或 null）；③ 校验红字只置 true 从不清，填上后仍提示「至少填一个」 |watch 加 `immediate`；新增 `toCoord()` 把 `""`/NaN 收敛成 `null`，`coordSource` 判定改 `!== null`（与 `isValidLatLon` 只拒绝 (0,0) 同口径）；错误提示改为 `submitAttempted && bothNameAndAddressEmpty` 派生状态。补首个单测套件 34 例，负向对照 4/4 | a2096bb |
| TD-37 |**`ProgressBar` 退化输入静默产坏值**：`modelValue` 越界滑块飞出轨道（`width:200%`）；`percent` 坏值时文本与填充自相矛盾（`NaN%` 配 0% 的条）；**`step=0` 让拖拽/键盘/输入全部卡死**；`max<=min` 区间塌缩且 `aria` 报的范围与能按到的范围不一致；轨道零宽产生 `Infinity`；数字输入 `abc` 被 `snapToStep` 当成 `min` 静默存入 |`clampRaw`+夹紧；文本与填充同口径（坏值当 0）；`safeStep`（非正/非有限退回 1）；`safeRange`（塌缩退回默认跨度）并让 `aria-valuemin/max` 跟随生效区间；`posToValue` 判零宽；非数字/空串不提交。补 48 例，负向对照 7/7，覆盖 55%→88% 语句 / 35%→86% 分支 | 8848569 |
| TD-38 |**`Image` 让键盘/读屏用户吃亏**：恒为 `role="img"` 却挂 `tabindex=0` 且回车能开预览（角色与可操作性矛盾）；无 `src` 仍渲染 `<img src="">`（空 src 被当成当前文档地址再请求一次，且永等不到 load/error → 占位符永久挂着）；失败后 `<img>` 与 `failed` 并存 |`role`/`tabindex`/`class` 由 `canPreview` 派生（按库内惯例用 `role="button"`）；空串与纯空白都视为无地址，不渲染 `<img>` 也不观察；失败时摘掉 `<img>`。补 34 例，负向对照 8/8，覆盖 55%→79% 语句 / 48%→85% 分支 | 8fb759b |
| TD-39 |**`ModalBox` 的 form/select 内置「取消」从不 emit `cancel`**：两个内置取消按钮只走 `close()`，而 confirm 模式会 emit `cancel`、类型注释也写着 `cancel: 点击取消 / 关闭` → 宿主写 `@cancel="丢弃草稿"` 时只有 confirm 生效、表单静默不生效 |抽出 `cancel()` = `emit('cancel')` 后 `close()`（顺序刻意 cancel 在前，宿主在 cancel 里还能读到未关的现场）；补五个模式的事件契约 36 例，负向对照 8/8，覆盖达语句/分支/函数 100% | 71bcaae |
| TD-40 |**提交失败后「重置表单」不丢弃幂等键**：键只在提交成功后轮换、失败一直挂着等重试；用户失败后点「重置」改录新记录时，新记录**带着旧键**出去，服务端若去重会当成「上次失败的重复」直接返回旧结果、不创建新记录，客户端还提示「提交成功」（静默丢数据）。`handleReset()` 重置了数据/错误/步骤/草稿却唯独没管这个键，也没有任何清键接口 |`useFormRemote` 新增 `resetIdempotency()`（语义=这次提交不要了）并加入返回；`handleReset()` 首行调用；`defineExpose` 增加该项供宿主自行重置时用（须排在 `useFormRemote` 解构之后，否则 TDZ）。补 9 例含端到端「失败→重置→再提交键必须不同」，负向对照 4/4 | 25a4490 |
| TD-34 |**标签页键盘导航在"受控值失效"时 `ArrowLeft` 跳过末项**：当 `modelValue` 指向一个已不在 `items` 里的值（页签随权限/数据重建导致），`findIndex` 得 -1，环绕公式 `(currentIdx - 1 + len) % len` 算出 `len - 2` —— 往左跳到了**倒数第二项**，而自然的"往回绕"应落在末项。`ArrowRight` 的 -1+1=0 恰好正确，所以只有往左这一侧偏 |`ArrowLeft` 改为 `(currentIdx <= 0 ? len : currentIdx) - 1`，与 `ArrowRight` 的 `-1+1=0` 对称；`it.fails` 已翻成正式用例（并补了"只有两项"一例）。依据：用户 2026-10-26 澄清"保护只是防止外部调用方修改（外部改了不会更新库内文档），并不是不能优化完善调整" |c1b53af |

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
