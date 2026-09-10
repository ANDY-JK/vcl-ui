<script setup lang="ts">
import Breadcrumb from '@/components/nav/Breadcrumb.vue'
import Card from '@/components/data/Card.vue'

const crumbs = [{ label: '首页', path: '/' }, { label: '组件库', path: '/components' }, { label: '导航' }]
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Breadcrumb 面包屑</h2>
    <p class="demo-desc">页面层级路径导航。</p>

    <Card title="Breadcrumb 面包屑">
      <Breadcrumb :items="crumbs" />
      <p style="margin-top: 8px; font-size: 12px; color: var(--color-text-muted)">显示页面层级路径</p>
    </Card>

    <Card title="自定义分隔符（separator）">
      <Breadcrumb :items="crumbs" separator="›" />
      <p style="margin-top: 8px; font-size: 12px; color: var(--color-text-muted)">
        传入 separator 后以文本替代默认箭头图标
      </p>
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
          <td style="padding: 3px 8px">
            <code>items</code>
          </td>
          <td style="padding: 3px 8px">Crumb[]</td>
          <td style="padding: 3px 8px">—</td>
          <td style="padding: 3px 8px">面包屑路径数组</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>separator</code>
          </td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">—</td>
          <td style="padding: 3px 8px">自定义分隔符文本（默认箭头图标）</td>
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
