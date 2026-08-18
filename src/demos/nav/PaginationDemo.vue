<script setup lang="ts">
import { ref } from 'vue'
import Pagination from '@/components/nav/Pagination.vue'
import Card from '@/components/data/Card.vue'

const page = ref(1)
const page2 = ref(3)
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Pagination 分页</h2>
    <p class="demo-desc">页码导航组件，支持快速跳页。</p>

    <Card title="Pagination 分页">
      <Pagination v-model="page" :total="86" :page-size="10" />
      <p style="margin-top: 8px; font-size: 12px; color: var(--color-text-muted)">第 {{ page }} 页 / 共 9 页</p>
    </Card>

    <Card title="快速跳页（showQuickJumper）">
      <Pagination v-model="page2" :total="86" :page-size="10" show-quick-jumper />
      <p style="margin-top: 8px; font-size: 12px; color: var(--color-text-muted)">
        第 {{ page2 }} 页 — 输入页码后按回车跳转，超出范围自动钳制
      </p>
    </Card>

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
            <code>total</code>
          </td>
          <td style="padding: 3px 8px">number</td>
          <td style="padding: 3px 8px">—</td>
          <td style="padding: 3px 8px">数据总数</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px">
            <code>pageSize</code>
          </td>
          <td style="padding: 3px 8px">number</td>
          <td style="padding: 3px 8px">10</td>
          <td style="padding: 3px 8px">每页条数</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px">
            <code>showQuickJumper</code>
          </td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">false</td>
          <td style="padding: 3px 8px">显示快速跳页输入框</td>
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
