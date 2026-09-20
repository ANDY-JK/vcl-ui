<script setup lang="ts">
import Divider from '@/components/data/Divider.vue'
import Card from '@/components/data/Card.vue'
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Divider 分割线</h1>
    <p class="demo-desc">水平/垂直分割线，支持文字、虚线。</p>

    <Card title="Divider 分割线" title-as="h2">
      <div style="display: flex; flex-direction: column; gap: 16px">
        <p>默认分割线</p>
        <Divider />
        <p>带文字</p>
        <Divider text="中间文字" />
        <p>虚线</p>
        <Divider dashed />
        <p>水平和垂直</p>
        <div style="display: flex; align-items: center; height: 40px; gap: 12px">
          <span>左</span>
          <Divider direction="vertical" />
          <span>中</span>
          <Divider direction="vertical" dashed />
          <span>右</span>
        </div>
      </div>
    </Card>

    <Card title="Props" title-as="h2">
      <table style="width: 100%; font-size: 13px; border-collapse: collapse">
        <tbody>
        <tr style="border-bottom: 2px solid var(--color-border); text-align: left">
          <th style="padding: 4px 8px">Prop</th>
          <th style="padding: 4px 8px">类型</th>
          <th style="padding: 4px 8px">默认</th>
          <th style="padding: 4px 8px">说明</th>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>direction</code>
          </td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">horizontal</td>
          <td style="padding: 3px 8px">horizontal | vertical</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>text</code>
          </td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">—</td>
          <td style="padding: 3px 8px">分割线文字</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px">
            <code>dashed</code>
          </td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">false</td>
          <td style="padding: 3px 8px">虚线样式</td>
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
