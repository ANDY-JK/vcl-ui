<script setup lang="ts">
import { ref } from 'vue'
import Drawer from '@/components/feedback/Drawer.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'

const drawerVisible = ref(false)
const drawerLeftVisible = ref(false)
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Drawer 抽屉</h1>
    <p class="demo-desc">从右侧/左侧滑出的面板，支持标题、页脚、遮罩关闭。</p>

    <Card title="Drawer 抽屉" title-as="h2">
      <div style="display: flex; gap: calc(12px * var(--vcl-scale))">
        <Button text="打开右侧抽屉" @click="drawerVisible = true" />
        <Button text="打开左侧抽屉" variant="outline" @click="drawerLeftVisible = true" />
      </div>
    </Card>

    <Drawer v-model:visible="drawerVisible" title="右侧抽屉" placement="right">
      <p style="color: var(--color-text-secondary)">这是一个从右侧滑出的抽屉面板。</p>
      <p
        style="
          color: var(--color-text-muted);
          margin-top: calc(8px * var(--vcl-scale));
          font-size: calc(13px * var(--vcl-scale));
        "
      >
        可以放表单、详情、筛选器等任意内容。
      </p>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: calc(8px * var(--vcl-scale))">
          <Button text="取消" variant="ghost" @click="drawerVisible = false" />
          <Button text="确认" @click="drawerVisible = false" />
        </div>
      </template>
    </Drawer>

    <Drawer v-model:visible="drawerLeftVisible" title="左侧导航" placement="left" width="300px">
      <p style="color: var(--color-text-secondary)">从左侧滑出的面板，常用于移动端导航菜单。</p>
    </Drawer>

    <Card title="Props" title-as="h2">
      <table style="width: 100%; font-size: calc(13px * var(--vcl-scale)); border-collapse: collapse">
        <tbody>
          <tr style="border-bottom: 2px solid var(--color-border); text-align: left">
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">Prop</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">类型</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">默认</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">说明</th>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--color-border-light);
              "
            >
              <code>visible</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">boolean</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">—</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">v-model:visible 绑定</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--color-border-light);
              "
            >
              <code>title</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">string</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">—</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">标题</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--color-border-light);
              "
            >
              <code>placement</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">string</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">right</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">left | right</td>
          </tr>
          <tr>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              <code>width</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">string</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">380px</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">抽屉宽度</td>
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
  color: var(--color-text-muted);
  margin-bottom: calc(24px * var(--vcl-scale));
  font-size: calc(14px * var(--vcl-scale));
}
code {
  background: var(--color-bg-alt);
  padding: 1px calc(5px * var(--vcl-scale));
  border-radius: calc(3px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
}
</style>
