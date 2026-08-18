<script setup lang="ts">
import Upload from '@/components/form/Upload.vue'
import Card from '@/components/data/Card.vue'
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Upload 上传</h2>
    <p class="demo-desc">
      拖拽/点击上传文件，默认图片类型；传 accept 可限定类型，传空字符串 = 全部类型；支持多文件、大小限制、目录上传。
    </p>

    <div class="grid-2-col" style="margin-bottom: 24px">
      <Card title="单文件上传（默认图片）">
        <Upload />
      </Card>

      <Card title="全部类型（accept 为空）">
        <Upload accept="" />
      </Card>

      <Card title="目录上传（webkitdirectory）">
        <Upload directory accept="" />
      </Card>

      <Card title="移动端菜单（mobile-menu，触屏下点开弹「拍照/相册/文件」）">
        <Upload mobile-menu accept="image/*" />
      </Card>

      <Card title="多文件上传（限制图片类型）">
        <Upload multiple accept="image/*" />
      </Card>

      <Card title="限制 5MB">
        <Upload :max-size="5" />
      </Card>

      <Card title="禁用状态">
        <Upload disabled />
      </Card>
    </div>

    <Card title="Props">
      <table style="width: 100%; font-size: 13px; border-collapse: collapse">
        <tr style="border-bottom: 2px solid var(--color-border); text-align: left">
          <th style="padding: 4px 8px">Prop</th>
          <th style="padding: 4px 8px">类型</th>
          <th style="padding: 4px 8px">默认</th>
          <th style="padding: 4px 8px">说明</th>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>accept</code>
          </td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">image/*</td>
          <td style="padding: 3px 8px">接受的文件类型；传空字符串 = 全部类型</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>directory</code>
          </td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">false</td>
          <td style="padding: 3px 8px">目录选择模式（webkitdirectory）</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>mobileMenu</code>
          </td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">false</td>
          <td style="padding: 3px 8px">触屏设备点击弹「拍照/相册/文件」菜单（安卓系统选择器无相机入口）</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>multiple</code>
          </td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">false</td>
          <td style="padding: 3px 8px">多文件上传</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>maxSize</code>
          </td>
          <td style="padding: 3px 8px">number</td>
          <td style="padding: 3px 8px">10</td>
          <td style="padding: 3px 8px">单文件大小限制(MB)</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px">
            <code>disabled</code>
          </td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">false</td>
          <td style="padding: 3px 8px">禁用</td>
        </tr>
      </table>
    </Card>
  </div>
</template>

<style scoped>
.demo-title {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;
}
.demo-desc {
  color: var(--color-text-muted);
  margin-bottom: 24px;
  font-size: 14px;
}
code {
  background: var(--color-bg-alt);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
}
</style>
