/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

/**
 * qrcode 的浏览器端子路径（避免拉入 Node 依赖，FormCollect / SavedFormsDrawer 用它生成分享二维码）。
 * @types/qrcode 只声明了包主入口，子路径无类型 → 两处 QRCode.toDataURL 调用此前被推成 any。
 * 这里整体转发官方命名空间，不手写函数签名，以免与 qrcode 实现漂移。
 */
declare module 'qrcode/lib/browser.js' {
  import * as QRCodeBrowser from 'qrcode'
  export default QRCodeBrowser
}
