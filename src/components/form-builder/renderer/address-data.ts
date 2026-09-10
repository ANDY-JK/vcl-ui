// 地址省市数据（领域数据按 i18n 规范保留原文，不进语言包）
// ⚠️ 内置为演示级子集（非完整区划表）：生产场景经 RendererAddress 的 addressData prop
//    注入完整数据（如 china-division / 民政部区划表），结构：{ provinces: string[], cities: Record<省, 市[]> }
export const addressProvinces = [
  '北京市',
  '上海市',
  '广东省',
  '浙江省',
  '江苏省',
  '山东省',
  '四川省',
  '湖北省',
  '湖南省',
  '福建省',
]

export const addressCities: Record<string, string[]> = {
  北京市: ['东城区', '西城区', '朝阳区', '海淀区'],
  上海市: ['黄浦区', '徐汇区', '长宁区', '浦东新区'],
  广东省: ['广州市', '深圳市', '东莞市', '佛山市'],
  浙江省: ['杭州市', '宁波市', '温州市', '绍兴市'],
}
