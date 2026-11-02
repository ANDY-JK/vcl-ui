<script setup lang="ts">
import { ref } from 'vue'
import Drawer from '@/components/feedback/Drawer.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'

const drawerVisible = ref(false)
const drawerLeftVisible = ref(false)
const drawerTopVisible = ref(false)
const drawerBottomVisible = ref(false)
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
      <p style="color: var(--vcl-color-text-secondary)">这是一个从右侧滑出的抽屉面板。</p>
      <p
        style="
          color: var(--vcl-color-text-muted);
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
      <p style="color: var(--vcl-color-text-secondary)">从左侧滑出的面板，常用于移动端导航菜单。</p>
    </Drawer>

    <Drawer v-model:visible="drawerTopVisible" title="顶部抽屉" placement="top">
      <p style="color: var(--vcl-color-text-secondary)">从顶部滑下的面板，适合通知横幅、快捷筛选。</p>
    </Drawer>

    <Drawer v-model:visible="drawerBottomVisible" title="底部抽屉" placement="bottom">
      <p style="color: var(--vcl-color-text-secondary)">从底部滑出的面板，移动端常用于操作菜单（Action Sheet）。</p>
    </Drawer>

    <Card title="方向演示" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div style="display: flex; gap: calc(12px * var(--vcl-scale)); flex-wrap: wrap">
        <Button text="顶部抽屉" variant="outline" @click="drawerTopVisible = true" />
        <Button text="底部抽屉" variant="outline" @click="drawerBottomVisible = true" />
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
            <td><code>visible</code></td>
            <td>boolean</td>
            <td>—</td>
            <td>显隐（v-model:visible）</td>
          </tr>
          <tr>
            <td><code>title</code></td>
            <td>string</td>
            <td>''</td>
            <td>抽屉标题（标题栏；空串不渲染标题行）</td>
          </tr>
          <tr>
            <td><code>placement</code></td>
            <td>'left' \| 'right' \| 'top' \| 'bottom'</td>
            <td>'right'</td>
            <td>滑出方位（默认右侧）</td>
          </tr>
          <tr>
            <td><code>width</code></td>
            <td>string</td>
            <td>'min(380px, 88vw)'</td>
            <td>抽屉宽度（默认 'min(380px, 88vw)'）</td>
          </tr>
          <tr>
            <td><code>height</code></td>
            <td>string</td>
            <td>'min(300px, 60vh)'</td>
            <td>抽屉高度（上下方位时生效，默认 'min(300px, 60vh)'）</td>
          </tr>
          <tr>
            <td><code>closable</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>显示右上角关闭按钮（默认开）</td>
          </tr>
          <tr>
            <td><code>maskClosable</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>点遮罩关闭（默认开）</td>
          </tr>
          <tr>
            <td><code>zIndex</code></td>
            <td>number</td>
            <td>—</td>
            <td>遮罩 z-index 覆盖</td>
          </tr>
          <tr>
            <td><code>destroyOnClose</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>关闭即销毁内容（默认开；关掉可保留表单等内部状态）</td>
          </tr>
          <tr>
            <td><code>internal</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>设为 true 时不参与全局弹窗互斥管理（组件内部弹窗用）</td>
          </tr>
          <tr>
            <td><code>mutexScope</code></td>
            <td>string</td>
            <td>—</td>
            <td>
              弹窗互斥域。同一 scope 的弹窗"新开即关旧"，不同 scope 互不影响。 默认不传 →
              全页面全局互斥（历史行为）。需要与其它弹窗共存（如 Drawer 内开确认框）时传独立 scope。
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
