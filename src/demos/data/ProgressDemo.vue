<script setup lang="ts">
import { ref } from 'vue'
import ProgressBar from '@/components/data/ProgressBar.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'

const progress = ref(72)
const sliderVal = ref(30)
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">ProgressBar 进度条 / 滑块</h1>
    <p class="demo-desc">只读进度条 + <strong>interactive</strong> 滑块模式。滑块支持拖动、键盘、输入框、刻度。</p>

    <div class="grid-2-col" style="margin-bottom: 24px">
      <Card title="只读进度条" title-as="h2">
        <div style="display: flex; flex-direction: column; gap: 12px">
          <ProgressBar :percent="progress" variant="primary" />
          <ProgressBar :percent="45" variant="success" />
          <ProgressBar :percent="28" variant="warning" />
          <ProgressBar :percent="85" variant="danger" striped animated />
          <Button
            text="模拟进度"
            size="sm"
            variant="outline"
            style="margin-top: 8px"
            @click="progress = Math.min(100, progress + 10)"
          />
        </div>
      </Card>

      <Card title="滑块 interactive" title-as="h2">
        <p style="margin-bottom: 8px; font-size: 12px; color: var(--color-text-muted)">当前值: {{ sliderVal }}</p>
        <ProgressBar v-model="sliderVal" interactive />
      </Card>

      <Card title="带输入框 + 刻度" title-as="h2">
        <ProgressBar v-model="sliderVal" interactive :step="10" show-input show-stops />
      </Card>

      <Card title="禁用滑块" title-as="h2">
        <ProgressBar interactive :model-value="40" disabled />
      </Card>
    </div>

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
            <code>interactive</code>
          </td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">false</td>
          <td style="padding: 3px 8px">滑块模式（true 时启用）</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>modelValue</code>
          </td>
          <td style="padding: 3px 8px">number</td>
          <td style="padding: 3px 8px">0</td>
          <td style="padding: 3px 8px">滑块绑定值（interactive 模式）</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>min / max / step</code>
          </td>
          <td style="padding: 3px 8px">number</td>
          <td style="padding: 3px 8px">0/100/1</td>
          <td style="padding: 3px 8px">滑块范围与步长</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>showInput</code>
          </td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">false</td>
          <td style="padding: 3px 8px">显示数值输入框</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>showStops</code>
          </td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">false</td>
          <td style="padding: 3px 8px">显示刻度标记</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>disabled</code>
          </td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">false</td>
          <td style="padding: 3px 8px">禁用</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px">
            <code class="code-inline">// 只读模式</code>
          </td>
          <td style="padding: 3px 8px" />
          <td style="padding: 3px 8px" />
          <td style="padding: 3px 8px" />
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>percent</code>
          </td>
          <td style="padding: 3px 8px">number</td>
          <td style="padding: 3px 8px">0</td>
          <td style="padding: 3px 8px">进度百分比</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>variant</code>
          </td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">primary</td>
          <td style="padding: 3px 8px">primary | success | warning | danger</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>striped / animated</code>
          </td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">false</td>
          <td style="padding: 3px 8px">条纹样式 / 动画</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px">
            <code>showText</code>
          </td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">true</td>
          <td style="padding: 3px 8px">显示百分比文字</td>
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
