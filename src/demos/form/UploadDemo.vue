<script setup lang="ts">
import { ref } from 'vue'
import Upload from '@/components/form/Upload.vue'
import type { UploadFile } from '@/components/form/Upload.vue'
import Card from '@/components/data/Card.vue'

const multiFiles = ref<UploadFile[]>([])
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Upload 上传</h1>
    <p class="demo-desc">
      拖拽/点击上传文件，默认图片类型；传 accept 可限定类型，传空字符串 = 全部类型；支持多文件、大小限制、目录上传。
    </p>

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
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>accept</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">string</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">image/*</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              接受的文件类型；传空字符串 = 全部类型
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>directory</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">boolean</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">false</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              目录选择模式（webkitdirectory）
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>mobileMenu</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">boolean</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">false</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              触屏设备点击弹「拍照/相册/文件」菜单（安卓系统选择器无相机入口）
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>multiple</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">boolean</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">false</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">多文件上传</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>maxSize</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">number</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">10</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">单文件大小限制(MB)</td>
          </tr>
          <tr>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              <code>disabled</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">boolean</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">false</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">禁用</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>preview-mode</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">'builtin' | 'event'</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">builtin</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              图片预览：builtin = 内置全屏预览；event = 只抛 @preview 事件
            </td>
          </tr>
        </tbody>
      </table>
    </Card>
  </div>
</template>

<style scoped>
.demo-title {
  font-size: calc(22px * var(--vcl-scale));
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
