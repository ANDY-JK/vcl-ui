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

    <div class="grid-2-col" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <Card title="只读进度条" title-as="h2">
        <div style="display: flex; flex-direction: column; gap: calc(12px * var(--vcl-scale))">
          <ProgressBar :percent="progress" variant="primary" />
          <ProgressBar :percent="45" variant="success" />
          <ProgressBar :percent="28" variant="warning" />
          <ProgressBar :percent="85" variant="danger" striped animated />
          <Button
            text="模拟进度"
            size="sm"
            variant="outline"
            style="margin-top: calc(8px * var(--vcl-scale))"
            @click="progress = Math.min(100, progress + 10)"
          />
        </div>
      </Card>

      <Card title="滑块 interactive" title-as="h2">
        <p
          style="
            margin-bottom: calc(8px * var(--vcl-scale));
            font-size: calc(12px * var(--vcl-scale));
            color: var(--vcl-color-text-muted);
          "
        >
          当前值: {{ sliderVal }}
        </p>
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
      <table style="width: 100%; font-size: calc(13px * var(--vcl-scale)); border-collapse: collapse">
        <tbody>
          <tr style="border-bottom: 2px solid var(--vcl-color-border); text-align: left">
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">Prop</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">类型</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">默认</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">说明</th>
          </tr>
          <tr>
            <td><code>percent</code></td>
            <td>number</td>
            <td>0</td>
            <td>进度百分比 0-100（非交互模式）</td>
          </tr>
          <tr>
            <td><code>variant</code></td>
            <td>'primary' \| 'success' \| 'warning' \| 'danger'</td>
            <td>'primary'</td>
            <td>语义色</td>
          </tr>
          <tr>
            <td><code>showText</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>显示百分比文字</td>
          </tr>
          <tr>
            <td><code>height</code></td>
            <td>number</td>
            <td>6</td>
            <td>轨道高度（px，默认 6）</td>
          </tr>
          <tr>
            <td><code>striped</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>条纹轨道</td>
          </tr>
          <tr>
            <td><code>animated</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>流光动画</td>
          </tr>
          <tr>
            <td><code>interactive</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>交互模式：进度条变滑块（拖拽/键盘/数字输入）</td>
          </tr>
          <tr>
            <td><code>modelValue</code></td>
            <td>number</td>
            <td>0</td>
            <td>交互模式的受控值（v-model:modelValue）</td>
          </tr>
          <tr>
            <td><code>min</code></td>
            <td>number</td>
            <td>0</td>
            <td>交互模式最小值（默认 0）</td>
          </tr>
          <tr>
            <td><code>max</code></td>
            <td>number</td>
            <td>100</td>
            <td>交互模式最大值（默认 100）</td>
          </tr>
          <tr>
            <td><code>step</code></td>
            <td>number</td>
            <td>1</td>
            <td>交互模式步进（默认 1）</td>
          </tr>
          <tr>
            <td><code>disabled</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>交互模式禁用</td>
          </tr>
          <tr>
            <td><code>showInput</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>交互模式显示数字输入框</td>
          </tr>
          <tr>
            <td><code>showStops</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>显示刻度断点</td>
          </tr>
          <tr>
            <td><code>label</code></td>
            <td>string</td>
            <td>—</td>
            <td>无障碍名称：interactive 模式的 slider/数字输入需要可访问名，未传时回退通用文案</td>
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
