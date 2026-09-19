<script setup lang="ts">
import Avatar from '@/components/data/Avatar.vue'
import Card from '@/components/data/Card.vue'
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Avatar 头像</h2>
    <p class="demo-desc">文字/图片头像，sm/md/lg/xl 尺寸，支持圆形和圆角。</p>

    <Card title="Avatar 头像">
      <div style="display: flex; flex-direction: column; gap: 16px">
        <div>
          <p style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 8px">尺寸</p>
          <div style="display: flex; gap: 12px; align-items: center">
            <Avatar name="张三" size="sm" />
            <Avatar name="李四" size="md" />
            <Avatar name="王五" size="lg" />
            <Avatar name="赵六" size="xl" />
          </div>
        </div>
        <div>
          <p style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 8px">形状</p>
          <div style="display: flex; gap: 12px; align-items: center">
            <Avatar name="张三" size="lg" shape="circle" />
            <Avatar name="李四" size="lg" shape="rounded" />
          </div>
        </div>
        <div>
          <p style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 8px">未知用户占位</p>
          <div style="display: flex; gap: 12px; align-items: center">
            <Avatar name="?" size="md" />
          </div>
        </div>
      </div>
    </Card>

    <Card title="Props">
      <table style="width: 100%; font-size: 13px; border-collapse: collapse">
        <tbody>
        <tr style="border-bottom: 2px solid var(--color-border); text-align: left">
          <th style="padding: 4px 8px">Prop</th>
          <th style="padding: 4px 8px">类型</th>
          <th style="padding: 4px 8px">默认</th>
          <th style="padding: 4px 8px">说明</th>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)"><code>name</code></td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">—</td>
          <td style="padding: 3px 8px">显示文字</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)"><code>src</code></td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">—</td>
          <td style="padding: 3px 8px">图片地址</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)"><code>size</code></td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">md</td>
          <td style="padding: 3px 8px">sm | md | lg | xl</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)"><code>shape</code></td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">circle</td>
          <td style="padding: 3px 8px">circle | rounded</td>
        </tr>
      </tbody>
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
