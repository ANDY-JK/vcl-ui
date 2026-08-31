<script setup lang="ts">
import { ref } from 'vue'
import OfflineIndicator from '@/components/feedback/OfflineIndicator.vue'
import ReadOnlyOverlay from '@/components/feedback/ReadOnlyOverlay.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'

const readonlyVisible = ref(false)
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">State 状态 / 离线 & 只读</h2>
    <p class="demo-desc">离线提示 / 只读遮罩。</p>

    <Card title="OfflineIndicator - 离线提示" style="margin-bottom: 24px">
      <p style="font-size: 13px; color: var(--color-text-muted); margin-bottom: 12px">
        断网时顶部自动显示黄色横幅。你可以断开网络测试，或查看页面顶部。
      </p>
      <OfflineIndicator />
    </Card>

    <Card title="ReadOnlyOverlay - 只读遮罩">
      <Button text="模拟只读模式" variant="outline" @click="readonlyVisible = true" />
      <ReadOnlyOverlay :visible="readonlyVisible" reason="系统升级维护中（2024-05-16 02:00-04:00），当前仅可查看数据" />
      <Button
        v-if="readonlyVisible"
        text="关闭遮罩"
        variant="primary"
        style="margin-top: 8px; display: block"
        @click="readonlyVisible = false"
      />
    </Card>

    <Card title="Props — ReadOnlyOverlay" style="margin-top: 24px">
      <table style="width: 100%; font-size: 13px; border-collapse: collapse">
        <thead>
          <tr style="border-bottom: 2px solid var(--color-border); text-align: left">
            <th style="padding: 6px 8px">Prop</th>
            <th style="padding: 6px 8px">类型</th>
            <th style="padding: 6px 8px">默认值</th>
            <th style="padding: 6px 8px">说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)"><code>visible</code></td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">boolean</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">—</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">显示/隐藏</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px"><code>reason</code></td>
            <td style="padding: 6px 8px">string</td>
            <td style="padding: 6px 8px">'系统维护中，当前为只读模式'</td>
            <td style="padding: 6px 8px">只读原因说明</td>
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
</style>
