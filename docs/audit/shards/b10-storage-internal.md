# storage + _internal 基建功能清单

> 26 ts。行号以 2026-08-25 为准。

---

## storage/indexedDB.ts（412 行）⭐ 存储引擎

**定位**：本地存储抽象——localStorage 轻量 KV（同步、TTL）+ IndexedDB 重量数据（异步、TTL、动态 store、批量事务）。

**导出**（全部走 `saas_` 前缀 / DB `saas_local_v2`）：
- **轻量**：`storageSet/Get/Delete/Has`（localStorage + StoreItem 包装 + TTL + 过期自清，:373-411）。
- **重量**：`dbPut/dbGet/dbDelete/dbHas/dbGetAll/dbKeys/dbCount/dbClear/dbBatch`（IndexedDB，:300-366）。

**功能点**
1. **StoreItem 契约**：`{key, value, _ts, _exp}` 统一包装，keyPath='key'（:25-31）；**保护契约注释**：上层依赖此格式，改格式须同步迁移（:21-23）。
2. **动态 store 创建**：ensureStore 关闭旧库→升版本→建 store，并发锁串行化（:86-131）——解决"版本号写死触发 VersionError"（:59-61）。
3. **打开失败自愈**：失败清空 _db/_dbPromise 允许重试（:52-57）。
4. **过期后台清理**：idbGetAll 收集过期 key 批量删（:186-202）。
5. **跨 store 批量事务**：dbBatch 单事务原子性（:257-284）。
6. **SSR/异常安全**：全部 try/catch + 降级 null/console.warn。

**测试**：contract-storage.spec 间接；无直接 spec（IndexedDB 在 happy-dom 需 mock）。**问题**：无（实现扎实）。

---

## storage/unified.ts（204 行）⭐ 统一门面

**定位**：统一存储门面——调用方声明意图，自动路由 localStorage（小值）/IndexedDB（大值/Blob）/云端（注入）。

**导出**：`storage`（getSync/setSync/removeSync/get/set/remove/has/onChange/setCloudAdapter）、`setCloudAdapter`、`StorageWriteOptions`、`CloudKVAdapter`。

**功能点**
1. **自动路由**：≤2KB 且可 JSON → localStorage；Blob/大值/循环引用 → IndexedDB（:70-80）。
2. **三级读链**：localStorage → IndexedDB → 云端，云端命中**回填本地缓存**（:118-139）。
3. **跨标签页感知**：storage 事件监听，返回退订函数（:165-178）。
4. **云端可选**：未注入适配器时 cloud 选项 warn 忽略（:108-114）。
5. 兼容旧 API（storageGet/dbPut 等存量零改动）（:13-15）。

**测试**：无直接 spec。**问题**：无。

---

## storage/contract-storage.ts（596 行）

**定位**：合同收集存储适配层——本地 IndexedDB + 云端 Supabase 双后端。

**导出**：`createBackend(config)`、`validateStorageConfig`、StorageConfig/StorageBackend/StoreFile/StoreUploadState/SupabaseConfig。
**测试**：contract-storage.spec（14 用例：配置校验/双后端路由/对象键 sanitize 等）。**问题**：无（详见 12 审计，本域最成熟模块）。

---

## storage/index.ts

**导出**：storage/indexedDB/unified 聚合（见根 index.ts re-export）。

---

## _internal 基建（22 ts）

| 模块 | 行数 | 导出/职责 | 测试 |
|------|-----:|------|------|
| **useFocusTrap.ts** | 139 | useFocusTrap：容器焦点陷阱（Tab 循环 FOCUSABLE_SELECTOR + autofocus 策略）+ **模块级激活序号**消除多弹窗竞态（新弹窗激活后旧弹窗不抢焦点，:26,115-118） | focus-trap.spec(4) |
| **useFloating.ts** | 307 | computeFloatingPosition（纯函数四向 flip + 限高 + 边界裁剪 + 防重叠兜底）/computePointerPosition（右键菜单）/useFloating（composable + resize/RO 重算 + prepareOpen 预定位） | 无直接 |
| useModalManager.ts | 48 | registerModal/hasActiveModal（弹窗互斥，scope 隔离，DEFAULT_MUTEX_SCOPE='global'） | composables.spec + coupling-fix |
| useClickOutside.ts | 27 | 点击外部关闭（多 ref 支持） | 无 |
| useEscClose.ts | 35 | Esc 关闭（isVisible/isClosable 条件） | utils.spec |
| useDebounce.ts | 166 | useDebounce/useDebounceFn/useThrottle/useThrottleFn（leading/trailing） | utils.spec |
| useCopy.ts | 40 | copyText（navigator.clipboard + execCommand 降级） | composables.spec |
| useScreenshot.ts | 175 | downloadScreenshot/copyScreenshotToClipboard（canvas→PNG） | 无直接 |
| useTreeFlatten.ts | 191 | useTreeFlatten（树扁平化 + expandKeys + toggleExpand/expandAll） | composables.spec |
| usePinyinSearch.ts | 93 | matchPinyin/createPinyinMatcher（全拼/首字母 + 缓存 + pruneCache） | pinyin.spec(7) |
| useToastNotify.ts | 26 | useToastNotify（挂 Toast ref + notify 便捷函数） | 无 |
| useTheme.ts | 92 | useTheme（light/dark/auto + localStorage 持久化 + media 监听 + CSS 变量） | theme.spec(3) |
| ssr-guard.ts | 53 | isBrowser/safeWindow/safeDocument/safeLocalStorage/safeNavigator/safeRun | utils.spec |
| warnOnce.ts | 17 | warnOnce（模块级去重警告） | utils.spec |
| z-top.ts | 17 | boostZTop（模块级 z-index 引用计数提升，ImagePreview 用） | 无 |
| i18n.ts | 69 | i18n 实例/setLocale/getLocale/useT/useTm + vue-i18n useI18n | form-i18n/login-i18n/validator-i18n/route-planner-i18n |
| locales/ | — | zh-CN/en-US 词条表 | — |
| solar-icons.ts/registry.ts | — | Solar 图标库数据 + ensureSolarIcons 按需加载 | 无 |
| pinyin-pro/ | — | 拼音转换（内部实现，含 d.ts） | pinyin.spec |
| **utils.ts** | 632 | **40 个工具函数**（见下） | _internal-utils.spec(63) |
| lucide-icons.json | — | Lucide 1500+ 图标名（IconPicker 用） | — |

**utils.ts 关键导出**：校验（isValidPhone/Email/IdCard/Url）、行政区划（parseRegion/formatRegion/splitRegionDetail）、下载/深拷贝（downloadBlob/deepClone）、数字金额（formatNumber/Money/Size/toChineseAmount）、字符串（truncate/maskName/Phone/IdCard/escapeHtml/unescapeHtml）、序列化（safeParseJSON/parseQueryString/buildQueryString）、随机（randomInt/String/uuid）、文件（fileToBase64/dataURLtoBlob）、集合（uniqueBy/chunk/isEqual/isPlainObject/isEmpty/isNumeric）、颜色（hexToRgb/rgbToHex/isHexColor）、时间（formatRelativeTime）。

**测试**：_internal-utils.spec（**63 用例，全库最厚**）。

---

## 域汇总

| 指标 | 值 |
|------|-----|
| storage | 3 模块（indexedDB/unified/contract-storage） |
| _internal | 22 ts + 2 数据文件 |
| 直接 spec | _internal-utils(63)、composables(9)、focus-trap(4)、pinyin(7)、theme(3)、utils.spec(16 含 ssr-guard/debounce/escClose/warnOnce/date-utils/pagination-utils)、contract-storage(14) |
| 未测 | useFloating 纯函数、useScreenshot、useToastNotify、z-top、unified 路由、solar 加载 |
| 安全 | 全部无危险操作；localStorage/IDB 均带 TTL 与异常降级 |

**最重要发现**
1. **基建层是全库测试最扎实的层**（63+9+4+7+3+16 = 100+ 用例），且实现质量高（焦点竞态/动态 store/三级读链都是硬核细节）。
2. **useFloating 纯函数（computeFloatingPosition）零测试**——被 Select/Popover/DataTable 等多处依赖，是最该补的基建测试。
3. **storage 层契约成熟**（StoreItem 保护注释 + 动态 store + 云端注入），可作为全库工程标杆。
