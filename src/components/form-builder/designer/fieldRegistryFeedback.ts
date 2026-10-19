// 注册 result / loading 两个告知型展示元素（严格来说不属于"要取数"的展示，但同属展示分组）
import Divider from '@/components/data/Divider.vue'
import type { FieldRegistration } from '../fieldRegistry'

export const DISPLAY_FEEDBACK_REGISTRATIONS: Record<string, FieldRegistration> = {
  result: {
    type: 'result',
    category: 'layout',
    component: Divider,
    componentType: 'result',
    isLayout: true,
    label: 'fbType.result',
    icon: 'circle-check',
    group: 'fbGroup.display',
    defaults: () => ({ span: 24, hint: '', resultStatus: 'success' }),
  },
  loading: {
    type: 'loading',
    category: 'layout',
    component: Divider,
    componentType: 'loading',
    isLayout: true,
    label: 'fbType.loading',
    icon: 'loader-circle',
    group: 'fbGroup.display',
    defaults: () => ({ span: 24, loadingVariant: 'spinner', size: 'md' }),
  },
}
