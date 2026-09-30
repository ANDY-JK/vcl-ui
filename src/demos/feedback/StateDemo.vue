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
    <h1 class="demo-title">State 状态 / 离线 & 只读</h1>
    <p class="demo-desc">离线提示 / 只读遮罩。</p>

    <Card title="OfflineIndicator - 离线提示" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <p
        style="
          font-size: calc(13px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
          margin-bottom: calc(12px * var(--vcl-scale));
        "
      >
        断网时顶部自动显示黄色横幅。你可以断开网络测试，或查看页面顶部。
      </p>
      <OfflineIndicator />
    </Card>

    <Card title="ReadOnlyOverlay - 只读遮罩" title-as="h2">
      <Button text="模拟只读模式" variant="outline" @click="readonlyVisible = true" />
      <ReadOnlyOverlay :visible="readonlyVisible" reason="系统升级维护中（2024-05-16 02:00-04:00），当前仅可查看数据" />
      <Button
        v-if="readonlyVisible"
        text="关闭遮罩"
        variant="primary"
        style="margin-top: calc(8px * var(--vcl-scale)); display: block"
        @click="readonlyVisible = false"
      />
    </Card>

    <Card title="Props — ReadOnlyOverlay" title-as="h2" style="margin-top: calc(24px * var(--vcl-scale))">
      <table style="width: 100%; font-size: calc(13px * var(--vcl-scale)); border-collapse: collapse">
        <thead>
          <tr style="border-bottom: 2px solid var(--vcl-color-border); text-align: left">
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">Prop</th>
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">类型</th>
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">默认值</th>
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>visible</code>
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              boolean
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              —
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              显示/隐藏
            </td>
          </tr>
          <tr>
            <td style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))"><code>reason</code></td>
            <td style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">string</td>
            <td style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              '系统维护中，当前为只读模式'
            </td>
            <td style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">只读原因说明</td>
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
  color: var(--vcl-color-text-muted);
  margin-bottom: calc(24px * var(--vcl-scale));
  font-size: calc(14px * var(--vcl-scale));
}
</style>
