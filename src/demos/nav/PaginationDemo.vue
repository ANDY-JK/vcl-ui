<script setup lang="ts">
import { ref } from 'vue'
import Pagination from '@/components/nav/Pagination.vue'
import Card from '@/components/data/Card.vue'

const page = ref(1)
const page2 = ref(3)
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Pagination 分页</h1>
    <p class="demo-desc">页码导航组件，支持快速跳页。</p>

    <Card title="Pagination 分页" title-as="h2">
      <Pagination v-model="page" :total="86" :page-size="10" />
      <p
        style="
          margin-top: calc(8px * var(--vcl-scale));
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
        "
      >
        第 {{ page }} 页 / 共 9 页
      </p>
    </Card>

    <Card title="快速跳页（showQuickJumper）" title-as="h2">
      <Pagination v-model="page2" :total="86" :page-size="10" show-quick-jumper />
      <p
        style="
          margin-top: calc(8px * var(--vcl-scale));
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
        "
      >
        第 {{ page2 }} 页 — 输入页码后按回车跳转，超出范围自动钳制
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
            <td><code>modelValue</code></td>
            <td>number</td>
            <td>—</td>
            <td>
              受控当前页（v-model:modelValue，1 起）。超出 [1, totalPages] 时组件会把页码拉回合法页并 emit
              纠正值（典型：搜索/筛选后总数变小、宿主没重置页码）
            </td>
          </tr>
          <tr>
            <td><code>total</code></td>
            <td>number</td>
            <td>—</td>
            <td>总条数</td>
          </tr>
          <tr>
            <td><code>pageSize</code></td>
            <td>number</td>
            <td>10</td>
            <td>每页行数（默认 10）</td>
          </tr>
          <tr>
            <td><code>showQuickJumper</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>显示页码快速跳转输入框</td>
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
