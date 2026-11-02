<script setup lang="ts">
import Avatar from '@/components/data/Avatar.vue'
import Card from '@/components/data/Card.vue'
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Avatar 头像</h1>
    <p class="demo-desc">文字/图片头像，sm/md/lg/xl 尺寸，支持圆形和圆角。</p>

    <Card title="Avatar 头像" title-as="h2">
      <div style="display: flex; flex-direction: column; gap: calc(16px * var(--vcl-scale))">
        <div>
          <p
            style="
              font-size: calc(12px * var(--vcl-scale));
              color: var(--vcl-color-text-muted);
              margin-bottom: calc(8px * var(--vcl-scale));
            "
          >
            尺寸
          </p>
          <div style="display: flex; gap: calc(12px * var(--vcl-scale)); align-items: center">
            <Avatar name="张三" size="sm" />
            <Avatar name="李四" size="md" />
            <Avatar name="王五" size="lg" />
            <Avatar name="赵六" size="xl" />
          </div>
        </div>
        <div>
          <p
            style="
              font-size: calc(12px * var(--vcl-scale));
              color: var(--vcl-color-text-muted);
              margin-bottom: calc(8px * var(--vcl-scale));
            "
          >
            形状
          </p>
          <div style="display: flex; gap: calc(12px * var(--vcl-scale)); align-items: center">
            <Avatar name="张三" size="lg" shape="circle" />
            <Avatar name="李四" size="lg" shape="rounded" />
          </div>
        </div>
        <div>
          <p
            style="
              font-size: calc(12px * var(--vcl-scale));
              color: var(--vcl-color-text-muted);
              margin-bottom: calc(8px * var(--vcl-scale));
            "
          >
            未知用户占位
          </p>
          <div style="display: flex; gap: calc(12px * var(--vcl-scale)); align-items: center">
            <Avatar name="?" size="md" />
          </div>
        </div>
      </div>
    </Card>

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
            <td><code>src</code></td>
            <td>string</td>
            <td>—</td>
            <td>图片地址；未传时按 name 首字生成文字头像</td>
          </tr>
          <tr>
            <td><code>name</code></td>
            <td>string</td>
            <td>—</td>
            <td>显示名（取首字渲染；文字头像的数据来源）</td>
          </tr>
          <tr>
            <td><code>size</code></td>
            <td>'sm' \| 'md' \| 'lg' \| 'xl'</td>
            <td>'md'</td>
            <td>尺寸档位（默认 'md'）</td>
          </tr>
          <tr>
            <td><code>shape</code></td>
            <td>'circle' \| 'rounded'</td>
            <td>'circle'</td>
            <td>形状：圆形（默认）\| 圆角方</td>
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
