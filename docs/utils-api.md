# 工具函数手册（Utils API）

> 统一入口：`vue-component-lib`（或子路径 `vue-component-lib/src/components/_internal/utils`）
> 全部函数均为**纯函数 / 无副作用 / 零第三方依赖**，并带容错降级——非字符串输入、非法值、SSR 环境都不会抛异常。

```ts
import {
  isValidPhone, parseRegion, formatMoney, downloadBlob, deepClone,
  // … 全部函数见下表
} from 'vue-component-lib'
```

---

## 一、格式校验

| 函数 | 签名 | 说明 |
| ---- | ---- | ---- |
| `isValidPhone` | `(v?: unknown) => boolean` | 中国大陆手机号（11 位，1 开头，自动去空白） |
| `isValidEmail` | `(v?: unknown) => boolean` | 邮箱格式 |
| `isValidIdCard` | `(v?: unknown) => boolean` | 18 位身份证（17 位数字 + 1 位数字/X，仅格式校验） |
| `isValidUrl` | `(v?: unknown) => boolean` | http/https 开头的 URL |

## 二、行政区划 / 地址

| 函数 | 签名 | 说明 |
| ---- | ---- | ---- |
| `parseRegion` | `(input?: unknown) => Region` | 中国地址四级拆分（省 → 市 → 区县 → 乡镇 + 详细地址），纯后缀正则、零硬编码 |
| `parseAddress` | 同 `parseRegion` | 语义别名 |
| `formatRegion` | `(region, opts?) => string` | 拼接区域名，可选 `withTown` / `withDetail` |
| `splitRegionDetail` | `(input) => { region, detail }` | 拆出「区域」与「门牌号」两部分 |

`Region` 结构：`{ province, city, district, town, detail }`

```ts
parseRegion('广东省深圳市南山区科技园路1号')
// { province:'广东省', city:'深圳市', district:'南山区', town:'', detail:'科技园路1号' }
parseRegion('北京市朝阳区三里屯街道')   // 直辖市按「市」归入 city
// { province:'', city:'北京市', district:'朝阳区', town:'三里屯街道', detail:'' }
```

## 三、数字 / 金额

| 函数 | 签名 | 说明 |
| ---- | ---- | ---- |
| `formatNumber` | `(n, { decimals?, separator? }) => string` | 千分位 + 小数，非法值原样返回 |
| `formatMoney` | `(n, { symbol?, decimals?, separator? }) => string` | 金额（默认 `¥` + 两位小数） |
| `toChineseAmount` | `(n) => string` | 人民币大写（GB 规范，含整/角/分） |

```ts
formatNumber(1234567)          // '1,234,567'
formatMoney(1234.5)            // '¥1,234.50'
toChineseAmount(1001.23)       // '壹仟零壹元贰角叁分'
```

## 四、字符串

| 函数 | 签名 | 说明 |
| ---- | ---- | ---- |
| `truncate` | `(str, len, suffix='…') => string` | 截断加省略号，未超限原样返回 |
| `safeParseJSON` | `(str, fallback) => T` | 安全 JSON 解析，失败返回 fallback 不抛错 |
| `parseQueryString` | `(query) => Record<string,string>` | 查询字符串 → 对象（可带 `?`，decode 失败保留原值） |
| `buildQueryString` | `(params) => string` | 对象 → 查询字符串（跳过 null/undefined） |
| `escapeHtml` | `(str) => string` | HTML 特殊字符转义（用户输入安全展示为纯文本） |
| `unescapeHtml` | `(str) => string` | 反转义 |

## 五、随机 / ID

| 函数 | 签名 | 说明 |
| ---- | ---- | ---- |
| `randomInt` | `(min, max) => number` | 闭区间随机整数 |
| `randomString` | `(len, charset?) => string` | 随机字符串（默认字母数字） |
| `uuid` | `(prefix='') => string` | 唯一 ID（时间戳 base36 + 随机），可带前缀 |

## 六、文件 / 数据转换

| 函数 | 签名 | 说明 |
| ---- | ---- | ---- |
| `fileToBase64` | `(blob) => Promise<string>` | File/Blob → data URL（base64） |
| `blobToBase64` | 同 `fileToBase64` | 语义别名 |
| `dataURLtoBlob` | `(dataURL) => Blob \| null` | data URL → Blob，非法格式返回 null |
| `downloadBlob` | `(blob, filename) => boolean` | 触发下载，带 SSR / WebView / createObjectURL 缺失降级 |

## 七、数组 / 对象

| 函数 | 签名 | 说明 |
| ---- | ---- | ---- |
| `uniqueBy` | `(arr, key) => T[]` | 按字段名或函数去重，保留首次顺序 |
| `chunk` | `(arr, size) => T[][]` | 数组分组 |
| `isEqual` | `(a, b) => boolean` | 深比较（支持 NaN / Date / 嵌套，键序不敏感） |
| `deepClone` | `(value) => T` | JSON 深拷贝（JSON 可序列化的纯数据） |

## 八、脱敏 / 相对时间 / 类型判断 / 颜色

| 函数 | 签名 | 说明 |
| ---- | ---- | ---- |
| `maskName` | `(name?) => string` | 姓名保留首字符打星（不硬编码复姓表） |
| `maskPhone` | `(phone?) => string` | `138****8000` |
| `maskIdCard` | `(id?) => string` | 前 4 后 4 打星 |
| `formatRelativeTime` | `(time, now?) => string` | 刚刚 / N分钟前 / 昨天 / N天前 / 具体日期 |
| `isPlainObject` | `(v) => boolean` | 普通对象（排除 null/数组/Date） |
| `isNumeric` | `(v) => boolean` | 是否可转有限数字 |
| `isEmpty` | `(v) => boolean` | null/undefined/空串/空数组/空对象/空 Map/Set |
| `hexToRgb` | `(hex) => { r,g,b } \| null` | 支持 `#RGB` / `#RRGGBB` |
| `rgbToHex` | `(r, g, b) => string` | 分量自动钳制 0~255 |
| `isHexColor` | `(str) => boolean` | 是否合法 HEX 颜色 |

---

## 容错与降级约定

- **非字符串输入**：校验 / 脱敏 / 截断 / 转义等函数接受 `unknown`，内部统一安全转字符串，`null`/`undefined`/数字/对象都不抛错。
- **非法值兜底**：`formatNumber`/`formatMoney`/`toChineseAmount` 对非数字原样返回或返回空串；`safeParseJSON`/`dataURLtoBlob`/`parseQueryString` 失败不抛异常。
- **环境降级**：`downloadBlob` 覆盖 SSR（无 document）、`createObjectURL` 缺失、WebView 无 `download` 属性、任意异常四级降级；`fileToBase64` 在 `FileReader` 不可用时 reject 明确错误。

## 与其它工具模块的关系

| 模块 | 位置 | 内容 |
| ---- | ---- | ---- |
| 防抖/节流 | `useDebounce.ts` | `useDebounce` / `useDebounceFn` / `useThrottle` / `useThrottleFn` |
| 剪贴板 | `useCopy.ts` | `copyText`（Clipboard API → execCommand 降级） |
| 文件大小 | `format-utils.ts` | `formatSize` |
| SSR 守卫 | `ssr-guard.ts` | `isBrowser` / `safeWindow` / `safeLocalStorage` / `safeRun` |
| 日期 | `date-utils.ts` | `formatDate` / `parseDate` / `formatDateZh` / `formatDateTimeZh` / `normalizeDate` 等 |
| 分页 | `pagination-utils.ts` | `calcTotalPages` |
| 数值钳制 | `slider-utils.ts` | `clamp` / `alignStep` |
| 树拍平 | `useTreeFlatten.ts` | `useTreeFlatten` |
| HTML 消毒 | `data/composables/sanitize.ts` | `sanitizeHTML`（白名单富文本消毒，与 `escapeHtml` 互补） |
