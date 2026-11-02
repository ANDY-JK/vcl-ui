<script setup lang="ts">
import { ref } from 'vue'
import Upload from '@/components/form/Upload.vue'
import type { UploadFile } from '@/components/form/Upload.vue'
import Card from '@/components/data/Card.vue'

const multiFiles = ref<UploadFile[]>([])

// 外部错误注入演示（invalid，#341）：Upload 没有 error prop（错误文案由渲染器统一渲染），
// invalid 只翻 aria-invalid —— 父级判定"必传但没传"这类规则时用
const requiredUpload = ref<UploadFile[]>([])
const requiredInvalid = ref(false)

function submitUpload() {
  // 模拟提交期校验：必传但没传 → invalid；传了 → 清掉
  requiredInvalid.value = requiredUpload.value.length === 0
}
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Upload 上传</h1>
    <p class="demo-desc">
      拖拽/点击上传文件，默认图片类型；传 accept 可限定类型，传空字符串 = 全部类型；支持多文件、大小限制、目录上传。
    </p>

    <Card title="外部判定无效 — invalid（#341）" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <p class="demo-hint">
        Upload 没有 <code>error</code> prop（错误文案由表单渲染器统一渲染）； <code>invalid</code> 只翻
        <code>aria-invalid</code>（读屏播报"无效"）—— 父级判定"必传但没传"这类提交期规则时用。
      </p>
      <Upload
        v-model="requiredUpload"
        variant="card"
        label="现场照片（必传）"
        :invalid="requiredInvalid || undefined"
      />
      <div style="display: flex; gap: calc(8px * var(--vcl-scale)); margin-top: calc(8px * var(--vcl-scale))">
        <button
          type="button"
          style="
            padding: calc(6px * var(--vcl-scale)) calc(14px * var(--vcl-scale));
            border: 1px solid var(--vcl-color-border);
            border-radius: var(--vcl-radius-md);
            background: var(--vcl-color-bg);
            cursor: pointer;
          "
          @click="submitUpload"
        >
          模拟提交（未传照片会标无效）
        </button>
      </div>
    </Card>

    <Card title="图片预览（内置）" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <p
        style="
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
          margin-bottom: calc(12px * var(--vcl-scale));
        "
      >
        上传图片后：<b>卡片变体</b>点图片、<b>列表变体</b>点左侧缩略图 → 全屏预览，多图可左右切换，Esc 关闭。
        想自己接管预览UI：传 <code>preview-mode="event"</code>，组件只抛 <code>@preview</code> 事件。
      </p>
      <div class="grid-2-col">
        <div>
          <p style="font-size: calc(12px * var(--vcl-scale)); margin-bottom: calc(8px * var(--vcl-scale))">
            卡片变体（点图片预览）
          </p>
          <Upload variant="card" label="拍照/相册" compress />
        </div>
        <div>
          <p style="font-size: calc(12px * var(--vcl-scale)); margin-bottom: calc(8px * var(--vcl-scale))">
            列表变体（点缩略图预览，多图可切换）
          </p>
          <Upload v-model="multiFiles" multiple accept="image/*" compress />
        </div>
      </div>
    </Card>

    <div class="grid-2-col" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <Card title="单文件上传（默认图片）" title-as="h2">
        <Upload />
      </Card>

      <Card title="全部类型（accept 为空）" title-as="h2">
        <Upload accept="" />
      </Card>

      <Card title="目录上传（webkitdirectory）" title-as="h2">
        <Upload directory accept="" />
      </Card>

      <Card title="移动端菜单（mobile-menu，触屏下点开弹「拍照/相册/文件」）" title-as="h2">
        <Upload mobile-menu accept="image/*" />
      </Card>

      <Card title="多文件上传（限制图片类型）" title-as="h2">
        <Upload multiple accept="image/*" />
      </Card>

      <Card title="限制 5MB" title-as="h2">
        <Upload :max-size="5" />
      </Card>

      <Card title="禁用状态" title-as="h2">
        <Upload disabled />
      </Card>
    </div>

    <Card title="Props" title-as="h2">
      <table style="width: 100%; font-size: calc(13px * var(--vcl-scale)); border-collapse: collapse">
        <tbody>
          <tr style="border-bottom: 2px solid var(--vcl-color-border); text-align: left">
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">Prop</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">类型</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">默认</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">说明</th>
          </tr>
          <tr>
            <td><code>invalid</code></td>
            <td>boolean</td>
            <td>—</td>
            <td>
              外部判定为无效（不带文案）：挂到投放区的 aria-invalid。 文件输入本身 aria-hidden +
              tabindex=-1，**无障碍焦点在 role=button 的投放区上**， 所以状态要挂在投放区（#341 / TD-99）。
            </td>
          </tr>
          <tr>
            <td><code>describedby</code></td>
            <td>string</td>
            <td>—</td>
            <td>外部错误元素的 id：挂到 aria-describedby，让读屏能回查「为什么无效」</td>
          </tr>
          <tr>
            <td><code>accept</code></td>
            <td>string</td>
            <td>'image/*'</td>
            <td>接受的文件类型：默认图片；传空字符串 = 全部类型（含目录里的文件）</td>
          </tr>
          <tr>
            <td><code>multiple</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>多文件</td>
          </tr>
          <tr>
            <td><code>maxSize</code></td>
            <td>number</td>
            <td>10</td>
            <td>单文件大小上限（MB，默认 10）</td>
          </tr>
          <tr>
            <td><code>minSize</code></td>
            <td>number</td>
            <td>—</td>
            <td>单文件大小下限（KB）</td>
          </tr>
          <tr>
            <td><code>disabled</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>禁用</td>
          </tr>
          <tr>
            <td><code>drag</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>拖拽上传（默认开）</td>
          </tr>
          <tr>
            <td><code>modelValue</code></td>
            <td>UploadFile[]</td>
            <td>() => []</td>
            <td>受控文件列表（v-model:modelValue，UploadFile[]）</td>
          </tr>
          <tr>
            <td><code>customRequest</code></td>
            <td>(file: File) => Promise&lt;{ url: string }></td>
            <td>undefined</td>
            <td>自定义上传：替代内置请求，返回 { url }；失败时 reject 走 error 事件</td>
          </tr>
          <tr>
            <td><code>variant</code></td>
            <td>'default' \| 'card'</td>
            <td>'default'</td>
            <td>'default' 标准上传区 \| 'card' 紧凑方块卡片</td>
          </tr>
          <tr>
            <td><code>label</code></td>
            <td>string</td>
            <td>''</td>
            <td>card 模式下的显示标签</td>
          </tr>
          <tr>
            <td><code>directory</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>目录选择模式（webkitdirectory）：选择整个文件夹上传（隐式多文件），仍按 accept 校验每个文件</td>
          </tr>
          <tr>
            <td><code>mobileMenu</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>触屏设备点击弹「拍照/相册/文件」菜单（安卓系统选择器无相机入口，以此补齐拍照能力）；桌面不受影响</td>
          </tr>
          <tr>
            <td><code>compress</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>图片压缩：开启后图片文件会经过 canvas 压缩再上传（移动端尤其需要）</td>
          </tr>
          <tr>
            <td><code>maxWidth</code></td>
            <td>number</td>
            <td>1920</td>
            <td>图片压缩最大宽度（px），超过时等比缩小；默认 1920</td>
          </tr>
          <tr>
            <td><code>compressQuality</code></td>
            <td>number</td>
            <td>0.85</td>
            <td>图片压缩质量 0-1；默认 0.85</td>
          </tr>
          <tr>
            <td><code>maxConcurrent</code></td>
            <td>number</td>
            <td>—</td>
            <td>
              同时在飞的文件数（压缩+上传）。默认 3：按浏览器同源约 6 条连接取半，
              给页面其它请求留通道；服务端有并发/限流策略时按更严的那个设
            </td>
          </tr>
          <tr>
            <td><code>previewMode</code></td>
            <td>'builtin' \| 'event'</td>
            <td>'builtin'</td>
            <td>图片预览：'builtin' 点击图片直接打开内置全屏预览（默认）；'event' 仅抛 preview 事件由消费方自行处理</td>
          </tr>
        </tbody>
      </table>
    </Card>
  </div>
</template>

<style scoped>
.demo-title {
  font-size: var(--vcl-fs-20);
  font-weight: 700;
  margin-bottom: calc(4px * var(--vcl-scale));
}
.demo-desc {
  color: var(--vcl-color-text-muted);
  margin-bottom: calc(24px * var(--vcl-scale));
  font-size: calc(14px * var(--vcl-scale));
}
code {
  background: var(--vcl-color-bg-alt);
  padding: 1px calc(5px * var(--vcl-scale));
  border-radius: calc(3px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
}
</style>
