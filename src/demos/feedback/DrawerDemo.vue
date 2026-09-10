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
    <h2 class="demo-title">Drawer 抽屉</h2>
    <p class="demo-desc">从右侧/左侧滑出的面板，支持标题、页脚、遮罩关闭。</p>

    <Card title="Drawer 抽屉">
      <div style="display: flex; gap: 12px">
        <Button text="打开右侧抽屉" @click="drawerVisible = true" />
        <Button text="打开左侧抽屉" variant="outline" @click="drawerLeftVisible = true" />
      </div>
    </Card>

    <Drawer v-model:visible="drawerVisible" title="右侧抽屉" placement="right">
      <p style="color: var(--color-text-secondary)">这是一个从右侧滑出的抽屉面板。</p>
      <p style="color: var(--color-text-muted); margin-top: 8px; font-size: 13px">
        可以放表单、详情、筛选器等任意内容。
      </p>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px">
          <Button text="取消" variant="ghost" @click="drawerVisible = false" />
          <Button text="确认" @click="drawerVisible = false" />
        </div>
      </template>
    </Drawer>

    <Drawer v-model:visible="drawerLeftVisible" title="左侧导航" placement="left" width="300px">
      <p style="color: var(--color-text-secondary)">从左侧滑出的面板，常用于移动端导航菜单。</p>
    </Drawer>

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
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>visible</code>
          </td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">—</td>
          <td style="padding: 3px 8px">v-model:visible 绑定</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>title</code>
          </td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">—</td>
          <td style="padding: 3px 8px">标题</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>placement</code>
          </td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">right</td>
          <td style="padding: 3px 8px">left | right</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px">
            <code>width</code>
          </td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">380px</td>
          <td style="padding: 3px 8px">抽屉宽度</td>
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
