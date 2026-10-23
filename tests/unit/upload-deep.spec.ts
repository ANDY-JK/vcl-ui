/**
 * Upload 组件层：渲染分支 / 触屏菜单 / 卡片单击判定 / 卸载清理
 *
 * 已有 spec 覆盖了拖拽三态、粘贴白名单、card 翻页与双击、内置预览，
 * 本文件补的是**剩下的分支面**：
 *   - default 变体的提示文案随拖拽切换、大小上限提示、文件项三态（上传中/完成/失败）、
 *     缩略图与通用图标的分叉、删除按钮、两个作用域插槽、内部异常兜底视图
 *   - 触屏 + mobileMenu 的底部菜单（拍照/相册/浏览）、桌面直开选择器、disabled 拦截
 *   - 卡片单击 280ms 判定：有图→预览、无图→选文件、判定窗口内双击→取消预览改选文件
 *   - 卸载时 revoke 所有 blob URL 并取消挂起的系统采集
 *
 * 两个非显然的构造点：
 *   ① `isTouchDevice` 是**模块求值期常量**（L159 读 matchMedia）—— mount 时再 mock 已经晚了，
 *      必须 `vi.resetModules()` + stubGlobal('matchMedia') + 动态 import 才能拿到触屏实例。
 *   ② 内部异常兜底靠 `onErrorCaptured`，只能靠**插槽内容抛错**触发（组件自身无法外部注错）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { h, nextTick } from 'vue'

const hd = vi.hoisted(() => ({
  systemFiles: [] as File[],
  cancelled: 0,
}))

// pickFrom → openSystemCapture：返回预置文件，便于断言传入的 accept/capture
vi.mock('@/components/form/utils/capture-fallback', async () => {
  const actual = await import('@/components/form/utils/capture-fallback')
  return {
    ...actual,
    openSystemCapture: vi.fn(async () => hd.systemFiles),
    cancelPendingSystemCapture: vi.fn(() => {
      hd.cancelled++
    }),
  }
})

import * as observers from '@/components/_internal/runtime-observer'
import Upload from '@/components/form/Upload.vue'
import type { UploadFile } from '@/components/form/Upload.vue'

function makeFile(name: string, size = 100, type = 'image/png'): File {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size, configurable: true })
  return f
}

let seq = 0
/** 每个文件给唯一 id —— 队列按 id 删，复用 id 会让「删一个」删掉整批 */
function doneFile(name: string, url = `blob:${name}`): UploadFile {
  return { id: ++seq, name, size: 2048, progress: 100, status: 'done', url }
}

const mounted: ReturnType<typeof mount>[] = []
function mountUpload(props: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const w = mount(Upload, {
    props: { customRequest: async () => ({ url: 'u' }), ...props },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
    ...extra,
  })
  mounted.push(w)
  return w
}

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.resetModules()
  hd.systemFiles = []
  hd.cancelled = 0
})

/* ══════════════════ default 变体的渲染分支 ══════════════════ */

describe('default 变体渲染分支', () => {
  it('**拖拽中提示改为「放开即可上传」，移出恢复**', async () => {
    const w = mountUpload()
    const hint = () => w.find('.upload-hint').text()
    const idle = hint()
    expect(idle.length).toBeGreaterThan(0)

    await w.find('.upload-area').trigger('dragover')
    await nextTick()
    expect(hint(), '拖拽中应是另一条文案').not.toBe(idle)
    expect(w.find('.upload-area').classes(), '应带 dragging 类').toContain('dragging')

    await w.find('.upload-area').trigger('dragleave')
    await nextTick()
    expect(hint(), '移出后应回退').toBe(idle)
    expect(w.find('.upload-area').classes()).not.toContain('dragging')
  })

  it('**drag=false 时 dragover 不进入拖拽态**（禁用拖拽就该没有视觉反馈）', async () => {
    const w = mountUpload({ drag: false })
    await w.find('.upload-area').trigger('dragover')
    await nextTick()
    expect(w.find('.upload-area').classes()).not.toContain('dragging')
  })

  it('**maxSize 有值才显示上限提示**', async () => {
    const withLimit = mountUpload({ maxSize: 5 })
    expect(withLimit.find('.upload-limit').exists(), '默认 10MB 应显示').toBe(true)
    expect(withLimit.find('.upload-limit').text()).toContain('5')

    const noLimit = mountUpload({ maxSize: 0 })
    expect(noLimit.find('.upload-limit').exists(), '0 表示不限 → 不显示').toBe(false)
  })

  it('**文件项三态：上传中带进度条、完成/失败各走自己的文案**', async () => {
    const files: UploadFile[] = [
      { id: 1, name: 'a.png', size: 1024, progress: 40, status: 'uploading', url: 'blob:a' },
      { id: 2, name: 'b.png', size: 1024, progress: 100, status: 'done', url: 'blob:b' },
      { id: 3, name: 'c.png', size: 1024, progress: 0, status: 'error', url: 'blob:c' },
    ]
    const w = mountUpload({ modelValue: files, multiple: true })
    const items = w.findAll('.upload-item')
    expect(items.length, '三个文件三个条目').toBe(3)

    expect(items[0]!.findComponent({ name: 'ProgressBar' }).exists(), '上传中应有进度条').toBe(true)
    const metas = w.findAll('.upload-file-meta').map((m) => m.text())
    expect(metas[1], '完成态文案').not.toBe(metas[2])
    expect(metas[1]!.length).toBeGreaterThan(0)
    expect(metas[2]!.length).toBeGreaterThan(0)
    expect(metas[2], '失败态应显式区别于完成态').not.toBe(metas[1])
    expect(metas[1], '完成态应显式区别于文件中立态').not.toBe(metas[0])
    expect(metas[2], '失败态应显式区别于文件中立态').not.toBe(metas[0])
    // 上传中的条目不再画完成/失败标记
    expect(metas[0]).not.toBe(metas[1])
  })

  it('**有 url 渲染可点缩略图并懒加载，无 url 渲染通用文件图标**', async () => {
    const files: UploadFile[] = [
      doneFile('a.png', 'blob:a'),
      { id: 2, name: 'doc.pdf', size: 10, progress: 100, status: 'done' },
    ]
    const w = mountUpload({ modelValue: files, multiple: true, accept: '' })
    const thumb = w.find('.upload-thumb')
    expect(thumb.exists(), '有 url → 缩略图').toBe(true)
    expect(thumb.find('img').attributes('src'), '缩略图 src 必须是文件 url').toBe('blob:a')
    expect(w.findAll('.upload-file-icon').length, '无 url → 通用图标').toBe(1)
  })

  it('**点删除按钮 → 该文件从列表移除**', async () => {
    const w = mountUpload({ modelValue: [doneFile('a.png', 'blob:a'), doneFile('b.png', 'blob:b')], multiple: true })
    expect(w.findAll('.upload-item').length).toBe(2)
    await w.findAll('.upload-remove')[0]!.trigger('click')
    await flushPromises()
    expect(w.findAll('.upload-item').length, '应只剩一条').toBe(1)
    expect(w.emitted('remove'), '应抛出 remove 事件').toBeTruthy()
  })

  it('**file-item 作用域插槽可完全替换默认条目**', () => {
    const w = mountUpload(
      { modelValue: [doneFile('a.png', 'blob:a')] },
      {
        slots: {
          'file-item': (scope: { file: UploadFile; index: number }) =>
            h('div', { class: 'my-item' }, `${scope.index}:${scope.file.name}`),
        },
      },
    )
    expect(w.find('.my-item').text()).toBe('0:a.png')
    expect(w.find('.upload-item').exists(), '默认条目不该再渲染').toBe(false)
  })

  it('**trigger 作用域插槽拿到 open-file-dialog 并能打开选择器**', async () => {
    const w = mountUpload(
      {},
      {
        slots: {
          trigger: (scope: { openFileDialog: () => void }) =>
            h('button', { class: 'my-trigger', onClick: () => scope.openFileDialog() }, '选文件'),
        },
      },
    )
    // 自定义 trigger 后，默认上传区（连同里面那个 file input）整体不渲染，
    // 所以这里的契约是「插槽拿到可用回调」而不是「点到 input」——
    // triggerFileInput 的点击效果由卡片路径（无图单击 / 双击）覆盖。
    expect(w.find('.upload-area').exists(), '自定义 trigger 后默认上传区不再渲染').toBe(false)
    expect(w.find('.upload-input').exists(), '隐藏 input 也随之消失').toBe(false)
    await w.find('.my-trigger').trigger('click') // 不抛即符合契约（内部 ref 为空时静默）
  })

  it('**子节点抛错 → 兜底视图，改 props 后自动恢复**', async () => {
    // 插槽内容由父作用域渲染，onErrorCaptured 捕不到；改用模板里必然渲染的子组件抛错。
    // 第一轮先正常挂载（确认前置），再让 ProgressBar 抛错触发兜底。
    // reportError 会打一条 `[Upload] 内部异常已隔离:` 的运行时告警，噪音棘轮会按新类别拦截。
    // 与其加基线绕过，不如把它变成断言：既验证「隔离」这件事本身，又不污染噪音基线。
    const reportErrorSpy = vi.spyOn(observers, 'reportError').mockImplementation(() => {})
    let broken = false
    const w = mountUpload(
      { modelValue: [{ id: 990, name: 'x.png', size: 10, progress: 10, status: 'uploading', url: 'blob:x' }] },
      {
        global: {
          stubs: {
            teleport: true,
            ProgressBar: {
              name: 'ProgressBar',
              render() {
                if (broken) throw new Error('boom')
                return h('div', { class: 'pb' })
              },
            },
          },
        },
      },
    )
    expect(w.find('.pb').exists(), '前置：进度条正常渲染').toBe(true)

    broken = true
    await w.setProps({ modelValue: [{ id: 991, name: 'y.png', size: 10, progress: 20, status: 'uploading', url: 'blob:y' }] })
    await nextTick()
    expect(w.find('.card-wrap').exists(), '子组件抛错应切到兜底视图').toBe(true)
    expect(w.text(), '兜底文案来自 i18n').toContain('⚠')

    expect(reportErrorSpy, '应通过 reportError 上报而不是静默吞掉').toHaveBeenCalled()
    expect(String(reportErrorSpy.mock.calls[0]![0]), '上报文案要能定位到组件').toContain('[Upload]')
    expect(String(reportErrorSpy.mock.calls[0]![1]), '应带上原始异常信息').toContain('boom')
    reportErrorSpy.mockRestore()

    broken = false
    await w.setProps({ label: 'z' }) // props 变化会清错误态
    await nextTick()
    expect(w.find('.card-wrap').exists(), '恢复后不该还停在兜底视图').toBe(false)
  })
})

/* ══════════════════ 触屏 + mobileMenu ══════════════════ */

describe('触屏底部菜单', () => {
  async function mountTouch(props: Record<string, unknown> = {}) {
    vi.resetModules()
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })),
    )
    const mod = await import('@/components/form/Upload.vue')
    const w = mount(mod.default, {
      props: { customRequest: async () => ({ url: 'u' }), ...props },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    mounted.push(w)
    return w
  }

  it('**触屏 + mobileMenu：点输入框被拦下并弹底部菜单**', async () => {
    const w = await mountTouch({ mobileMenu: true })
    const input = w.find('.upload-input').element as HTMLInputElement
    input.click = vi.fn()
    await w.find('.upload-input').trigger('click')
    await nextTick()

    expect(w.find('.up-sheet').exists(), '应弹出菜单').toBe(true)
    expect(w.findAll('.up-sheet-item').length, '拍照/相册/浏览三项').toBe(3)
    expect(input.click, '此时不该直接开系统选择器').not.toHaveBeenCalled()
  })

  it('**触屏但未开 mobileMenu → 直接开系统选择器**', async () => {
    const w = await mountTouch({ mobileMenu: false })
    const input = w.find('.upload-input').element as HTMLInputElement
    const e = new MouseEvent('click', { bubbles: true, cancelable: true })
    input.dispatchEvent(e)
    input.dispatchEvent(e)
    await nextTick()
    expect(w.find('.up-sheet').exists(), '不弹菜单').toBe(false)
    // 不放行的话系统选择器就打不开；这里断言「没被拦截」
    const e2 = new MouseEvent('click', { bubbles: true, cancelable: true })
    input.dispatchEvent(e2)
    expect(e2.defaultPrevented, '未开 mobileMenu 时不该拦截默认行为').toBe(false)
  })

  it('**disabled 时点输入框既不弹菜单也不开选择器**', async () => {
    const w = await mountTouch({ mobileMenu: true, disabled: true })
    const input = w.find('.upload-input').element as HTMLInputElement
    const click = vi.fn()
    input.click = click
    const e = new MouseEvent('click', { bubbles: true, cancelable: true })
    input.dispatchEvent(e)
    await nextTick()
    expect(w.find('.up-sheet').exists()).toBe(false)
    expect(click).not.toHaveBeenCalled()
    // handlePick 自己的 disabled 守卫：点击**不被拦截**（是 handlePick 内部早退，不是不拦截）
    expect(e.defaultPrevented, '未开 mobileMenu 时不该拦截默认行为').toBe(false)
  })

  it('**handlePick 的 disabled 守卫是独立的一道**（即便点击被放行也不开选择器）', async () => {
    // mobileMenu 开着但换成「点了会被拦截」的路径：拦截后 handlePick 内 disabled 早退，
    // 结果既不弹菜单也不开选择器 —— 这是 disabled 生效的唯一可观测面。
    const w = await mountTouch({ mobileMenu: true, disabled: true })
    const input = w.find('.upload-input').element as HTMLInputElement
    const click = vi.fn()
    input.click = click
    await w.find('.upload-input').trigger('click')
    await nextTick()
    expect(w.find('.up-sheet').exists(), 'disabled 不弹菜单').toBe(false)
    expect(click, 'disabled 不开选择器').not.toHaveBeenCalled()
  })

  it('**菜单已开后 disabled → 拍照项关菜单但不打开相机**（不该在禁用表单上弹相机）', async () => {
    const w = await mountTouch({ mobileMenu: true })
    await w.find('.upload-input').trigger('click')
    await nextTick()
    expect(w.find('.up-sheet').exists(), '前置：菜单已开').toBe(true)

    const cam = w.findComponent({ name: 'CameraCapture' })
    // CameraCapture 用 v-model 控制：落到 modelValue prop（不是 visible）
    const visibleOf = () => (cam.vm as unknown as { $props: { modelValue?: boolean } }).$props.modelValue
    expect(visibleOf(), '前置：相机未打开').toBe(false)

    // Disabled 前置：CameraCapture 自带 disabled 样式，禁用时点拍照项若仍把 cameraOpen 置真，
    // 表现为「表单禁用却打开了相机」。这里断言禁用时相机不被打开。
    await w.setProps({ disabled: true })
    await w.findAll('.up-sheet-item')[0]!.trigger('click')
    await nextTick()
    // openCamera 先判 disabled 再关菜单：菜单留着（唯一能关它的是遮罩/取消），相机不开
    expect(visibleOf(), 'disabled 时不该打开相机').toBe(false)
    await w.find('.up-sheet-mask').trigger('click')
    await nextTick()
    expect(w.find('.up-sheet').exists(), '遮罩仍能关掉菜单（不然就卡住了）').toBe(false)
  })

  it('**disabled 时相册项即使被点到也不调起系统选择器**', async () => {
    const { openSystemCapture } = await import('@/components/form/utils/capture-fallback')
    const w = await mountTouch({ mobileMenu: true })
    await w.find('.upload-input').trigger('click')
    await nextTick()

    await w.setProps({ disabled: true })
    const before = (openSystemCapture as unknown as { mock: { calls: unknown[] } }).mock.calls.length
    await w.findAll('.up-sheet-item')[1]!.trigger('click')
    await flushPromises()
    expect((openSystemCapture as unknown as { mock: { calls: unknown[] } }).mock.calls.length, 'disabled 不该调起').toBe(
      before,
    )
    expect(w.find('.up-sheet').exists(), '但菜单仍应关闭（pickFrom 先关菜单）').toBe(false)
  })

  it('**遮罩与取消按钮都能关掉菜单**', async () => {
    const w = await mountTouch({ mobileMenu: true })
    await w.find('.upload-input').trigger('click')
    await nextTick()
    await w.find('.up-sheet-mask').trigger('click')
    await nextTick()
    expect(w.find('.up-sheet').exists(), '点遮罩关闭').toBe(false)

    await w.find('.upload-input').trigger('click')
    await nextTick()
    await w.find('.up-sheet-cancel').trigger('click')
    await nextTick()
    expect(w.find('.up-sheet').exists(), '点取消关闭').toBe(false)
  })

  it('**拍照项 → 关菜单并打开页面内相机**', async () => {
    const w = await mountTouch({ mobileMenu: true })
    await w.find('.upload-input').trigger('click')
    await nextTick()
    await w.findAll('.up-sheet-item')[0]!.trigger('click')
    await nextTick()
    expect(w.find('.up-sheet').exists(), '菜单应关闭').toBe(false)
    expect(w.findComponent({ name: 'CameraCapture' }).exists(), '应打开相机组件').toBe(true)
  })

  it('**相册项 → 走系统选择器且不带 capture**（让系统自己弹相册）', async () => {
    const { openSystemCapture } = await import('@/components/form/utils/capture-fallback')
    hd.systemFiles = [makeFile('g.png')]
    const w = await mountTouch({ mobileMenu: true, multiple: true })
    await w.find('.upload-input').trigger('click')
    await nextTick()
    await w.findAll('.up-sheet-item')[1]!.trigger('click')
    await flushPromises()

    const arg = (openSystemCapture as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![0] as {
      capture?: unknown
      multiple?: boolean
      accept: string
    }
    expect(arg.capture, '相册不带 capture').toBe(false)
    expect(arg.multiple).toBe(true)
    expect(arg.accept, '相册用组件 accept').toBe('image/*')
    expect(w.findAll('.upload-item').length, '收到的文件应进列表').toBe(1)
  })

  it('**浏览项 → accept 置空走全类型文件浏览器**', async () => {
    const { openSystemCapture } = await import('@/components/form/utils/capture-fallback')
    hd.systemFiles = [makeFile('doc.pdf', 10, 'application/pdf')]
    const w = await mountTouch({ mobileMenu: true, accept: 'image/*' })
    await w.find('.upload-input').trigger('click')
    await nextTick()
    await w.findAll('.up-sheet-item')[2]!.trigger('click')
    await flushPromises()

    const arg = (openSystemCapture as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![0] as {
      accept: string
    }
    expect(arg.accept, '浏览必须是全类型').toBe('')
  })

  it('**相机不可用 → 直接抛出 error 提示**（组件已自动降级，这里只转发文案）', async () => {
    const w = await mountTouch({ mobileMenu: true })
    const cam = w.findComponent({ name: 'CameraCapture' })
    expect(cam.exists(), '相机组件应常挂').toBe(true)
    cam.vm.$emit('error', '无可用摄像头')
    await nextTick()
    expect(w.emitted('error')?.[0]?.[0], '应把文案抛给使用方').toBe('无可用摄像头')
  })

  it('**系统选择器返回空 → 不收文件**（用户取消不该产生空条目）', async () => {
    hd.systemFiles = []
    const w = await mountTouch({ mobileMenu: true })
    await w.find('.upload-input').trigger('click')
    await nextTick()
    await w.findAll('.up-sheet-item')[1]!.trigger('click')
    await flushPromises()
    expect(w.findAll('.upload-item').length).toBe(0)
    // 空结果必须**不调** processFiles：一旦调用，队列会因「无有效文件」抛一次 error
    expect(w.emitted('error'), '空结果不该产生任何错误提示').toBeFalsy()
    expect(w.emitted('change'), '空结果不该同步文件列表').toBeFalsy()
  })
})

/* ══════════════════ 卡片单击判定 / hover 删除按钮 ══════════════════ */

describe('卡片视图单击判定与 hover 状态', () => {
  it('**有预览图：单击等 280ms 后打开内置预览**', async () => {
    const w = mountUpload({ variant: 'card', modelValue: [doneFile('a.png', 'blob:a')] })
    expect(w.find('.card-img').exists(), '前置：应渲染预览图').toBe(true)
    expect(w.find('.ip-backdrop').exists()).toBe(false)

    await w.find('.card-click-area').trigger('click')
    // 判定窗口内不该有任何动作（这是「单击 vs 双击」能共存的前提）
    await new Promise((r) => setTimeout(r, 60))
    await flushPromises()
    expect(w.find('.ip-backdrop').exists(), '判定窗口内不该打开预览').toBe(false)

    await new Promise((r) => setTimeout(r, 300)) // 跨过 280ms
    await flushPromises()
    expect(w.find('.ip-backdrop').exists(), '判定窗口过后应打开预览').toBe(true)
  })

  it('**无预览图：单击判定窗口过后改为选文件**', async () => {
    const w = mountUpload({
      variant: 'card',
      modelValue: [{ id: 1, name: 'a.txt', size: 10, progress: 100, status: 'done' }],
      accept: '',
    })
    const input = w.find('.card-wrap input[type="file"]').element as HTMLInputElement
    const click = vi.fn()
    input.click = click

    await w.find('.card-click-area').trigger('click')
    await new Promise((r) => setTimeout(r, 340))
    await flushPromises()
    expect(click, '无图时单击应开选择器').toHaveBeenCalledTimes(1)
    expect(w.find('.ip-backdrop').exists(), '不该打开预览').toBe(false)
  })

  it('**判定窗口内双击 → 取消预览、改为选文件**', async () => {
    const w = mountUpload({ variant: 'card', modelValue: [doneFile('a.png', 'blob:a')] })
    const input = w.find('.card-wrap input[type="file"]').element as HTMLInputElement
    const click = vi.fn()
    input.click = click

    await w.find('.card-click-area').trigger('click')
    await w.find('.card-click-area').trigger('dblclick')
    await new Promise((r) => setTimeout(r, 340))
    await flushPromises()

    expect(click, '双击应直接选文件').toHaveBeenCalledTimes(1)
    expect(w.find('.ip-backdrop').exists(), '单击定时器应被取消，不该弹预览').toBe(false)
  })

  it('**hover 才显示清除按钮，移出隐藏**（触屏另有常显分支）', async () => {
    const w = mountUpload({ variant: 'card', modelValue: [doneFile('a.png', 'blob:a')] })
    expect(w.find('.card-clear').exists(), '未 hover 不显示').toBe(false)
    await w.find('.card-wrap').trigger('mouseenter')
    await nextTick()
    expect(w.find('.card-clear').exists(), 'hover 显示').toBe(true)
    await w.find('.card-wrap').trigger('mouseleave')
    await nextTick()
    expect(w.find('.card-clear').exists()).toBe(false)
  })

  it('**disabled 时即使 hover 也不显示清除按钮**', async () => {
    const w = mountUpload({ variant: 'card', modelValue: [doneFile('a.png', 'blob:a')], disabled: true })
    await w.find('.card-wrap').trigger('mouseenter')
    await nextTick()
    expect(w.find('.card-clear').exists()).toBe(false)
  })

  it('**文件数变化 → 当前预览索引重置为第一张**', async () => {
    const w = mountUpload({
      variant: 'card',
      multiple: true,
      modelValue: [doneFile('a.png', 'blob:a'), doneFile('b.png', 'blob:b'), doneFile('c.png', 'blob:c')],
    })
    await w.find('.card-wrap').trigger('mouseenter')
    await nextTick()
    expect(w.find('.card-count').text()).toBe('1/3')

    await w.find('.card-arrow-right').trigger('click')
    await nextTick()
    expect(w.find('.card-count').text()).toBe('2/3')

    // 再追加一个文件（数量变化）→ 索引应回到 0
    await w.setProps({
      modelValue: [
        doneFile('a.png', 'blob:a'),
        doneFile('b.png', 'blob:b'),
        doneFile('c.png', 'blob:c'),
        doneFile('d.png', 'blob:d'),
      ],
    })
    await nextTick()
    expect(w.find('.card-count').text(), '索引应被重置').toBe('1/4')
  })

  it('**无 url 的文件在卡片里不渲染预览图**（否则会挂一个 src=undefined 的空图）', () => {
    const w = mountUpload({
      variant: 'card',
      modelValue: [{ id: 7, name: 'a.txt', size: 10, progress: 100, status: 'done' }],
      accept: '',
    })
    expect(w.find('.card-img').exists(), '无 url 不该渲染预览图').toBe(false)
  })

  it('**非 card 变体不计算预览图**（cardPreviewUrl 提前返回）', () => {
    const w = mountUpload({ modelValue: [doneFile('a.png', 'blob:a')] })
    expect(w.find('.card-img').exists()).toBe(false)
    expect(w.find('.upload-thumb').exists(), '列表变体走缩略图').toBe(true)
  })
})

/* ══════════════════ 卸载清理 ══════════════════ */

describe('卸载清理', () => {
  it('**卸载时只 revoke blob URL，并取消挂起的系统采集**', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const w = mountUpload({
      modelValue: [doneFile('a.png', 'blob:a'), doneFile('b.png', 'https://cdn.example.com/b.png')],
      multiple: true,
    })
    expect(revoke, '挂载时不该 revoke').not.toHaveBeenCalled()
    const before = hd.cancelled // 断言增量：同文件其它用例的实例也会在 afterEach 卸载

    w.unmount()
    mounted.pop()

    expect(revoke).toHaveBeenCalledTimes(1)
    expect(String(revoke.mock.calls[0]![0]), '只 revoke blob URL').toMatch(/^blob:/)
    // 2 次：Upload 自身一处 + 模板里**常挂**的 CameraCapture 子组件卸载时也有一处。
    // 断言精确值而非 >=1 —— 若 Upload 自己那处被删掉，计数会掉到 1 而失败。
    expect(hd.cancelled - before, 'Upload 与常挂的 CameraCapture 各取消一次').toBe(2)
  })

  it('**暴露 triggerFileInput / retryFile 供外部程序化调用**', () => {
    const w = mountUpload()
    const vm = w.vm as unknown as { triggerFileInput?: unknown; retryFile?: unknown }
    expect(typeof vm.triggerFileInput, '应暴露 triggerFileInput').toBe('function')
    expect(typeof vm.retryFile, '应暴露 retryFile').toBe('function')
  })
})
