<script setup lang="ts">
// 门店合同收集表单 — 分批收集苹果专柜租赁协议
// 基础存储 API（storageGet/Set/Delete、dbPut/dbGet/dbDelete）见 StorageDemo
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick, toRaw } from 'vue'
import { Input, Upload, Toast } from '@/components'
import StorageConfigPanel from '@/components/storage/StorageConfigPanel.vue'
import ImagePreview from '@/components/data/ImagePreview.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import type { UploadFile } from '@/components/form/Upload.vue'
import { validateStorageConfig, defaultStorageConfigFromEnv } from '@/components/storage/contract-storage'
import { createBackend } from '@/components/storage/compositeBackend'
import type { StorageBackend, StorageConfig, StoreUploadState } from '@/components/storage/contract-storage'
import { redactForPersist } from '@/components/form-builder/storage-config-persist'
import JSZip from 'jszip'

const toastRef = ref<InstanceType<typeof Toast>>()
const toast = (msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') =>
  toastRef.value?.show(msg, type, 2000)

// ===== 静态示例数据（49 行门店；全部为合成数据，仅保留省/市/县/镇行政结构供地图与表格演示） =====
interface StoreRow {
  appleId: number
  name: string
  startDate: string
  license: string
  address: string
  phone: string
}
const stores: StoreRow[] = [
  {
    appleId: 6000000,
    name: '示例通讯汨罗市长乐镇01店',
    startDate: '2022-06-24',
    license: '示例通讯汨罗市长乐镇01店',
    address: '湖南省岳阳市汨罗市长乐镇示例路1号',
    phone: '13810000000',
  },
  {
    appleId: 6000007,
    name: '示例通讯示例镇02店',
    startDate: '2022-06-01',
    license: '示例通讯示例镇02店',
    address: '湖南省岳阳市示例路2号',
    phone: '13810000001',
  },
  {
    appleId: 6000014,
    name: '示例通讯岳阳县杨林街镇03店',
    startDate: '2024-06-20',
    license: '示例通讯岳阳县杨林街镇03店',
    address: '湖南省岳阳市岳阳县杨林街镇示例路3号',
    phone: '13810000002',
  },
  {
    appleId: 6000021,
    name: '示例通讯湖南长沙宁乡04店',
    startDate: '2024-06-28',
    license: '示例通讯湖南长沙宁乡04店',
    address: '湖南长沙宁乡示例路4号',
    phone: '13810000003',
  },
  {
    appleId: 6000028,
    name: '示例通讯平江县安定镇05店',
    startDate: '2023-09-04',
    license: '示例通讯平江县安定镇05店',
    address: '湖南省岳阳市平江县安定镇示例路5号',
    phone: '13810000004',
  },
  {
    appleId: 6000035,
    name: '示例通讯岳阳县月田镇06店',
    startDate: '2024-01-15',
    license: '示例通讯岳阳县月田镇06店',
    address: '湖南省岳阳市岳阳县月田镇示例路6号',
    phone: '13810000005',
  },
  {
    appleId: 6000042,
    name: '示例通讯耒阳市公平圩镇07店',
    startDate: '2024-09-20',
    license: '示例通讯耒阳市公平圩镇07店',
    address: '湖南省衡阳市耒阳市公平圩镇示例路7号',
    phone: '13810000006',
  },
  {
    appleId: 6000049,
    name: '示例通讯宁乡08店',
    startDate: '2023-09-04',
    license: '示例通讯宁乡08店',
    address: '湖南省长沙市宁乡示例路8号',
    phone: '13810000007',
  },
  {
    appleId: 6000056,
    name: '示例通讯汨罗市三江镇09店',
    startDate: '2024-07-31',
    license: '示例通讯汨罗市三江镇09店',
    address: '湖南省岳阳市汨罗市三江镇示例路9号',
    phone: '13810000008',
  },
  {
    appleId: 6000063,
    name: '示例通讯宜章县一六镇10店',
    startDate: '2024-02-26',
    license: '示例通讯宜章县一六镇10店',
    address: '湖南省郴州市宜章县一六镇示例路10号',
    phone: '13810000009',
  },
  {
    appleId: 6000070,
    name: '示例通讯临澧县新安镇11店',
    startDate: '2023-09-11',
    license: '示例通讯临澧县新安镇11店',
    address: '湖南省常德市临澧县新安镇示例路11号',
    phone: '13810000010',
  },
  {
    appleId: 6000077,
    name: '示例通讯桃源县架桥镇12店',
    startDate: '2023-09-04',
    license: '示例通讯桃源县架桥镇12店',
    address: '湖南省常德市桃源县架桥镇示例路12号',
    phone: '13810000011',
  },
  {
    appleId: 6000084,
    name: '示例通讯岳阳县筻口镇13店',
    startDate: '2024-06-20',
    license: '示例通讯岳阳县筻口镇13店',
    address: '湖南省岳阳市岳阳县筻口镇示例路13号',
    phone: '13810000012',
  },
  {
    appleId: 6000091,
    name: '示例通讯津市市新洲镇14店',
    startDate: '2023-09-11',
    license: '示例通讯津市市新洲镇14店',
    address: '湖南省常德市津市市新洲镇示例路14号',
    phone: '13810000013',
  },
  {
    appleId: 6000098,
    name: '示例通讯望城区白若铺镇15店',
    startDate: '2023-09-18',
    license: '示例通讯望城区白若铺镇15店',
    address: '湖南省长沙市望城区白若铺镇示例路15号',
    phone: '13810000014',
  },
  {
    appleId: 6000105,
    name: '示例通讯宁乡16店',
    startDate: '2025-06-19',
    license: '示例通讯宁乡16店',
    address: '湖南省长沙市宁乡示例路16号',
    phone: '13810000015',
  },
  {
    appleId: 6000112,
    name: '示例通讯浏阳市洞阳镇17店',
    startDate: '2023-12-11',
    license: '示例通讯浏阳市洞阳镇17店',
    address: '湖南省长沙市浏阳市洞阳镇示例路17号',
    phone: '13810000016',
  },
  {
    appleId: 6000119,
    name: '示例通讯社港镇18店',
    startDate: '2025-06-06',
    license: '示例通讯社港镇18店',
    address: '湖南省浏阳市社港镇示例路18号',
    phone: '13810000017',
  },
  {
    appleId: 6000126,
    name: '示例通讯醴陵市白兔潭镇19店',
    startDate: '2023-12-27',
    license: '示例通讯醴陵市白兔潭镇19店',
    address: '湖南省株洲市醴陵市白兔潭镇示例路19号',
    phone: '13810000018',
  },
  {
    appleId: 6000133,
    name: '示例通讯攸县酒埠江镇20店',
    startDate: '2023-12-27',
    license: '示例通讯攸县酒埠江镇20店',
    address: '湖南省株洲市攸县酒埠江镇示例路20号',
    phone: '13810000019',
  },
  {
    appleId: 6000140,
    name: '示例通讯宁乡21店',
    startDate: '2025-06-06',
    license: '示例通讯宁乡21店',
    address: '湖南省长沙市宁乡示例路21号',
    phone: '13810000020',
  },
  {
    appleId: 6000147,
    name: '示例通讯鼎城区祝丰镇22店',
    startDate: '2023-12-29',
    license: '示例通讯鼎城区祝丰镇22店',
    address: '湖南省常德市鼎城区祝丰镇示例路22号',
    phone: '13810000021',
  },
  {
    appleId: 6000154,
    name: '示例通讯长沙县路口镇23店',
    startDate: '2023-12-27',
    license: '示例通讯长沙县路口镇23店',
    address: '湖南省长沙市长沙县路口镇示例路23号',
    phone: '13810000022',
  },
  {
    appleId: 6000161,
    name: '示例通讯平江县长寿镇24店',
    startDate: '2024-03-11',
    license: '示例通讯平江县长寿镇24店',
    address: '湖南省岳阳市平江县长寿镇示例路24号',
    phone: '13810000023',
  },
  {
    appleId: 6000168,
    name: '示例通讯新化县白溪镇25店',
    startDate: '2023-12-27',
    license: '示例通讯新化县白溪镇25店',
    address: '湖南省娄底市新化县白溪镇示例路25号',
    phone: '13810000024',
  },
  {
    appleId: 6000175,
    name: '示例通讯浏阳市北盛镇26店',
    startDate: '2023-12-29',
    license: '示例通讯浏阳市北盛镇26店',
    address: '湖南省长沙市浏阳市北盛镇示例路26号',
    phone: '13810000025',
  },
  {
    appleId: 6000182,
    name: '示例通讯长沙县黄花镇27店',
    startDate: '2023-12-29',
    license: '示例通讯长沙县黄花镇27店',
    address: '湖南省长沙市长沙县黄花镇示例路27号',
    phone: '13810000026',
  },
  {
    appleId: 6000189,
    name: '示例通讯炎陵县霞阳镇28店',
    startDate: '2024-02-19',
    license: '示例通讯炎陵县霞阳镇28店',
    address: '湖南省株洲市炎陵县霞阳镇示例路28号',
    phone: '13810000027',
  },
  {
    appleId: 6000196,
    name: '示例通讯示例镇29店',
    startDate: '2024-02-26',
    license: '示例通讯示例镇29店',
    address: '湖南省衡阳县洪市镇示例路29号',
    phone: '13810000028',
  },
  {
    appleId: 6000203,
    name: '示例通讯平江县南江镇30店',
    startDate: '2024-02-05',
    license: '示例通讯平江县南江镇30店',
    address: '湖南省岳阳市平江县南江镇示例路30号',
    phone: '13810000029',
  },
  {
    appleId: 6000210,
    name: '示例通讯攸县皇图岭镇31店',
    startDate: '2024-06-28',
    license: '示例通讯攸县皇图岭镇31店',
    address: '湖南省株洲市攸县皇图岭镇示例路31号',
    phone: '13810000030',
  },
  {
    appleId: 6000217,
    name: '示例通讯沅江市草尾镇32店',
    startDate: '2024-05-08',
    license: '示例通讯沅江市草尾镇32店',
    address: '湖南省益阳市沅江市草尾镇示例路32号',
    phone: '13810000031',
  },
  {
    appleId: 6000224,
    name: '示例通讯耒阳市小水镇33店',
    startDate: '2024-05-30',
    license: '示例通讯耒阳市小水镇33店',
    address: '湖南省衡阳市耒阳市小水镇示例路33号',
    phone: '13810000032',
  },
  {
    appleId: 6000231,
    name: '示例通讯常宁市荫田镇34店',
    startDate: '2024-06-28',
    license: '示例通讯常宁市荫田镇34店',
    address: '湖南省衡阳市常宁市荫田镇示例路34号',
    phone: '13810000033',
  },
  {
    appleId: 6000238,
    name: '示例通讯平江县伍市镇35店',
    startDate: '2024-04-12',
    license: '示例通讯平江县伍市镇35店',
    address: '湖南省岳阳市平江县伍市镇示例路35号',
    phone: '13810000034',
  },
  {
    appleId: 6000245,
    name: '示例通讯君山区广兴洲镇36店',
    startDate: '2024-05-17',
    license: '示例通讯君山区广兴洲镇36店',
    address: '湖南省岳阳市君山区广兴洲镇示例路36号',
    phone: '13810000035',
  },
  {
    appleId: 6000252,
    name: '示例通讯汉寿县太子庙镇37店',
    startDate: '2024-06-07',
    license: '示例通讯汉寿县太子庙镇37店',
    address: '湖南省常德市汉寿县太子庙镇示例路37号',
    phone: '13810000036',
  },
  {
    appleId: 6000259,
    name: '示例通讯湘潭县易俗河镇38店',
    startDate: '2024-05-31',
    license: '示例通讯湘潭县易俗河镇38店',
    address: '湖南省湘潭市湘潭县易俗河镇示例路38号',
    phone: '13810000037',
  },
  {
    appleId: 6000266,
    name: '示例通讯宜章县玉溪镇39店',
    startDate: '2024-06-20',
    license: '示例通讯宜章县玉溪镇39店',
    address: '湖南省郴州市宜章县玉溪镇示例路39号',
    phone: '13810000038',
  },
  {
    appleId: 6000273,
    name: '示例通讯赫山区泥江口镇40店',
    startDate: '2024-07-03',
    license: '示例通讯赫山区泥江口镇40店',
    address: '湖南省益阳市赫山区泥江口镇示例路40号',
    phone: '13810000039',
  },
  {
    appleId: 6000280,
    name: '示例通讯岳阳县长湖乡41店',
    startDate: '2024-06-28',
    license: '示例通讯岳阳县长湖乡41店',
    address: '湖南省岳阳市岳阳县长湖乡示例路41号',
    phone: '13810000040',
  },
  {
    appleId: 6000287,
    name: '示例通讯邵阳县长阳铺镇42店',
    startDate: '2023-12-29',
    license: '示例通讯邵阳县长阳铺镇42店',
    address: '湖南省邵阳市邵阳县长阳铺镇示例路42号',
    phone: '13810000041',
  },
  {
    appleId: 6000294,
    name: '示例通讯沅陵县官庄镇43店',
    startDate: '2024-05-17',
    license: '示例通讯沅陵县官庄镇43店',
    address: '湖南省怀化市沅陵县官庄镇示例路43号',
    phone: '13810000042',
  },
  {
    appleId: 6000301,
    name: '示例通讯绥宁县长铺镇44店',
    startDate: '2024-03-04',
    license: '示例通讯绥宁县长铺镇44店',
    address: '湖南省邵阳市绥宁县长铺镇示例路44号',
    phone: '13810000043',
  },
  {
    appleId: 6000308,
    name: '示例通讯邵东市廉桥镇45店',
    startDate: '2024-03-29',
    license: '示例通讯邵东市廉桥镇45店',
    address: '湖南省邵阳市邵东市廉桥镇示例路45号',
    phone: '13810000044',
  },
  {
    appleId: 6000315,
    name: '示例通讯新邵县酿溪镇46店',
    startDate: '2024-04-19',
    license: '示例通讯新邵县酿溪镇46店',
    address: '湖南省邵阳市新邵县酿溪镇示例路46号',
    phone: '13810000045',
  },
  {
    appleId: 6000322,
    name: '示例通讯湘西土家族苗族自治州凤凰县茶田镇47店',
    startDate: '2024-05-17',
    license: '示例通讯湘西土家族苗族自治州凤凰县茶田镇47店',
    address: '湖南省湘西土家族苗族自治州凤凰县茶田镇示例路47号',
    phone: '13810000046',
  },
  {
    appleId: 6000329,
    name: '示例通讯新宁县金石镇48店',
    startDate: '2024-05-22',
    license: '示例通讯新宁县金石镇48店',
    address: '湖南省邵阳市新宁县金石镇示例路48号',
    phone: '13810000047',
  },
  {
    appleId: 6000336,
    name: '示例通讯新宁县回龙寺镇49店',
    startDate: '2024-06-20',
    license: '示例通讯新宁县回龙寺镇49店',
    address: '湖南省邵阳市新宁县回龙寺镇示例路49号',
    phone: '13810000048',
  },
]

// ===== 上传状态（按 appleId 索引，每个门店一个文件） =====
const uploadMap = reactive<Record<number, StoreUploadState>>({})

// 获取某门店已上传的 UploadFile[]（供 Upload 组件 v-model 使用）
function getUploadFiles(appleId: number): UploadFile[] {
  const f = uploadMap[appleId]?.contract
  if (!f) return []
  // Blob（本地落盘的原始文件）→ 即时预览 URL；string（data:/URL）直接用
  const url = typeof f.dataUrl === 'string' ? f.dataUrl : URL.createObjectURL(f.dataUrl)
  return [{ id: appleId, name: f.name, size: f.size, progress: 100, status: 'done', url }]
}

// ===== 存储后端：本地 IndexedDB（默认）/ Supabase（配置后开启） =====
const CONFIG_KEY = 'contract-collection-storage-config'
const storageConfig = ref<StorageConfig>(loadConfig())
const showStoragePanel = ref(false)
const saving = ref(false)
let backendInstance: StorageBackend | null = null

function loadConfig(): StorageConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) {
      const c = JSON.parse(raw) as StorageConfig
      // 已存配置必须是合法结构：云端后端但必填项缺失的坏配置（线上构建 env 为空时保存过）
      // 会卡死加载，忽略并回退默认
      const valid =
        c &&
        (c.backend === 'local' ||
          (c.backend === 'supabase' && !validateStorageConfig(c)) ||
          (c.backend === 's3' && !validateStorageConfig(c)))
      if (valid) return c
    }
  } catch {
    /* 配置损坏则回退默认 */
  }
  // 产物模式：用服务器运行时注入的配置（与 amap key 同一机制）。
  // 库的 runtimeEnv() 生产构建下返回 {}，所以 defaultStorageConfigFromEnv() 一定是"本地"——
  // 这不是缺陷，是"产物不携带凭证"的必然结果；演示站要在产物里也展示云端提示，
  // 就得像宿主那样在运行时把自己的配置给进来。
  const injected = (window as unknown as { __demoRuntimeConfig?: { s3?: Record<string, string> } }).__demoRuntimeConfig
  if (import.meta.env.DEV || !injected?.s3) return defaultStorageConfigFromEnv()
  const s3 = injected.s3
  if (s3.endpoint && s3.bucket && s3.accessKeyId && s3.secretAccessKey) {
    return {
      backend: 's3',
      url: '',
      anonKey: '',
      endpoint: s3.endpoint,
      region: s3.region ?? '',
      bucket: s3.bucket,
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
    }
  }
  return defaultStorageConfigFromEnv()
}

function persistConfig(): void {
  // 落盘前脱敏：secretAccessKey 不写盘（同机用户 / 浏览器扩展 / 配置备份都读得到 localStorage）。
  // 读取端因此拿不到 SK，会按「必填缺失」回退到 env 默认并要求重新填写——这是刻意行为。
  localStorage.setItem(CONFIG_KEY, JSON.stringify(redactForPersist(storageConfig.value)))
}

function applyBackend(): StorageBackend {
  // 缓存同一实例：Supabase 后端的对象名映射（paths）依赖实例存活，重建会丢
  if (!backendInstance) {
    backendInstance = createBackend(toRaw(storageConfig.value), (appleId, e) => {
      // 本地已记录但云端同步失败：必须明确提示，否则手机拍了 PC 打开是空的
      toast(`门店 ${appleId} 云端同步失败：${(e as Error)?.message || String(e)}`, 'error')
    })
  }
  return backendInstance
}

function resetBackend(): void {
  backendInstance = null
}

async function reloadFromBackend(): Promise<void> {
  const backend = applyBackend()
  try {
    const map = await backend.loadAll()
    for (const k of Object.keys(uploadMap)) delete uploadMap[Number(k)]
    for (const [id, state] of map) uploadMap[id] = state
  } catch (e) {
    console.warn('[ContractCollection] 存储加载失败:', e)
    toast(backend.kind !== 'local' ? '云端加载失败，请检查配置或网络' : '本地加载失败', 'error')
  }
}

async function saveToBackend(appleId: number, deleting = false): Promise<void> {
  const raw = toRaw(uploadMap[appleId])
  try {
    await applyBackend().saveRecord(appleId, { contract: raw?.contract, ts: raw?.ts ?? Date.now() })
  } catch (e) {
    console.warn('[ContractCollection] 存储保存失败:', e)
    // 删除失败不静默：本地已删但云端可能没删，明示用户（否则下次加载云端覆盖回来，图"复活"）
    toast(deleting ? '删除失败，云端未删除，请重试' : '保存失败，请检查存储配置', 'error')
  }
}

/** 共享面板保存回调：持久化 → 重建后端 → 重载（校验已在面板内完成） */
async function onStorageConfigSave(next: StorageConfig): Promise<void> {
  storageConfig.value = next
  saving.value = true
  try {
    persistConfig()
    resetBackend() // 配置变更后重建后端实例
    await reloadFromBackend()
    showStoragePanel.value = false
    toast('已切换到' + (storageConfig.value.backend !== 'local' ? '云端存储' : '本地存储'), 'success')
  } finally {
    saving.value = false
  }
}

// ===== 自定义上传 =====
// 直接返回即时 blob URL 供预览（同步级，无异步转码）：
// 原始文件（File）随 UploadFile.raw 传出，onUpload 里直接落盘 IndexedDB（Blob 毫秒级），
// 真机拍照返回重建页面时图片已存好，不会丢。
const customRequest = (file: File): Promise<{ url: string }> => {
  return Promise.resolve({ url: URL.createObjectURL(file) })
}

// ===== 上传处理 =====
// 保存等待本地落盘完成再提示：真机拍照返回会重建页面，若只异步上传云端，
// 保存未完成页面就没了 → 图片丢失。dataUrl 存原始 Blob（IndexedDB 毫秒级落盘），云端后台同步。
async function onUpload(appleId: number, files: UploadFile[]): Promise<void> {
  if (!uploadMap[appleId]) uploadMap[appleId] = { contract: undefined, ts: Date.now() }
  const f = files[0]
  if (f && f.url && f.status === 'done') {
    uploadMap[appleId].contract = { name: f.name, dataUrl: f.raw ?? f.url, size: f.size, type: 'image/*' }
    uploadMap[appleId].ts = Date.now()
    await saveToBackend(appleId)
    toast('柜机协议 已记录 ✓', 'success')
  } else if (files.length === 0) {
    // 用户删除了文件
    uploadMap[appleId].contract = undefined
    uploadMap[appleId].ts = Date.now()
    await saveToBackend(appleId, true)
  }
}

async function clearAll(): Promise<void> {
  try {
    await applyBackend().clearAll()
    for (const k of Object.keys(uploadMap)) delete uploadMap[Number(k)]
    toast(`已清空全部上传记录（${storageConfig.value.backend !== 'local' ? '本地+云端' : '本地'}）`, 'success')
  } catch (e) {
    console.warn('[ContractCollection] 清空失败:', e)
    toast('清空失败，云端部分对象可能未删除，请重试', 'error')
  }
}

// ===== 搜索 =====
// 关键词持久化到 localStorage：真机拍照调起相机可能重建页面，刷新后自动恢复搜索，
// 用户不会感觉"拍照后列表跳走/没反应"
const SEARCH_KEY = 'contract-collection-search-keyword'
const keyword = ref(localStorage.getItem(SEARCH_KEY) || '')
watch(keyword, (v) => {
  try {
    localStorage.setItem(SEARCH_KEY, v)
  } catch {
    /* 隐私模式等写入失败忽略 */
  }
})
const filteredStores = computed(() => {
  const kw = keyword.value.trim()
  if (!kw) return stores
  return stores.filter((s) => String(s.appleId).includes(kw) || s.license.includes(kw))
})

// 已上传计数
const uploadCount = computed(() => {
  let contract = 0
  for (const v of Object.values(uploadMap)) {
    if (v.contract) contract++
  }
  return { contract, total: stores.length }
})

// ===== 导出 ZIP =====
const exporting = ref(false)

/** 时间戳 → 本地可读时间（YYYY-MM-DD HH:mm），ts 为 0/缺失时返回空 */
function formatTs(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function exportZip(): Promise<void> {
  const zip = new JSZip()
  let fileCount = 0

  // 1) 导出上传的柜机协议图片
  for (const [idStr, state] of Object.entries(uploadMap)) {
    const appleId = Number(idStr)
    const f = state.contract
    if (!f?.dataUrl) continue
    // 从图片内容推断扩展名（Blob 用 type；dataUrl 用 mime）
    const mime =
      typeof f.dataUrl === 'string'
        ? f.dataUrl.match(/^data:(image\/\w+);/)?.[1] || 'image/png'
        : f.dataUrl.type || 'image/png'
    const ext = mime.split('/')[1] || 'png'
    // 命名格式：{AppleID}-柜机协议.{ext}
    const zipPath = `${appleId}-柜机协议.${ext}`

    try {
      let blob: Blob
      if (typeof f.dataUrl === 'string') {
        // URL 引用：源不可达（对象已删/死链）时跳过，禁止把 404 错误体打包进 zip
        const resp = await fetch(f.dataUrl)
        if (!resp.ok) {
          console.warn('[ContractCollection] 跳过失效引用:', zipPath)
          continue
        }
        blob = await resp.blob()
      } else {
        blob = f.dataUrl
      }
      zip.file(zipPath, blob)
      fileCount++
    } catch {
      console.warn('[ContractCollection] 跳过损坏文件:', zipPath)
    }
  }

  // 2) 导出门店数据 Excel 表格
  const rows = stores.map((s) => {
    const up = uploadMap[s.appleId]
    return {
      'Apple ID': s.appleId,
      授权门店名称: s.name,
      营业执照名称: s.license,
      营业执照地址: s.address,
      电话: s.phone,
      柜机协议: up?.contract ? '✓ 已上传' : '✗ 未上传',
      上传时间: up?.ts ? formatTs(up.ts) : '',
      开始日期: s.startDate,
    }
  })
  const XLSX = await import('@/components/_internal/xlsx/xlsx.mjs')
  const ws = XLSX.utils.json_to_sheet(rows)
  // 设置列宽
  ws['!cols'] = [{ wch: 10 }, { wch: 35 }, { wch: 25 }, { wch: 45 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 12 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '门店合同收集')
  zip.file('门店数据.xlsx', XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))

  if (fileCount === 0) {
    toast('没有已上传的文件可导出（Excel 表格仍已包含）', 'warning')
    return
  }

  exporting.value = true
  try {
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    const zipUrl = URL.createObjectURL(blob)
    a.href = zipUrl
    a.download = `门店合同收集_${new Date().toISOString().slice(0, 10)}.zip`
    a.click()
    // revoke 延后一轮宏任务（#436；与 #429/#430 同一判据）：
    // click() 只是发起下载，浏览器读 blob URL 是异步的 —— 同步撤销会让 zip 静默失败。
    setTimeout(() => {
      try {
        URL.revokeObjectURL(zipUrl)
      } catch {
        /* 撤不掉只影响回收时机 */
      }
    }, 0)
    toast(`已导出 ${fileCount} 个文件 + 门店数据.xlsx`, 'success')
  } finally {
    exporting.value = false
  }
}

// ===== 图片预览（点击卡片上的图打开全屏查看） =====
const previewUrl = ref('')
const previewVisible = ref(false)
function openPreview(url: string): void {
  if (!url) return
  previewUrl.value = url
  previewVisible.value = true
}

// ===== 滚动位置恢复（手机拍照返回整页重建后，回到原浏览位置） =====
// 真机拍照 `<input capture>` 会重建页面，滚动位置丢回顶部，用户要重新滚回刚才那家店。
// 拍照返回是「同标签页重建」，localStorage 仍然存活：加载完成后按上次位置滚回去，让刷新几乎无感。
const SCROLL_KEY = 'contract-collection-scroll'
let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null

/** 滚动容器 = 布局的 .content-body；找不到时回退向上找最近可滚动祖先 */
function scrollContainer(): HTMLElement | null {
  const wrap = document.querySelector('.cc-wrap')
  if (!wrap) return null
  const el = wrap.closest('.content-body') as HTMLElement | null
  if (el) return el
  // 兜底：向上找第一个可滚动的祖先（demo 嵌入其他布局时也能用）
  let node = wrap.parentElement
  while (node) {
    if (node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}

/** 滚动节流落盘；带关键词快照，恢复时列表内容不同则放弃（旧位置无意义） */
function saveScroll(): void {
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer)
  scrollSaveTimer = setTimeout(() => {
    const el = scrollContainer()
    if (!el) return
    try {
      localStorage.setItem(SCROLL_KEY, `${keyword.value.trim()}\n${el.scrollTop}`)
    } catch {
      /* 隐私模式等写入失败忽略 */
    }
  }, 200)
}

function restoreScroll(): void {
  const el = scrollContainer()
  if (!el) return
  try {
    const raw = localStorage.getItem(SCROLL_KEY) ?? ''
    const sep = raw.indexOf('\n')
    const kw = sep >= 0 ? raw.slice(0, sep) : ''
    const top = Number(sep >= 0 ? raw.slice(sep + 1) : raw) || 0
    if (kw === keyword.value.trim()) el.scrollTop = top
  } catch {
    /* 忽略 */
  }
}

// ===== 初始化 =====
onMounted(async () => {
  await reloadFromBackend()
  // 数据回来并渲染完成后才恢复滚动（此时行高已稳定，直接设 scrollTop 生效）
  await nextTick()
  restoreScroll()
  scrollContainer()?.addEventListener('scroll', saveScroll, { passive: true })
})
onUnmounted(() => {
  scrollContainer()?.removeEventListener('scroll', saveScroll)
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer)
})
</script>

<template>
  <div class="cc-wrap">
    <!-- 顶部工具栏 -->
    <div class="cc-toolbar">
      <h1 class="cc-title">📋 门店合同收集</h1>
      <div class="cc-search">
        <Input
          v-model="keyword"
          placeholder="输入 Apple ID 或营业执照名称搜索…"
          style="width: calc(320px * var(--vcl-scale))"
        />
      </div>
      <div class="cc-stats">
        <span class="cc-stat-badge cc-stat-contract" :class="{ done: uploadCount.contract > 0 }">
          柜机 {{ uploadCount.contract }}/{{ uploadCount.total }}
        </span>
      </div>
      <button class="cc-btn cc-btn-export" :disabled="exporting" @click="exportZip">
        {{ exporting ? '⏳' : '📦' }} 导出 ZIP
      </button>
      <button class="cc-btn" @click="showStoragePanel = !showStoragePanel">
        {{ storageConfig.backend !== 'local' ? '☁ 云端' : '💾 本地' }}
      </button>
      <button class="cc-btn cc-btn-clear" @click="clearAll"><IconSvg type="trash-2" size="sm" /> 清空</button>
    </div>

    <!-- 存储设置面板（共享组件） -->
    <StorageConfigPanel
      v-model:visible="showStoragePanel"
      :config="storageConfig"
      @save="onStorageConfigSave"
      @cancel="showStoragePanel = false"
    />

    <!-- 表格 -->
    <div class="cc-table-wrap">
      <table class="cc-table">
        <thead>
          <tr>
            <th style="width: calc(90px * var(--vcl-scale))">Apple ID</th>
            <th style="width: calc(140px * var(--vcl-scale))">营业执照名称</th>
            <th style="width: calc(110px * var(--vcl-scale))">柜机协议</th>
            <th style="width: calc(60px * var(--vcl-scale))">状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in filteredStores" :key="s.appleId" class="cc-row">
            <td class="cc-td-id">
              {{ s.appleId }}
            </td>
            <td class="cc-td-license">
              {{ s.license }}
            </td>
            <!-- 柜机协议上传 -->
            <td class="cc-td-upload">
              <Upload
                variant="card"
                mobile-menu
                :label="uploadMap[s.appleId]?.contract ? '' : '柜机'"
                :model-value="getUploadFiles(s.appleId)"
                accept="image/*"
                :custom-request="customRequest"
                @error="toast($event, 'error')"
                @preview="openPreview"
                @update:model-value="(files: UploadFile[]) => onUpload(s.appleId, files)"
              />
            </td>
            <!-- 状态标记 -->
            <td class="cc-td-status">
              <span v-if="uploadMap[s.appleId]?.contract" class="cc-status-done">✓ 完成</span>
              <span v-else class="cc-status-none">-</span>
            </td>
          </tr>
          <tr v-if="filteredStores.length === 0">
            <td
              colspan="4"
              style="text-align: center; padding: calc(40px * var(--vcl-scale)); color: var(--vcl-color-text-muted)"
            >
              无匹配门店
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Toast ref="toastRef" variant="toast" position="top" />

    <!-- 图片全屏预览 -->
    <ImagePreview v-if="previewVisible" :src="previewUrl" @close="previewVisible = false" />
  </div>
</template>

<style scoped>
.cc-wrap {
  padding: calc(16px * var(--vcl-scale));
  max-width: 1200px;
  margin: 0 auto;
}

/* 工具栏 */
.cc-toolbar {
  display: flex;
  align-items: center;
  gap: calc(16px * var(--vcl-scale));
  flex-wrap: wrap;
  padding: calc(12px * var(--vcl-scale)) calc(16px * var(--vcl-scale));
  background: var(--vcl-color-surface, #f8fafc);
  border: 1px solid var(--vcl-color-border, #e2e8f0);
  border-radius: calc(8px * var(--vcl-scale));
  margin-bottom: calc(16px * var(--vcl-scale));
  position: sticky;
  top: 0;
  z-index: 10;
}
.cc-title {
  margin: 0;
  font-size: calc(16px * var(--vcl-scale));
  white-space: nowrap;
}
.cc-search {
  flex: 1;
  min-width: calc(200px * var(--vcl-scale));
}
.cc-stats {
  display: flex;
  gap: calc(8px * var(--vcl-scale));
}
.cc-stat-badge {
  padding: 2px calc(8px * var(--vcl-scale));
  border-radius: calc(10px * var(--vcl-scale));
  font-size: calc(11px * var(--vcl-scale));
  font-weight: 600;
  background: var(--vcl-color-bg-soft);
  color: #94a3b8;
  white-space: nowrap;
}
.cc-stat-badge.done {
  background: var(--vcl-color-success-bg);
  color: var(--vcl-color-success-text);
}
.cc-stat-contract.done {
  background: var(--vcl-color-primary-soft);
  /* 深蓝字在 --vcl-color-primary-soft 上：暗色下该令牌是深底 → 深蓝字不可见，改为随主题 */
  color: var(--vcl-color-primary-on-surface);
}
.cc-btn {
  display: inline-flex;
  align-items: center;
  gap: calc(5px * var(--vcl-scale));
  padding: calc(5px * var(--vcl-scale)) calc(14px * var(--vcl-scale));
  border: 1px solid var(--vcl-color-border);
  border-radius: calc(6px * var(--vcl-scale));
  background: var(--vcl-color-surface);
  cursor: pointer;
  font-size: calc(12px * var(--vcl-scale));
  white-space: nowrap;
}
.cc-btn svg {
  color: var(--vcl-color-text-muted);
}
.cc-btn.cc-btn-clear svg {
  color: var(--vcl-color-danger-on-surface);
}
.cc-btn:hover {
  background: var(--vcl-color-bg-alt, #f1f5f9);
}
.cc-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.cc-btn-export {
  background: #3b82f6;
  color: #fff;
  border-color: var(--vcl-color-primary);
}
.cc-btn-export:hover {
  background: #2563eb;
}
.cc-btn-clear {
  color: var(--vcl-color-danger-on-surface);
}

/* 表格 */
.cc-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--vcl-color-border);
  border-radius: calc(8px * var(--vcl-scale));
}
.cc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: calc(12px * var(--vcl-scale));
  background: var(--vcl-color-bg, #fff);
}
.cc-table th {
  text-align: left;
  padding: calc(8px * var(--vcl-scale)) calc(10px * var(--vcl-scale));
  font-weight: 600;
  font-size: calc(11px * var(--vcl-scale));
  color: var(--vcl-color-text-secondary);
  background: var(--vcl-color-surface, #f8fafc);
  border-bottom: 2px solid var(--vcl-color-border);
  white-space: nowrap;
  position: sticky;
  top: 0;
}
.cc-table td {
  padding: calc(6px * var(--vcl-scale)) calc(10px * var(--vcl-scale));
  border-bottom: 1px solid var(--vcl-color-border);
  vertical-align: middle;
}
.cc-row:hover {
  background: var(--vcl-color-bg-alt, #f8fafc);
}

.cc-td-id {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.cc-td-license {
  max-width: calc(140px * var(--vcl-scale));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cc-td-upload {
  width: calc(90px * var(--vcl-scale));
  padding: calc(4px * var(--vcl-scale)) !important;
  /* Upload card 默认 110×110，缩小适配表格 */
}
.cc-td-upload :deep(.card-wrap) {
  width: calc(80px * var(--vcl-scale)) !important;
  height: calc(80px * var(--vcl-scale)) !important;
}
.cc-td-upload :deep(.card-label) {
  font-size: calc(10px * var(--vcl-scale)) !important;
}

.cc-td-status {
  text-align: center;
  white-space: nowrap;
}
.cc-status-done {
  color: var(--vcl-color-success-text);
  font-weight: 600;
}
.cc-status-none {
  color: #cbd5e1;
}
</style>
