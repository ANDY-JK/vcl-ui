// Upload 内置图片预览护栏：
//   1. 列表变体：有 url 的文件渲染缩略图按钮（此前仅 card 变体生成预览地址，列表图片无预览入口）
//   2. 点缩略图 → 内置 ImagePreview 全屏打开；close 后收回
//   3. previewMode='event'：不弹内置预览，只抛 @preview 事件（消费方自定义行为）
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Upload from '@/components/form/Upload.vue'
import type { UploadFile } from '@/components/form/Upload.vue'

const files: UploadFile[] = [
  { id: 1, name: 'a.png', size: 100, progress: 100, status: 'done', url: 'blob:http://localhost/a' },
  { id: 2, name: 'b.png', size: 200, progress: 100, status: 'done', url: 'blob:http://localhost/b' },
]

describe('Upload 内置图片预览', () => {
  it('列表变体：有 url 的文件渲染可点击缩略图', () => {
    const w = mount(Upload, { props: { modelValue: files } })
    const thumbs = w.findAll('.upload-thumb')
    expect(thumbs.length).toBe(2)
    expect(thumbs[0]!.find('img').attributes('src')).toBe(files[0]!.url)
    // 缩略图必须懒加载：一次挂几十张时不该全量拉原图（主放大图不加，那是点开即要看的）
    expect(thumbs[0]!.find('img').attributes('loading')).toBe('lazy')
  })

  it('点缩略图 → 内置 ImagePreview 打开；close 收回', async () => {
    const w = mount(Upload, { props: { modelValue: files } })
    expect(w.find('.ip-backdrop').exists()).toBe(false)
    await w.findAll('.upload-thumb')[1]!.trigger('click')
    const backdrop = w.find('.ip-backdrop')
    expect(backdrop.exists()).toBe(true)
    // 第二个文件：预览应定位到它
    expect(w.find('.ip-counter').text()).toContain('2 / 2')
    await w.find('[role="dialog"] .ip-header button, [role="dialog"] button').trigger('click')
    // close 事件由内部按钮触发，兜底直接断言收回（用暴露的关闭路径：再触发 backdrop 的 Esc 逻辑不易，改为验证事件通道）
    w.findComponent({ name: 'ImagePreview' }).vm.$emit('close')
    await w.vm.$nextTick()
    expect(w.find('.ip-backdrop').exists()).toBe(false)
  })

  it("previewMode='event'：不弹内置预览，仅抛 @preview", async () => {
    const w = mount(Upload, { props: { modelValue: files, previewMode: 'event' as const } })
    await w.findAll('.upload-thumb')[0]!.trigger('click')
    expect(w.find('.ip-backdrop').exists()).toBe(false)
    expect(w.emitted('preview')![0][0]).toBe(files[0]!.url)
  })

  it('card 变体：点卡片图片直接预览', async () => {
    const w = mount(Upload, { props: { modelValue: files, variant: 'card' } })
    await w.find('.card-img').trigger('click')
    expect(w.find('.ip-backdrop').exists()).toBe(true)
  })
})
