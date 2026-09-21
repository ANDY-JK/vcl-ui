# Changelog

本文件由 `npm run changelog` 从 conventional commits 增量重生成（`--since`），历史版本段原样保留，请勿手改。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [2.0.0] - 2026-09-21

### BREAKING CHANGES

- **通用** v2 契约收敛——DataTable 回调 prop 改事件、多词事件统一 kebab、expose 近义入口收口（Q5/N8/Q18）（aa4a03c）

### Added

- **`scripts`**
  - changelog 生成器支持 BREAKING CHANGES 段 + release:dry-run 显式 npmjs 源（c43f74a）

### Changed

- **通用**
  - v2 契约收敛——DataTable 回调 prop 改事件、多词事件统一 kebab、expose 近义入口收口（Q5/N8/Q18）（aa4a03c）

### Documentation

- **通用**
  - README 2.0 迁移节 + expose 契约收敛标注 + 文档站重生成 + WC 指南事件口径（d0c8b18）

### Tests

- **通用**
  - 适配 v2 事件名与 authResult prop，补 @export 行为锁（5ce7436）

---

生成口径：4 条提交 → 列入 4 条；范围 v1.0.0..HEAD。

## [1.0.0] - 2026-09-21

> 首次发布：以下为全部历史变更。

### Added

- **通用**
  - 全库深审修复收尾，新增 TabPanel/上传内置预览/扫码多码指针（e516cbc）
  - form-builder 低代码平台 + 全库 px→CSS 变量重构 + i18n 词条扩充（889cf34）
  - Vue 通用组件库初始化 - 38+组件/composable，含9大分类、18项优化已完成13项（3262567）
- **`a11y`**
  - axe-core 全站无障碍扫描接入 + 库组件可访问名/配色缺陷修复（c1f704c）
- **`camera`**
  - 连拍「完成」移顶部 + 照片名称（shotNames 计划名/自动编号）（57f86a6）
  - 多张连拍模式——拍完一张接着拍，胶卷回看/重拍某张，完成批量交付（27c8831）
- **`capture`**
  - 采集兜底链落地+审查修复收口+超800行文件拆分（487c084）
- **`ci`**
  - 多入口运行时冒烟闸口 + site-audit 剪贴板权限豁免（37d59e0）
- **`data-table`**
  - 交互体验第二批 — 失败就地提示/撤销重做按钮/F2/number 列呈现/前导零防护（dc372bf）
  - 列值类型归一化 + Excel 交互三件套 + 暗色分色修复 — useTableEdit 拆分（83fc8fb）
- **`demo`**
  - 扫码页真实摄像头识别 + HTTPS 开发证书脚本（b0d2337）
- **`demos`**
  - 补 AmapWidget 演示页与 BaseChart 原始 option 实例（d931dfb）
- **`docs`**
  - 文档站落地（Q9-半）——VitePress + 源码生成器 + 漂移闸口（061ea1e）
  - CHANGELOG 生成链落地（gen-changelog 自建脚本 + npm run changelog）（9bbe385）
- **`form+demos`**
  - 新旧版缺口收口——4 个演示页注册 + Input color 取色 + 设计器 color 字段（e0dcd67）
- **`form-builder`**
  - 设计器面板可调/画布可缩放/拖拽落点可视，补齐弹窗与说明样式（9596959）
  - 设计器布局与交互完善，模板精简为 3 个（6a77000）
  - P1-5 收官——api 型动态默认值补完（b4a08ed）
  - P2 体验四项收官——快捷键面板/card 设计期视觉/设置五分组/设计器草稿自动保存（9b118d6）
  - P1-9 模板库收尾——三业务模板入选择器（10/10）（46de245）
  - 富文本 full 工具栏落地——发文章场景完善（f787229）
  - 条件必填 requiredWhen + 条件禁用 disabledWhen——通用条件模型补全（9795460）
  - 级联选项映射 optionsFrom+optionsMap——承接旧版 DynamicForm 条件选项模式（afd14d7）
  - 画布真·所见即所得 + 模板悬浮预览（376aa25）
  - 分享弹窗升级——短链+二维码 + 记录级查看/审核三模式（e6b1f63）
  - 门店提报 grid+三模式 + 我的表单升级智能表格（操作列分享/查看/审核）（835ca69）
  - DynamicForm 兼容适配——旧版配置(输入框+上传)一行即出表单（67872ec）
  - 门店提报模板——承接旧版 DynamicForm（48 字段 + 26 上传位）（56ea3a6）
  - 模板面板合并——返利函/陈列/合同并入门店收集 + 新增 DynamicForm 动态表单模板（3864058）
  - 目标收集集成低代码闭环——设计器配置 collectType/targets → 发布端按目标收集渲染（e60d07a）
  - 目标收集模式 FormTargetCollect——按门店聚合收集 + 多照片位存储泛化（a461610）
  - 表单级 API 提交链路 submitConfig——审核模式 GET 回填/防抖自动保存/POST 提交 + 返利函/陈列/审批三模板（313c2a5）
  - FormCollect 数据批量导入——JSON/CSV/Excel + 表头反查 + 内容指纹去重（P1-8）（aefbe3a）
  - 高级字段专项校验——richtext 最小字数/signature 必签/matrix 必填行数（P1-7）（98a7887）
  - 默认值动态化——currentTime/currentUser/formula 运行时求值（P1-5）（44df10c）
  - 多表单数据汇总——我的表单「数据」入口 + FormDataSummary 弹窗（P0-②）（0faeae7）
  - 面板字段拖入普通字段支持 before/after 精准定位（P0-④）（e49bc83）
  - 设计期 grid 容器按 span 渲染——所见即运行时所得（P0-③）（3a4bdc7）
  - 表单发布闭环 P0-①——FormShareView 填写端 + 发布链接（8373734）
  - FormDesigner 增强——存储云端化/表单管理/分享码/flex+paragraph + 拆分整改（922ed21）
  - 设计器画布容器交互化所见即所得——tabs 切页/collapse 折叠/steps 步进真实交互 + 拖拽自动落激活槽位 + 大纲树拖拽排序 + 前缀图标/后缀文字属性透传（ed502e7）
  - 多选 + 批量删除（8abeb99）
  - 复制粘贴快捷键 + 字段卡片 aria（64072b1）
  - 新增容器布局预置模板（d3bf67c）
  - callApi 事件动作真发请求（7f61ef0）
  - 操作交互完善 + 容器槽位指派（8c3cc4f）
  - 事件动作落地 + 提交模式 + 容器真实交互（9a956c3）
- **`i18n`**
  - registerMessages 外部项目文案注册——同 key 覆盖/新语言注册 + ./i18n 子路径导出（475f1be）
  - Chart 系列/项兜底命名接入国际化（P2-2 继续）（6e8eacb）
  - ErrorBoundary + BaseChart 接入国际化（P2-2 继续）（d2b3403）
  - MiniLayout 移动端模板接入国际化（P2-2 继续）（583291c）
  - ImagePreview 灯箱接入国际化（P2-2 继续）（5d55ec3）
  - register/forgot-password/AppLayout 接入国际化（P2-2 部分）（b119deb）
  - form-builder 域最终用户文案国际化（2dfa1d1）
  - form 域文案国际化（8 组件 UI 文案清零）（1f8b572）
  - route-planner 域文案国际化（5 组件 94 行硬编码清零）（292bd8b）
  - login 域文案国际化，支持中英文切换（4194528）
- **`icon`**
  - 新增 morphicons 形变 provider — 全量图标可形变动画（a141197）
- **`modal`**
  - useModalManager 支持 scope 隔离（H1）（1c4c585）
- **`quality`**
  - verify:pkg 新增 [6] 体积预算闸口，README 补第 11 条 form-builder ≤800 行规范（9244d72）
- **`scan`**
  - 弹窗多码定格选码 — 冻结画面每码一个箭头图标，点箭头即识别该码（786ee20）
- **`select`**
  - 单选/多选统一格式——tag 展示、直接输入、面板全量三能力对齐（1edac07）
- **`storage`**
  - 新增 S3 兼容对象存储后端（缤纷云 Bitiful），替代不可达的 Supabase（aa171c9）
  - 新增统一存储门面 storage API，按意图自动路由后端（392e5b9）

### Changed

- **通用**
  - 多入口构建（Q3）——14 域独立 entry，按域子路径运行时隔离（ff542a7）
  - 按业务域拆分 chunk，主 bundle 降 90%（H12）（b1b6163）
  - Solar 图标数据改为按需加载，拆出主包（755c9e9）
  - v1.5.0 大规模重构 - 高德地图统一模块/测试扩充/ESLint+Prettier+Husky/Playwright E2E/文档更新（450bc13）
  - 删除 styles/ 和 router/ 目录，global.css 拆分为 components/tokens.css + demos/site.css，router 移入 demos/（7281272）
  - 删除多余的 composables/ 目录，useTreeFlatten 移入 _internal/，删除无用的 useSlider.ts（a800263）
- **`architecture`**
  - 打破 ConfirmModal ↔ ModalBox 值循环 —— 抽 ConfirmContent 单一来源（0e21e8c）
- **`chart`**
  - Chart/BaseChart 消除 20 条 any（P2-1 继续）（2350f04）
  - ChartTable 的 DataTable 改动态加载（M15）（19e9639）
- **`constants`**
  - 第 [6] 条判定补三处漏判口子并给登记表加双向对账（5d32998）
  - 新增第 [6] 条判定——原生取色器 input 的值必须经归一（07fbf9e）
  - 新增 Toast 停留时长常量，补齐第 6 条判定登记落点，改写 createField 实测口径（f7d16ad）
  - [4] 判据加硬（数字 separators/算式/多参数/模板内联都拦），并清掉它漏掉的 3 处（cc7bf70）
  - 闸口加第 [4] 项「延时不写字面量」，库代码 24 处延时全部命名并去掉重复（c2198c3）
  - 断点单源接线 + 新增 check:constants 闸口（394dd8b）
- **`coupling`**
  - 统一图标映射 + 消除 demo 双写 + z-top 幂等（M5/M17/M11/L6）（79a3a06）
  - 收敛版本常量/重复逻辑/共享类型（H10/L4/L3/L2/M4/L7）（161dc13）
- **`data`**
  - DataTable 拆分——四区块组件化 + 纯函数外移，3361→2785 行，导出面零变化（b523f68）
  - 数字列排序走快速比较（localeCompare 慢 ~100 倍）（ff22e16）
  - 组件内 Toast 通知收敛到 useToastNotify（复用）（19b2cc1）
  - 全局搜索 1561ms → 12ms（129 倍），死代码清理（5ce48a2）
  - useTablePersistence 特性注册表驱动（H13）（54d54a6）
- **`data-table`**
  - 总页数公式两处内联合一，退化入参口径写进注释与断言（24214b0）
  - 卡片补批按实测间距换算，退出全屏改等容器宽度停下（56c8c6f）
  - 无 maxHeight 的大表格按实际滚动源开虚拟窗口（d3bf9fe）
- **`demos`**
  - 扫码渐变卡三态尺寸恒定 — 入口/相机/停止条/报错行共用槽位，结果列表移出卡外（865c6ac）
  - 内嵌扫码卡对齐 saas 小程序样式 — 主色渐变卡+入口按钮态/相机嵌卡态（f1543c4）
- **`form`**
  - Select 拼音搜索改用共享 createPinyinMatcher（复用）（1e7cc3d）
- **`form-builder`**
  - FormDesigner/DesignerCanvas 拆 composable 回到 ≤800 行纪律 + 行数闸口（9527f70）
  - createField 按类型直查注册表，不再整表翻译一遍再 find（58b76be）
  - 撤销历史按实测代价定深度、补内存预算，并把快照移出响应式（8413b65）
  - 门店收集类四模板收编共享资质字段工厂（store-profile）（51b0bd1）
  - PropsPanel 1527→795——五页签拆子组件（超 800 行约束整改收官）（1dfe197）
  - M4 超标清零扫尾——FormBuilder/FormCollect/DesignerCanvas 全部 ≤800 行（e00fab1）
  - M3 组件瘦身——FormCollect/FormBuilder/SavedFormsDrawer 样式外置 + FormBuilder 逻辑下沉三 composable（bdf2562）
  - M2 designer/types.ts 目录化——domain(模型+树操作)/to-schema(Schema 转换) + index 重导出（2abb913）
  - M1 机械拆分——i18n formBuilder 域拆二 + designer.css 按区域拆模块（行为零变更）（b62e3ec）
  - FormRenderer 拆分——7 高级字段组件化外移至 renderer/，1175→459 行，护栏先行零回归（43dcd09）
  - unregisterField 移出公共导出（H8 剩余）（0f3fddc）
  - PropsPanel 通用属性白名单改注册表驱动（M1）（9f2740c）
  - fieldRegistry 成为字段类型单一事实源（H6/H8）（237537d）
- **`form-builder,chart`**
  - 同一事实各写一遍的常量收单源；目标收集导出加列名撞车防护（0e30622）
- **`i18n`**
  - ./i18n 声明落稳定路径 dist/i18n.d.ts（Q13 收口）（1f995be）
  - 新增语言包键集对账闸口 check:i18n，接进 quality-check 与两条 workflow（efb340d）
  - data/layout/_internal 三模块清扫——DataTable/导航数据/内部设施文案 t() 化（2edaf92）
  - form-builder 模块全量清扫——fieldRegistry key 化 + presets 函数化 + 设计器/收集/渲染器文案 t() 化（daae15e）
  - 八个小模块硬编码中文清扫——feedback/form/nav/basic/amap/chart/route-planner/storage（66d3288）
  - 语言包按模块域分块——zh/en 双轨 chunks + 聚合器 + satisfies 键集强约束（a241022）
- **`layout`**
  - Space 废弃语法糖摘导出并删件（880b1f2）
- **`login`**
  - 共享原语收敛到 _shared（M14）（da4440d）
- **`modal`**
  - 合并并行分支 ModalShell 方案 —— confirm 环打破的最终架构（9882fa2）
- **`quality`**
  - 新增 check:demo-props 闸口，把 demo 文档表谎报变成机器拦得住的东西（9a854d1）
- **`scan`**
  - 多码选码改微信/支付宝式 — 去虚线框，定格后每码一个箭头图标点击即识别（2afd9c4）
  - 定格选码视觉重做 — 虚线选框+箭头图钉+文字牌，画面压暗区分定格态（927c181）
- **`select`**
  - 下拉选项列表窗口化（虚拟化）—— 1 万选项不再裸建 1 万个按钮（29406f7）
- **`select,feedback,route-planner`**
  - 批次2 — 多选判定 Set 化 / import 期零全局副作用 / 告警与持久化口径（749a108）
- **`storage`**
  - storage* 轻量 API 物理拆到 local-storage.ts（Q17，API 不变）（a8ead93）
  - 两套云端存储合并——Supabase REST 传输层下沉 + CloudKVAdapter 官方实现（0172d5e）
  - contract-storage 本地引擎复用统一存储层（2a17147）
- **`types`**
  - any 收窄 51 → 5 处（chart/amap/form-builder 清零，剩 5 处为已登记决策）（5711080）
- **`upload,data-table,image-preview`**
  - 上传并发闸门 + 缩略图懒加载（b60f78c）
- **`utils`**
  - 收敛通用工具到 _internal/utils 统一入口（83b2ddd）
- **`wc`**
  - 消除 16 条不必要 any 断言（P2-1 部分）（3939a45）
- **`workspace`**
  - 新增 DataTable 系列排查台账、探针脚本与截图（bea29b9）

### Fixed

- **`P1`**
  - 修复9个P1缺陷+清理小程序残留（d9e60e8）
- **`P1-010`**
  - Top10文件160处硬编码px替换为CSS变量/相对单位（2b687de）
- **通用**
  - 全库深审批次1 — 数字列精度/全局样式自撞/发布产物可达性（8c270e9）
  - Select 下拉面板补 --z-dropdown 层级（选项被后续内容遮挡）；扫码 formats 分流二维码/条形码/通用（821d9f0）
  - 扫码多码 center 模式只自动录入离取景中心最近的一个（f2a5d95）
  - 图标子集收集器补漏（App.vue 与 icon: 形态全漏网）；demo 表格包 tbody 消除嵌套告警（5e5bacc）
  - 上传列表变体补图片缩略图与预览入口；扫码检测框坐标偏移与 position 容错（d659aea）
  - 组件可访问性与健壮性收尾（7adc43e）
  - 审查修复——目标收集清空确认/blob URL 泄漏 + FormReview 去硬编码接口 + KV 中文键告警 + 补缺失 i18n（42f2c8f）
  - 修复审计高危项（Select aria 唯一 id / ProgressBar 重复 emit / AmapWidget infoWindow 消毒 / Toast timer 清理）（7c8ff8d）
  - Group slider fill transition滞后修复 + BarcodeScanner动态间隔 + useVoice多语言 + Web Components封装（292459b）
- **`a11y`**
  - 修复 demo 站标题结构与 Card 标题级硬编码（axe 首扫驱动）（4b2b299）
  - MiniLayout 扫码 sheet 补焦点陷阱 + Esc 关闭 + role=dialog（3 例锁定）（c7d5f7e）
  - 手写弹层补焦点陷阱（P2-5）（cde5c87）
  - 可点击 div 补键盘可达（P1-5）（c89dcc2）
  - 图表/地图添加无障碍文本替代（182273a）
  - route-planner 弹层焦点管理与语义补全（f38e0c5）
  - login 记住密码改真实 checkbox，社交登录 div 改 button（6106f70）
  - Group 伪 radio/checkbox 改真实 input（02f8538）
- **`a11y,*`**
  - 截断处补可见完整值（28 处），闸口加第 [5] 项「截断类必须登记判定」（3bbbc7d）
- **`amap`**
  - 门店照片名称兜底改顺序分块，第 11 家起不再静默无照片（bab220b）
  - 地图初始化改协调器，setAmapKey 在渲染前生效（H3）（4f2627a）
- **`amap,data-table,route-planner`**
  - 三处常量按新规矩收口 —— 请求条数单源/预取改实测/截断留完整名（ef12012）
- **`chart`**
  - 把 toolbar 透传给 BaseChart 并删掉无人读的 BuildParams 写入（7ddfaed）
- **`color`**
  - 非法颜色串不再泄漏宿主正文色，取色块切主题后重算（8a30e5b）
  - 原生取色器只认 #rrggbb，IconPicker 默认 CSS 变量色不再刷告警（8448f3e）
- **`components`**
  - 第三~五轮修复——wc-switch 注册纠错 + 环境鲁棒性 15 项 + 遗留清理（a11y/类型导出/z-index）（9e3b8f8）
- **`contract-storage`**
  - 合同收集补上传时间（3abb35e）
- **`coupling`**
  - 修复审查发现的高危勾连点（H2/H4/H5/H7/H9/H11 + L5/M2/M6/M7）（d498539）
- **`data`**
  - 表头排序失效/Delete 绕过 editable/方向键劫持输入框/懒加载无效等 8 项 + 持久化 storage 透传与 auto 语义 + 死代码四件套删除（eeaae38）
- **`data-table`**
  - 修全屏按钮一进一出后失效，KeepAlive 失活补退出路径（1bfaae7）
  - 全屏卸载后归还表格节点，进场测量改为等侧栏动画真跑完（b6e0e9a）
  - 补上全屏的三个中断路径，卡片测距改回 O(1)（7a21a3b）
  - 全屏框改为全程跟内容区走，进场的 250ms 一并去掉（9ba3c79）
  - 填充柄只在可编辑时出现 — canFill 补整表 editable 守卫（d5fae75）
  - 下拉不改色 + 不可编辑列不渲染任何「可下拉」暗示（e229cd4）
  - 空白占位隔离到展示层 — 修 null 被占位符污染导出（98f526e）
- **`demos`**
  - 修掉六处演示静默失效，把没演到的功能真的演出来（17f2c7e）
  - 内嵌扫码取景框限宽 360px（脱离四列栅格后 100% 宽撑满整页）（8e513ed）
  - 恢复 FormRendererDemo 富文本演示 + 动态表单简单模板回归模板面板（f483917）
- **`deps+types`**
  - 依赖漏洞清零 + 引入 vite-plugin-dts 生成真实类型声明（00538a6）
- **`feedback`**
  - useVoice/useBeep 顶层副作用加幂等守卫（H12 连带）（b3a6866）
- **`form`**
  - Upload 模板多语句 @click 语法错误（存量 bug）（b3a8daa）
- **`form-builder`**
  - 目标收集导出丢字段 —— 汇总表改为全量字段并集，未显示列数在表上方明说（efdd35f）
  - 审查余项第二轮收官——多选批量操作/steps 错误跳转/键盘可达性/提交防重复（6eb8013）
  - 真实使用审查第二轮——发布端数据保护/撤销补全/汇总分页/删除确认（072d754）
  - 专项审计记档项修复——求值器转义边界 + 选项来源互斥告警 + serial 唯一性（57c218f）
  - 专项审计修复——联动字段列表随 schema 动态重扫 + 草稿防抖 timer 卸载清理（498bb59）
  - DynamicForm 适配布局改为 grid 多列——对标旧版 auto-fill 栅格，不再单列一条一条（49f385e）
  - demo 布局自适应 — 设计器随视口高度单屏放下、预览/收集满宽显示（37c65a1）
  - matrix 单选补 :checked 绑定——草稿回显已选值呈选中态（§21 候选修复，用户确认）（696d2c4）
  - 富文本专项——IME 合成保护 + 受控 contenteditable 重构，挂起清单全部清零（2877185）
  - 补齐设计器缺失的 10 个已注册字段类型（H8）（9a9e7d1）
  - 修复签名回写/容器落地/样式落地/拖拽/关联选择（cf7702a）
- **`guard`**
  - 页面级错误边界跨页复位 + 全局兜底 + 三层质量闸补齐（e2e 已静默失效三周）（3a21bd3）
- **`i18n`**
  - Popover 引用键前缀写错（feedback.popover.trigger → popover.trigger）+ 键存在性守卫（3521def）
  - 清理硬编码中文（portal_login/ModalBox/ToggleList/ChartLegend）+ Popover 语义补全（2f431d8）
- **`icons`**
  - IconPicker 去 solar CDN 依赖，名录与渲染数据一一对应（6c240e7）
  - 子集生成器补 icon 静态属性收集态，非 lucide 名逐个归位（45ec72f）
- **`quality`**
  - 覆盖率地板上调至 50/42/46/52；新增 check:css-tokens 令牌断档闸口（485c1a0）
  - demo-props 闸口括号配平跳过注释与字符串，DataTable 演示补全 Props 文档表（ae7f541）
- **`route-planner`**
  - enrichAccommodations 接入 generate/replan 链路（M10）（804af5e）
- **`screenshot`**
  - 降级复制失败时回收挂到 body 的临时节点，补三条单测（b742b4c）
- **`security`**
  - 挂起清单收尾——CSS 外链拦截 + target 链接 rel 补齐 + AmapWidget expose 消毒 + Space 接 warnOnce（8298c64）
- **`security+a11y`**
  - 修复审计 P0 安全问题与表单无障碍缺陷（7df59e6）
- **`select`**
  - 日期/时间面板固定固有宽度(264-300px)不随触发器拉伸——useFloating matchWidth=false 时定位按面板真实宽度算，宽触发器不再把日历拉散（a7b06ee）
  - 键盘提交语义对齐——disabled 键盘守卫 + 精确命中不受 allowCreate 限制（e37ff46）
  - 已打开面板点击其它下拉不收起——useClickOutside 改捕获阶段（1606723）
  - tag/浮动 label 行高裁切小写 g 下伸尾巴（taq 现象）（5c637e4）
- **`style,a11y,internal`**
  - 批次3 — 焦点环兜底/暗色 color-scheme/高度兜底统一/重复实现收口（63b5361）
- **`test`**
  - vitest 5 mock 兼容——__esModule 标记 + 挂载等异步解析（4e8c4e7）
- **`tokens`**
  - 补录 21 个被引用未声明的断档令牌（亮+暗两套）+ 全库扫描脚本（d34e1cd）
- **`ui`**
  - 修复 var(--space-7) 失效令牌——相机底栏左右侧键贴边（fe3cf1a）
- **`vue`**
  - 修复 9 处模板内联多语句 handler 编译失败（prettier semi:false 去分号重排与 Vue 表达式解析冲突）（d27efcb）

### Documentation

- **通用**
  - 报告 §9.7 补 vitest 5 mock 迁移三条经验（__esModule 标记/异步 teardown/importOriginal 禁用场景）（62da721）
  - 报告 §9.3-9.5——文档站落地、site-audit 假红根治、剩余开放重排（2d08b0f）
  - 依赖选型记录（Q6/Q11 PoC 结论）+ expose 公开契约表（Q18）+ 按需引入口径 + 报告 §9 跟进处置（ff3ba29）
  - 报告标记 Q10 any 收窄完成（51→5，含 scatter 冗余字段缺陷）（741d245）
  - 报告补录 Q16 SSR 冒烟与 i18n 键存在性闸口（含两个连锁缺陷）（590fa27）
  - 报告标记 Q9 CHANGELOG 与 Q17 storageSet 拆分已完成（c1519eb）
  - 报告标记 Q12 完成（axe 全站扫描 + 12 处库组件 a11y/对比度修复）（7ad8ff1）
  - 报告 N4 更新为合并终版（ModalShell + ConfirmContent 双下沉）（2fa00e8）
  - 报告 N5/Q14 标记已修（800 行拆分+行数闸口、体积预算）（e5554fd）
  - 报告 N4 值循环标记已修（ConfirmContent 单一来源，0e21e8c）（93936ca）
  - 第二轮全量审查报告（N1-N8）+ README 补 echarts-wordcloud peer 行与门禁描述（fc7575d）
  - README 增「与宿主 i18n 共存」一节；归档 2026-09-19 全量审查报告（ee085ad）
  - 补 README 入口 + 修复 package.json types 指向（d07f557）
  - 全库多维度审计报告（13 份）（63f2318）
  - 更新质量评估报告至v5.1-修复轮（214b87a）
  - 明确评估目标平台为纯Vue3 Web（不兼容小程序）（2750a68）
  - v5.0-final 质量评估报告+流程手册升级（19维度+10阶段+动态响应式审计+Git基线）（0a4b5fe）
- **`api`**
  - DataTable props 分组（Q5）+ defineExpose 注释契约（Q18）（962f543）
- **`demos`**
  - 补 TabPanel / 上传内置预览 / 扫码多码指针示例（89c9f26）
- **`form`**
  - Select 两个外部事件抑制窗写明实测出处，并记录为何不换成事件判定（06f397c）

### Tests

- **`P0`**
  - 重建单元测试系统，覆盖安全修复（8a07ef0）
- **`P1-001`**
  - 恢复单元测试系统+修复多行内联事件处理器（49c105c）
- **通用**
  - Select 交互 14 例 + useTableEdit 9 例（全库最后两大测试欠账清零）+ 审计整改跟踪表（a3ac3aa）
  - 审计整改回归锁定（a11y/进度条/消毒/timer + chart-options 21 类型 33 例）（92d0eeb）
  - 控制台无 warn/error（测试环境静默 + 测试修复 + composable 守卫）（adc3933）
  - 补充组件冒烟与工具函数测试，覆盖率跨过 5% 阈值（7e457da）
- **`amap`**
  - amap-service 纯函数行为锁定（11 个）（2bdee41）
- **`chart,form`**
  - Q4 后半继续抬升——chart +8/+4/+10，form +1.3/+1.6/+1（c9a8202）
- **`code-capture`**
  - form 域收尾——扫码状态机 10 条，CodeCapture 32.7%→42.9%（55c9698）
- **`coverage`**
  - 按域覆盖防回退闸口（Q4 前半）——全局地板不再掩盖域级洼地（d78969b）
- **`data`**
  - ImagePreview 行为锁定（巨型组件 1468 行）（2627bd5）
  - useTableExtras 行为锁定（DataTable 安全网补全）（97286c3）
  - useTableFilter 行为锁定（DataTable 筛选安全网补全）（2ccae80）
  - useTableCore 数据管道行为锁定（P2-3 安全网）（5973863）
- **`date-panel`**
  - form 域再抬升——DatePanel.vue 1.1% → 全覆盖，form 52.6/48.1/47.7（f5048e7）
- **`e2e`**
  - 修复全链暴露的两条失败——分页锚点 h4→h2（真红）+ axe 盲等改确定性等待（假红）（362e7ac）
  - site-audit 登记三方网络噪音豁免（iconify 回源/高德 markers）（99bd9fb）
  - login 页 i18n + AppLayout a11y 真实浏览器验证（800020b）
- **`fb`**
  - FormDesigner 挂载级 7 例（清空确认/撤销重做/标签页/Schema 导出/表单设置）（ed289c6）
  - FormCollect 挂载级 4 例（记录提交/统计/列表搜索/清空）+ 审计跟踪表更新（62bf07f）
  - FormBuilder 挂载级 8 例 + fix(i18n): ReadOnlyOverlay/useBarcodeScanner 硬编码清理（a0bd941）
- **`form-builder`**
  - useFormStorage 降级行为锁定（5 个）（64b2e46）
  - useFormValidator 行为锁定（15 个）（40dfafe）
  - useFormSchema 行为锁定（11 个）（9ee73bd）
  - 联动求值安全行为锁定（P0-5）（3df288e）
  - 富文本 XSS 消毒行为锁定（P0-4）（94a863c）
- **`login,menu`**
  - Q4 后半抬升两个覆盖洼地——login +16/+10/+8，nav +30/+32/+30（d22ab8f）
- **`repo`**
  - 测试资产入库 —— 单测与 e2e 随版本控制迁移，S3 签名测试凭证假化（d625494）
- **`route-planner`**
  - 核心算法行为锁定（聚类/分天/绕路/重规划 9 例）（046ccbf）
- **`ssr`**
  - SSR 冒烟落地（Q16）——25 个代表组件真服务端渲染 + 抓出 common.progress 键缺失（5af1b80）
- **`storage`**
  - contract-storage 契约固化（M9）（8272013）
- **`tree`**
  - 焦点定位选择器随 treeitem 角色上移同步（.tree-node → .tree-node-wrapper）（7cf1664）

### Chores

- **通用**
  - 图标子集再生成（新增 arrow-down，弹窗定格箭头用）（0278edf）
  - gitignore 忽略 reports/（Playwright HTML 报告产物）（47d4f5a）
  - 恢复 CI 流水线与 husky pre-commit（P0-2/P0-3）（ef467e3）
- **`data`**
  - 删除死代码 useTableEvents.ts（cab99aa）
- **`deps`**
  - vitest 4→5 + CI Node 20→22，npm audit 归零（74f1eb4）
  - 清除 pinia 死安装（devDep/rollup external/globals/demo 宿主挂载）（612d762）
  - 升级消除已知安全漏洞（da1bc4f）
- **`dev`**
  - gen-cert SAN 覆盖本机全部局域网 IPv4——手机真机测试直连（7a1d359）
- **`quality`**
  - 单测接入 CI 门禁，gitleaks 修复为真实可用的阻断扫描（af4c943）
- **`release`**
  - 补 LICENSE 文件与 package.json license 字段（96affcc）
  - 库改名 vcl-ui 并补齐发包契约与门禁（52c3792）
- **`repo`**
  - 清掉误入库的 Python 安装器缓存并把本机 e2e 默认改串行（9d9b46e）
  - tests 停止入库（文件留在本机），CI 摘掉跑不到的测试步骤（5851c2c）
  - git 只留运行与门禁必需——移除 docs/ 与 scripts/（3f24d99）
  - 移除零引用残留清单 scripts/demo-keys.txt（内容与 demoMap 路由重复，可再生成）（5b1be87）
  - 仓库只留项目必要文件——清理设计稿/一次性验证脚本/本地钩子并修掉失效引用（5b7c5a2）
- **`rules`**
  - 移除失效的外部模型代理链路——配额纪律整节/索引行/会话提醒条目清零（0d6fa25）
- **`test`**
  - 单条用例超时 5s → 20s，消除大数据挂载用例的偶发红（ae09d8f）
  - 覆盖率阈值 5%→基线 25/20/23/26（435 用例实测 31.6%，防覆盖回退）（a7459a9）
- **`workspace`**
  - 本轮评估探针与验收证据入库（51cb58f）
  - 审查检测工具入库（上轮遗留未提交）（809e82e）

### Other

> 以下提交不符合 conventional 格式，未归类（不丢弃，供补写时参考）。

- Revert "chore(repo): 移除零引用残留清单 scripts/demo-keys.txt（内容与 demoMap 路由重复，可再生成）"（1f91e6d）
- docs+perf(P2): 文档补全+echarts-wordcloud动态import（9aa200c）

---

生成口径：313 条提交 → 列入 280 条，审查过程记录折叠 31 条，非 conventional 格式 2 条（见 Other）；范围：全部历史。
