<script setup lang="ts">
import Breadcrumb from '@/components/nav/Breadcrumb.vue'
import Card from '@/components/data/Card.vue'

const crumbs = [{ label: '首页', path: '/' }, { label: '组件库', path: '/components' }, { label: '导航' }]
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Breadcrumb 面包屑</h1>
    <p class="demo-desc">页面层级路径导航。</p>

    <Card title="Breadcrumb 面包屑" title-as="h2">
      <Breadcrumb :items="crumbs" />
      <p
        style="
          margin-top: calc(8px * var(--vcl-scale));
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
        "
      >
        显示页面层级路径
      </p>
    </Card>

    <Card title="自定义分隔符（separator）" title-as="h2">
      <Breadcrumb :items="crumbs" separator="›" />
      <p
        style="
          margin-top: calc(8px * var(--vcl-scale));
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
        "
      >
        传入 separator 后以文本替代默认箭头图标
      </p>
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
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              <code>items</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">Crumb[]</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">—</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">面包屑路径数组</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>separator</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">string</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">—</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              自定义分隔符文本（默认箭头图标）
            </td>
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
