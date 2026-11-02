<script setup lang="ts">
import Divider from '@/components/data/Divider.vue'
import Card from '@/components/data/Card.vue'
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Divider 分割线</h1>
    <p class="demo-desc">水平/垂直分割线，支持文字、虚线。</p>

    <Card title="Divider 分割线" title-as="h2">
      <div style="display: flex; flex-direction: column; gap: calc(16px * var(--vcl-scale))">
        <p>默认分割线</p>
        <Divider />
        <p>带文字</p>
        <Divider text="中间文字" />
        <p>虚线</p>
        <Divider dashed />
        <p>水平和垂直</p>
        <div
          style="
            display: flex;
            align-items: center;
            height: calc(40px * var(--vcl-scale));
            gap: calc(12px * var(--vcl-scale));
          "
        >
          <span>左</span>
          <Divider direction="vertical" />
          <span>中</span>
          <Divider direction="vertical" dashed />
          <span>右</span>
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
            <td><code>text</code></td>
            <td>string</td>
            <td>—</td>
            <td>分隔线文案（居中显示在线上）</td>
          </tr>
          <tr>
            <td><code>direction</code></td>
            <td>'horizontal' \| 'vertical'</td>
            <td>'horizontal'</td>
            <td>方向：水平线（默认）\| 垂直线</td>
          </tr>
          <tr>
            <td><code>dashed</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>虚线样式</td>
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
