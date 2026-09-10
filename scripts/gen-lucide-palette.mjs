// 从 @lucide/vue 真实导出重建 lucide-icons.json（IconPicker 面板名单）
// 旧名单 65% 是坏名字（kebab 转换错误，如 alar-lock → 应为 alarm-clock），点选渲染兜底图
import * as m from '@lucide/vue'
import fs from 'fs'

let names = Object.keys(m)
  .filter((k) => /^[A-Z]/.test(k))
  .filter((k) => {
    // 只保留真实图标组件：全量桶里混着 Icon、createLucideIcon 等非图标导出，
    // 且每个图标有 FooIcon 别名导出（对应文件 FooIcon），按 kebab 后是否以 -icon 结尾剔除
    const kebab = pascalToKebab(k)
    return !kebab.endsWith('-icon') && kebab !== 'icon' && kebab !== 'lucide-context'
  })
  .map((k) => pascalToKebab(k))
  .sort()

function pascalToKebab(p) {
  return p
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

console.log('rebuilt kebab names:', names.length)
console.log('sample:', names.slice(0, 8).join(', '))
fs.writeFileSync('src/components/_internal/lucide-icons.json', JSON.stringify(names))
console.log('written src/components/_internal/lucide-icons.json')
