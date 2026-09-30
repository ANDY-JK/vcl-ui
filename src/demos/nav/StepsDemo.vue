<script setup lang="ts">
import { ref } from 'vue'
import Steps from '@/components/nav/Steps.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'

const currentStep = ref(1)
const steps = [
  { label: '填写信息', desc: '输入基本信息' },
  { label: '验证身份', desc: '短信验证' },
  { label: '设置密码', desc: '创建密码' },
  { label: '完成注册' },
]
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Steps 步骤条</h1>
    <p class="demo-desc">分步引导流程，支持标签和描述。</p>

    <Card title="Steps 步骤条" title-as="h2">
      <Button
        v-if="currentStep < 4"
        text="下一步"
        size="sm"
        variant="outline"
        style="margin-bottom: calc(16px * var(--vcl-scale))"
        @click="currentStep = Math.min(4, currentStep + 1)"
      />
      <Steps :steps="steps" :current="currentStep" />
      <p
        style="
          margin-top: calc(12px * var(--vcl-scale));
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
        "
      >
        当前步骤: {{ currentStep }} / {{ steps.length }}
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
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>steps</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">Step[]</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">—</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">步骤数组</td>
          </tr>
          <tr>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              <code>current</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">number</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">—（必填）</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">当前步骤</td>
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
