// 复制截图的富文本降级路径会在 body 上临时挂一个 contentEditable div（选区→execCommand('copy')）。
// 中间任何一步抛异常都必须把它收走，否则每失败一次就留下一个游离节点，攒久了没人能清。
// 两条口径：① 正常走完要回收；② 走到一半抛异常也要回收（这条就是修复前会红的那条）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyScreenshotToClipboard } from '@/components/_internal/useScreenshot'

const DATA_URL = 'data:image/png;base64,iVBORw0KGgo='
const holderCount = () => document.querySelectorAll('body > div[contenteditable="true"]').length

const clipboardOwn = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const protoClipboard = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard')

function withoutClipboardApi() {
  Object.defineProperty(navigator, 'clipboard', { value: {}, configurable: true, writable: true })
}

function restoreClipboard() {
  if (clipboardOwn) Object.defineProperty(navigator, 'clipboard', clipboardOwn)
  else delete (navigator as { clipboard?: unknown }).clipboard
  if (protoClipboard) Object.defineProperty(Navigator.prototype, 'clipboard', protoClipboard)
}

/** happy-dom 没有 document.execCommand，补一个：既能断言"确实走到了降级"，也决定复制成不成功 */
function stubExecCommand(result: boolean) {
  const spy = vi.fn(() => result)
  Object.defineProperty(document, 'execCommand', { value: spy, configurable: true })
  return spy
}

describe('截图降级复制的临时节点回收', () => {
  afterEach(() => {
    restoreClipboard()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('前提：Clipboard API 不可用时走的是 execCommand 降级', async () => {
    withoutClipboardApi()
    const exec = stubExecCommand(true)
    expect(holderCount()).toBe(0)
    const ok = await copyScreenshotToClipboard(new Blob(['x'], { type: 'image/png' }), DATA_URL)
    expect(exec).toHaveBeenCalled()
    expect(ok).toBe(true)
  })

  it('正常走完：复制后 body 上不留 contentEditable 临时节点', async () => {
    withoutClipboardApi()
    stubExecCommand(true)
    await copyScreenshotToClipboard(new Blob(['x'], { type: 'image/png' }), DATA_URL)
    expect(holderCount()).toBe(0)
  })

  it('中途抛异常（WebView 下 createRange/选区不可用）：临时节点同样要回收', async () => {
    withoutClipboardApi()
    const exec = stubExecCommand(true)
    vi.spyOn(document, 'createRange').mockImplementation(() => {
      throw new Error('createRange unavailable in this webview')
    })
    const ok = await copyScreenshotToClipboard(new Blob(['x'], { type: 'image/png' }), DATA_URL)
    expect(ok).toBe(false) // 失败要如实返回 false，不能把异常抛给调用方
    expect(exec).not.toHaveBeenCalled() // 前提：确实是在 execCommand 之前断掉的
    expect(holderCount(), '复制失败一次就漏一个游离的 contentEditable div').toBe(0)
  })
})
