<script setup lang="ts">
// 门店合同收集表单 — 分批收集苹果专柜租赁协议
// 基础存储 API（storageGet/Set/Delete、dbPut/dbGet/dbDelete）见 StorageDemo
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick, toRaw } from 'vue'
import { Upload, Input, Toast } from '@/components'
import ImagePreview from '@/components/data/ImagePreview.vue'
import type { UploadFile } from '@/components/form/Upload.vue'
import { createBackend, validateStorageConfig } from '@/components/storage/contract-storage'
import type { StorageBackend, StorageConfig, StoreUploadState } from '@/components/storage/contract-storage'
import JSZip from 'jszip'

const toastRef = ref<InstanceType<typeof Toast>>()
const toast = (msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') =>
  toastRef.value?.show(msg, type, 2000)

// ===== Excel 静态数据（49 行门店，含汇荣达 41 家 + 立炎卓 8 家） =====
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
    appleId: 3496644,
    name: '汇荣达汨罗市长乐镇姚献忠手机店',
    startDate: '2022-06-24',
    license: '汨罗市长乐镇姚献忠手机店',
    address: '湖南省岳阳市汨罗市长乐镇长新村6组24号中国联通献忠代办点',
    phone: '18673011288',
  },
  {
    appleId: 3496654,
    name: '汇荣达岳阳市湘阴县文星镇新世界手机店',
    startDate: '2022-06-01',
    license: '湘阴县新世界手机城',
    address: '湖南省岳阳市湘阴县北正街新世界',
    phone: '15873041888',
  },
  {
    appleId: 3577361,
    name: '汇荣达岳阳市岳阳县杨林街镇安泰通信店',
    startDate: '2024-06-20',
    license: '岳阳县安泰通信连锁杨林二店',
    address: '湖南省岳阳市岳阳县杨林街镇城山村方包组',
    phone: '18673031204',
  },
  {
    appleId: 3583293,
    name: '汇荣达宁乡市双江口镇宏音手机店',
    startDate: '2024-06-28',
    license: '宁乡县宏音手机店',
    address: '湖南长沙宁乡双江口镇新建街翠翠超市正对面中国电信宏音旗舰店',
    phone: '15111261125',
  },
  {
    appleId: 3594841,
    name: '汇荣达岳阳市平江县安定镇喜洋洋手机店',
    startDate: '2023-09-04',
    license: '平江县喜洋洋通信器材店',
    address: '湖南省岳阳市平江县安定镇喜洋洋手机店',
    phone: '18607407509',
  },
  {
    appleId: 3594844,
    name: '汇荣达岳阳市岳阳县月田镇金巧巧手机店',
    startDate: '2024-01-15',
    license: '岳阳县金巧巧移动专营店',
    address: '湖南省岳阳市岳阳县月田镇金巧巧移动店',
    phone: '18774110809',
  },
  {
    appleId: 3652441,
    name: '汇荣达耒阳市公平圩镇会军手机店',
    startDate: '2024-09-20',
    license: '耒阳市公平圩镇会军电信专营店',
    address: '湖南省衡阳市耒阳市公平圩镇站上中国电信   寄快递写店员名字 (陈翠玲)',
    phone: '15096018999',
  },
  {
    appleId: 3667942,
    name: '汇荣达宁乡市花明楼镇杨俊通讯店',
    startDate: '2023-09-04',
    license: '宁乡县花明楼镇杨俊通讯经营部',
    address: '湖南省长沙市宁乡市花明楼镇幸福大道富米多超市斜对面荣耀',
    phone: '15874137852',
  },
  {
    appleId: 3667945,
    name: '汇荣达汨罗市三江镇科创手机店',
    startDate: '2024-07-31',
    license: '汨罗市三江科创手机店',
    address: '湖南省岳阳市汨罗市三江镇花桥街科信电信手机店',
    phone: '19173026022',
  },
  {
    appleId: 3690712,
    name: '汇荣达郴州市宜章县一六镇祥合手机店',
    startDate: '2024-02-26',
    license: '宜章县祥合手机专卖店',
    address: '湖南省郴州市宜章县一六镇祥合手机专卖店',
    phone: '16673566661',
  },
  {
    appleId: 3724406,
    name: '汇荣达常德市临澧县新安镇天宇通讯店',
    startDate: '2023-09-11',
    license: '临澧县新安天宇通讯经营部',
    address: '湖南省常德市临澧县新安镇天宇移动',
    phone: '15907362180',
  },
  {
    appleId: 3733153,
    name: '汇荣达常德市桃源县架桥镇风标手机店',
    startDate: '2023-09-04',
    license: '桃源县架桥镇风标手机卖场',
    address: '湖南省常德市桃源县架桥镇中国移动风标手机卖场',
    phone: '18873618608',
  },
  {
    appleId: 3733257,
    name: '汇荣达岳阳市岳阳县筻口镇百信手机店',
    startDate: '2024-06-20',
    license: '岳阳县筻口镇筻口移动百信营业厅',
    address: '湖南省岳阳市岳阳县筻口镇筻口农业银行对面',
    phone: '13574022378',
  },
  {
    appleId: 3748676,
    name: '汇荣达津市市新洲镇礼元手机店',
    startDate: '2023-09-11',
    license: '津市市新洲镇礼元自控厅',
    address: '湖南省常德市津市市新洲镇移动营业厅',
    phone: '13875049491',
  },
  {
    appleId: 3748797,
    name: '汇荣达长沙市望城区白箬铺镇向镧通讯店',
    startDate: '2023-09-18',
    license: '长沙市望城区白箬铺镇向镧通讯店',
    address: '湖南省长沙市望城区白若铺镇白若老街中国移动向镧店',
    phone: '15116120088',
  },
  {
    appleId: 3748804,
    name: '汇荣达宁乡市老粮仓镇廖强手机店',
    startDate: '2025-06-19',
    license: '宁乡县老粮仓镇廖强手机店',
    address: '湖南省长沙市宁乡市老粮仓镇老粮仓电信廖强店',
    phone: '18975828818',
  },
  {
    appleId: 4052648,
    name: '汇荣达浏阳市洞阳镇咚咚通讯店',
    startDate: '2023-12-11',
    license: '浏阳市洞阳镇咚咚通讯行',
    address: '湖南省长沙市浏阳市洞阳镇嘉利新世界a2栋1067号',
    phone: '15526425566',
  },
  {
    appleId: 4052669,
    name: '汇荣达浏阳市社港镇锐驰手机店',
    startDate: '2025-06-06',
    license: '浏阳市社港镇锐驰手机通讯行',
    address: '湖南省浏阳市社港镇新港南路155号中国移动',
    phone: '18874818368',
  },
  {
    appleId: 4098711,
    name: '汇荣达醴陵市白兔潭镇彬彬通讯店',
    startDate: '2023-12-27',
    license: '醴陵市白兔潭彬彬通讯店',
    address: '湖南省株洲市醴陵市白兔潭镇车站路陈彬手机店',
    phone: '15273388203',
  },
  {
    appleId: 4098713,
    name: '汇荣达株洲市攸县酒埠江镇梓柔通讯店',
    startDate: '2023-12-27',
    license: '攸县酒埠江镇梓柔通讯行',
    address: '湖南省株洲市攸县酒埠江镇中国移动中心营业厅',
    phone: '15073363335',
  },
  {
    appleId: 4098714,
    name: '汇荣达宁乡市黄材镇羊横通讯店',
    startDate: '2025-06-06',
    license: '宁乡县黄材镇羊横通讯行',
    address: '湖南省长沙市宁乡市黄材镇黄材电信营业厅',
    phone: '15307319352',
  },
  {
    appleId: 4098753,
    name: '汇荣达常德市鼎城区祝丰镇亿客隆手机店',
    startDate: '2023-12-29',
    license: '西洞庭亿客隆手机店',
    address: '湖南省常德市鼎城区祝丰镇西洞庭管理区亿客隆移动手机店',
    phone: '13707360678',
  },
  {
    appleId: 4098754,
    name: '汇荣达长沙市长沙县路口镇九日通讯店',
    startDate: '2023-12-27',
    license: '长沙县路口九日通讯商行',
    address: '湖南省长沙市长沙县路口镇三惠路九日通讯商行',
    phone: '13787795688',
  },
  {
    appleId: 4098755,
    name: '汇荣达岳阳市平江县长寿镇方阳通讯店',
    startDate: '2024-03-11',
    license: '平江县长寿镇方阳通讯店',
    address: '湖南省岳阳市平江县长寿镇华为社会停车场路口',
    phone: '18873077558',
  },
  {
    appleId: 4098756,
    name: '汇荣达娄底市新化县白溪镇吴亦英手机店',
    startDate: '2023-12-27',
    license: '新化县白溪镇中心街移动指定专营',
    address: '湖南省娄底市新化县白溪镇中心街51号',
    phone: '18707385673',
  },
  {
    appleId: 4112683,
    name: '汇荣达浏阳市北盛镇旺顺尚信手机店',
    startDate: '2023-12-29',
    license: '浏阳市北盛镇旺顺尚信手机店',
    address: '湖南省长沙市浏阳市北盛镇旺顺尚信手机店',
    phone: '18008435505',
  },
  {
    appleId: 4112685,
    name: '汇荣达长沙市长沙县黄花镇鑫毅通讯店',
    startDate: '2023-12-29',
    license: '长沙县黄花镇鑫毅通讯商行',
    address: '湖南省长沙市长沙县黄花镇中心广场93.95.97号中国移动龙毅连锁店',
    phone: '15874015062',
  },
  {
    appleId: 4112710,
    name: '汇荣达株洲市炎陵县霞阳镇万顺通讯店',
    startDate: '2024-02-19',
    license: '炎陵县万顺通讯店',
    address: '湖南省株洲市炎陵县霞阳镇井岗路炎陵手机城',
    phone: '18008435505',
  },
  {
    appleId: 4122751,
    name: '汇荣达衡阳市衡阳县洪市镇易通手机店',
    startDate: '2024-02-26',
    license: '衡阳县洪市镇易通联通营业厅',
    address: '湖南省衡阳县洪市镇中国联通',
    phone: '15574777727',
  },
  {
    appleId: 4126735,
    name: '汇荣达岳阳市平江县南江镇福咏手机店',
    startDate: '2024-02-05',
    license: '平江县福咏手机店',
    address: '湖南省岳阳市平江县南江镇农贸市场对面中国电信',
    phone: '13574009785',
  },
  {
    appleId: 4158456,
    name: '汇荣达株洲市攸县皇图岭镇北街通信店',
    startDate: '2024-06-28',
    license: '攸县皇图岭北街移动通信业务代理店',
    address: '湖南省株洲市攸县皇图岭镇移动店（邮政局对面）',
    phone: '13807415571',
  },
  {
    appleId: 4158458,
    name: '汇荣达沅江市草尾镇草尾手机店',
    startDate: '2024-05-08',
    license: '沅江市草尾移动营业所',
    address: '湖南省益阳市沅江市草尾镇草尾大道老车站泰丰手机店',
    phone: '18008435505',
  },
  {
    appleId: 4158462,
    name: '汇荣达耒阳市小水镇蓝光手机店',
    startDate: '2024-05-30',
    license: '耒阳市小水镇蓝光移动业务代办厅',
    address: '湖南省衡阳市耒阳市小水镇中街卫生院',
    phone: '13467773228',
  },
  {
    appleId: 4158480,
    name: '汇荣达常宁市荫田镇一鸣手机店',
    startDate: '2024-06-28',
    license: '常宁市荫田一鸣移动指定专营店',
    address: '湖南省衡阳市常宁市荫田镇农贸市场16号',
    phone: '15273446979',
  },
  {
    appleId: 4158481,
    name: '汇荣达岳阳市平江县伍市镇向中天手机店',
    startDate: '2024-04-12',
    license: '平江县伍市镇向中天移动指定专营店',
    address: '湖南省岳阳市平江县伍市镇居委会农信社旁',
    phone: '15073006688',
  },
  {
    appleId: 4172685,
    name: '汇荣达岳阳市君山区广兴洲镇世玉手机店',
    startDate: '2024-05-17',
    license: '君山区广兴洲镇世玉手机专卖店',
    address: '湖南省岳阳市君山区广兴洲镇广兴南路(鑫佳源大楼)世玉手机店',
    phone: '15073097787',
  },
  {
    appleId: 4175806,
    name: '汇荣达常德市汉寿县太子庙镇立明通讯店',
    startDate: '2024-06-07',
    license: '汉寿县立明通讯器材经营部',
    address: '湖南省常德市汉寿县太子庙镇立明通讯',
    phone: '18907360508',
  },
  {
    appleId: 4179107,
    name: '汇荣达湘潭市湘潭县易俗河镇九峰通讯店',
    startDate: '2024-05-31',
    license: '湘潭县易俗河镇九峰通讯营业厅',
    address: '湖南省湘潭市湘潭县易俗河镇金桂路中联苹果专卖店',
    phone: '13317322133',
  },
  {
    appleId: 4189440,
    name: '汇荣达郴州市宜章县玉溪镇凯璇通讯店',
    startDate: '2024-06-20',
    license: '宜章县凯璇通讯',
    address: '湖南省郴州市宜章县玉溪镇文明南路8-6/7号门面凯璇通讯',
    phone: '15173567666',
  },
  {
    appleId: 4207360,
    name: '汇荣达益阳市赫山区泥江口镇亮亮手机店',
    startDate: '2024-07-03',
    license: '益阳市赫山区泥江口亮亮手机店',
    address: '湖南省益阳市赫山区泥江口镇泥沧路1号',
    phone: '15073794399',
  },
  {
    appleId: 4210810,
    name: '汇荣达岳阳市岳阳县长湖乡宏图通信店',
    startDate: '2024-06-28',
    license: '岳阳县长湖乡电信宏图营业店',
    address: '湖南省岳阳市岳阳县长湖乡范家集镇中国电信',
    phone: '18008435505',
  },
  {
    appleId: 3690708,
    name: '立炎卓邵阳市邵阳县长阳铺镇何杰通讯店',
    startDate: '2023-12-29',
    license: '邵阳县长阳铺镇联通专营店',
    address: '湖南省邵阳市邵阳县长阳铺镇何杰联通专营店',
    phone: '',
  },
  {
    appleId: 4112652,
    name: '立炎卓怀化市沅陵县官庄镇辰龙手机店',
    startDate: '2024-05-17',
    license: '沅陵县何老板通讯行（个体工商户）',
    address: '湖南省怀化市沅陵县官庄镇辰龙大道何云星联通营业厅',
    phone: '',
  },
  {
    appleId: 4126745,
    name: '立炎卓邵阳市绥宁县长铺镇王希手机店',
    startDate: '2024-03-04',
    license: '绥宁县长铺镇中心街营业部',
    address: '湖南省邵阳市绥宁县长铺镇中心街王希手机',
    phone: '',
  },
  {
    appleId: 4149008,
    name: '立炎卓邵东市廉桥镇跃红手机店',
    startDate: '2024-03-29',
    license: '邵东市廉桥镇跃红手机专卖二店',
    address: '湖南省邵阳市邵东市廉桥镇跃红手机专卖二店',
    phone: '',
  },
  {
    appleId: 4152412,
    name: '立炎卓邵阳市新邵县酿溪镇三杰通信店',
    startDate: '2024-04-19',
    license: '新邵县酿溪镇三杰通信服务店',
    address: '湖南省邵阳市新邵县酿溪镇三杰通信',
    phone: '',
  },
  {
    appleId: 4165340,
    name: '立炎卓湘西州市凤凰县茶田镇议华手机店',
    startDate: '2024-05-17',
    license: '凤凰县茶田镇电信全网通手机卖场',
    address: '湖南省湘西土家族苗族自治州凤凰县茶田镇正街电信全网通手机卖场',
    phone: '',
  },
  {
    appleId: 4169242,
    name: '立炎卓邵阳市新宁县金石镇宏基手机店',
    startDate: '2024-05-22',
    license: '新宁县宏基移动通信专营店',
    address: '湖南省邵阳市新宁县金石镇春风路宏基移动通信专营店',
    phone: '',
  },
  {
    appleId: 4189411,
    name: '立炎卓邵阳市新宁县回龙寺镇周军手机店',
    startDate: '2024-06-20',
    license: '新宁县回龙寺镇周军手机专卖店',
    address: '湖南省邵阳市新宁县回龙寺镇政府门面周军手机专卖店',
    phone: '',
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
  // 默认云端配置来自 .env.local（VITE_SUPABASE_*），面板打开即预填；未配置则为空
  const defaultSupabase = {
    url: import.meta.env.VITE_SUPABASE_URL ?? '',
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    bucket: import.meta.env.VITE_SUPABASE_BUCKET ?? '',
  }
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) {
      const c = JSON.parse(raw) as StorageConfig
      // 已存配置必须是合法结构：supabase 后端但 url/anonKey/bucket 缺失的坏配置
      // （线上构建 env 为空时保存过）会卡死加载，忽略并回退默认
      if (c && (c.backend === 'local' || (c.backend === 'supabase' && !validateStorageConfig(c)))) {
        return c
      }
    }
  } catch {
    /* 配置损坏则回退默认 */
  }
  // env 三项配齐才默认云端；否则默认本地——线上构建（无 env）若默认 supabase，
  // createBackend 会因空配置抛错 → 整页加载失败（ErrorBoundary），用户看到的是空白
  const hasSupabase = Boolean(defaultSupabase.url && defaultSupabase.anonKey && defaultSupabase.bucket)
  return hasSupabase
    ? { backend: 'supabase', ...defaultSupabase }
    : { backend: 'local', url: '', anonKey: '', bucket: '' }
}

function persistConfig(): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(storageConfig.value))
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
    toast(backend.kind === 'supabase' ? '云端加载失败，请检查配置或网络' : '本地加载失败', 'error')
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

async function saveStorageConfig(): Promise<void> {
  const err = validateStorageConfig(storageConfig.value)
  if (err) {
    toast(err, 'error')
    return
  }
  saving.value = true
  try {
    persistConfig()
    resetBackend() // 配置变更后重建后端实例
    await reloadFromBackend()
    showStoragePanel.value = false
    toast(`已切换到${storageConfig.value.backend === 'supabase' ? '云端存储' : '本地存储'}`, 'success')
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
    toast(`已清空全部上传记录（${storageConfig.value.backend === 'supabase' ? '本地+云端' : '本地'}）`, 'success')
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
  const XLSX = await import('xlsx')
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
    a.href = URL.createObjectURL(blob)
    a.download = `门店合同收集_${new Date().toISOString().slice(0, 10)}.zip`
    a.click()
    URL.revokeObjectURL(a.href)
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
      <h2 class="cc-title">📋 门店合同收集</h2>
      <div class="cc-search">
        <Input v-model="keyword" placeholder="输入 Apple ID 或营业执照名称搜索…" style="width: 320px" />
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
        {{ storageConfig.backend === 'supabase' ? '☁ 云端' : '💾 本地' }}
      </button>
      <button class="cc-btn cc-btn-clear" @click="clearAll">🗑 清空</button>
    </div>

    <!-- 存储设置面板 -->
    <div v-if="showStoragePanel" class="cc-storage-panel">
      <div class="cc-storage-row">
        <span class="cc-storage-label">存储后端</span>
        <label class="cc-storage-option">
          <input v-model="storageConfig.backend" type="radio" value="local" /> 本地（IndexedDB，仅当前设备）
        </label>
        <label class="cc-storage-option">
          <input v-model="storageConfig.backend" type="radio" value="supabase" /> Supabase 云端（跨设备同步）
        </label>
      </div>
      <template v-if="storageConfig.backend === 'supabase'">
        <div class="cc-storage-row">
          <span class="cc-storage-label">项目 URL</span>
          <Input v-model="storageConfig.url" placeholder="https://xxxx.supabase.co" style="flex: 1" />
        </div>
        <div class="cc-storage-row">
          <span class="cc-storage-label">anon key</span>
          <Input v-model="storageConfig.anonKey" placeholder="eyJhbGciOi..." style="flex: 1" />
        </div>
        <div class="cc-storage-row">
          <span class="cc-storage-label">bucket</span>
          <Input v-model="storageConfig.bucket" placeholder="contracts" style="flex: 1" />
        </div>
        <p class="cc-storage-tip">
          图片/任意文件将存入该 bucket（需在 Supabase 控制台建 public bucket）， 元数据即文件本身：对象名
          {appleId}-{文件名}，跨设备可同步。 切换存储不会自动搬运已有数据。
        </p>
      </template>
      <div class="cc-storage-actions">
        <button class="cc-btn cc-btn-export" :disabled="saving" @click="saveStorageConfig">
          {{ saving ? '保存中…' : '保存并切换' }}
        </button>
        <button class="cc-btn" @click="showStoragePanel = false">取消</button>
      </div>
    </div>

    <!-- 表格 -->
    <div class="cc-table-wrap">
      <table class="cc-table">
        <thead>
          <tr>
            <th style="width: 90px">Apple ID</th>
            <th style="width: 140px">营业执照名称</th>
            <th style="width: 110px">柜机协议</th>
            <th style="width: 60px">状态</th>
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
            <td colspan="4" style="text-align: center; padding: 40px; color: var(--color-text-muted)">无匹配门店</td>
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
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
}

/* 工具栏 */
.cc-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 12px 16px;
  background: var(--color-surface, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  margin-bottom: 16px;
  position: sticky;
  top: 0;
  z-index: 10;
}
.cc-title {
  margin: 0;
  font-size: 16px;
  white-space: nowrap;
}
.cc-search {
  flex: 1;
  min-width: 200px;
}
.cc-stats {
  display: flex;
  gap: 8px;
}
.cc-stat-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background: #f1f5f9;
  color: #94a3b8;
  white-space: nowrap;
}
.cc-stat-badge.done {
  background: #d1fae5;
  color: #065f46;
}
.cc-stat-contract.done {
  background: #dbeafe;
  color: #1e40af;
}
.cc-btn {
  padding: 5px 14px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}
.cc-btn:hover {
  background: var(--color-bg-alt, #f1f5f9);
}
.cc-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.cc-btn-export {
  background: #3b82f6;
  color: #fff;
  border-color: #3b82f6;
}
.cc-btn-export:hover {
  background: #2563eb;
}
.cc-btn-clear {
  color: #ef4444;
}

/* 存储设置面板 */
.cc-storage-panel {
  background: var(--color-surface, #f8fafc);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cc-storage-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cc-storage-label {
  width: 90px;
  font-size: 12px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}
.cc-storage-option {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  cursor: pointer;
}
.cc-storage-tip {
  margin: 0;
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.6;
}
.cc-storage-actions {
  display: flex;
  gap: 8px;
}

/* 表格 */
.cc-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}
.cc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  background: var(--color-bg, #fff);
}
.cc-table th {
  text-align: left;
  padding: 8px 10px;
  font-weight: 600;
  font-size: 11px;
  color: var(--color-text-secondary);
  background: var(--color-surface, #f8fafc);
  border-bottom: 2px solid var(--color-border);
  white-space: nowrap;
  position: sticky;
  top: 0;
}
.cc-table td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}
.cc-row:hover {
  background: var(--color-bg-alt, #f8fafc);
}

.cc-td-id {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.cc-td-license {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cc-td-upload {
  width: 90px;
  padding: 4px !important;
  /* Upload card 默认 110×110，缩小适配表格 */
}
.cc-td-upload :deep(.card-wrap) {
  width: 80px !important;
  height: 80px !important;
}
.cc-td-upload :deep(.card-label) {
  font-size: 10px !important;
}

.cc-td-status {
  text-align: center;
  white-space: nowrap;
}
.cc-status-done {
  color: #059669;
  font-weight: 600;
}
.cc-status-none {
  color: #cbd5e1;
}
</style>
