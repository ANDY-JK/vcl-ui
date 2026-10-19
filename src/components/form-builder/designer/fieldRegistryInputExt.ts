// 输入型扩展字段（2026-10-19）：map-picker 地图选点 / toggle-list 开关列表
//
// 拆出来的原因：fieldRegistry.ts 已贴近 form-builder 域的 800 行止涨线，
// 而这两个字段共同点是"既有输入语义、又复用展示类的能力"——
// 放在一起便于看出它们的定位：不是纯展示（isLayout=false，会产出值进提交数据）。
import Input from '@/components/form/Input.vue'
import type { FieldRegistration } from '../fieldRegistry'

export const INPUT_EXT_REGISTRATIONS: Record<string, FieldRegistration> = {
  /**
   * 地图选点：在地图上点击，回填 `{ lng, lat }`。
   *
   * 与展示组的 `amap`（只看，isLayout=true）刻意分开：本类型**产出一个值进提交数据**。
   * 也不与既有 `address` 冲突——address 管"省市区+详情"的文字地址，本类型管精确坐标；
   * 不在这层做反向地理编码（那需要额外请求，失败时会让"选了点却没值"）。
   */
  'map-picker': {
    type: 'map-picker',
    category: 'advanced',
    component: Input,
    componentType: 'map-picker',
    isLayout: false,
    label: 'fbType.mapPicker',
    icon: 'map-pin',
    group: 'fbGroup.advancedFields',
    defaults: () => ({ span: 24 }),
  },
  /**
   * 开关列表：一组带开关的行，**值 = 被打开行的 id 数组**。
   *
   * 它同时消费 `displaySource`（列表从哪来）与产出字段值，是"展示+输入"双属性的字段：
   * 数据源那侧复用展示类那一套三模式，值这侧走常规 v-model。
   *
   * 组件本身是"就地改行"模型，所以渲染器**必须传本地副本**——否则用户拨一下开关
   * 就把共享的数据源改了。
   */
  'toggle-list': {
    type: 'toggle-list',
    category: 'advanced',
    component: Input,
    componentType: 'toggle-list',
    isLayout: false,
    label: 'fbType.toggleList',
    icon: 'toggle-left',
    group: 'fbGroup.advancedFields',
    defaults: () => ({
      span: 24,
      rowKey: 'id',
      toggleField: 'is_enabled',
      displaySource: { kind: 'static', staticData: [] },
    }),
  },
}
