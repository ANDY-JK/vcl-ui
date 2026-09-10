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
    <h2 class="demo-title">Steps 步骤条</h2>
    <p class="demo-desc">分步引导流程，支持标签和描述。</p>

    <Card title="Steps 步骤条">
      <Button
        v-if="currentStep < 4"
        text="下一步"
        size="sm"
        variant="outline"
        style="margin-bottom: 16px"
        @click="currentStep = Math.min(4, currentStep + 1)"
      />
      <Steps :steps="steps" :current="currentStep" />
      <p style="margin-top: 12px; font-size: 12px; color: var(--color-text-muted)">
        当前步骤: {{ currentStep }} / {{ steps.length }}
      </p>
    </Card>

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
            <code>steps</code>
          </td>
          <td style="padding: 3px 8px">Step[]</td>
          <td style="padding: 3px 8px">—</td>
          <td style="padding: 3px 8px">步骤数组</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px">
            <code>current</code>
          </td>
          <td style="padding: 3px 8px">number</td>
          <td style="padding: 3px 8px">1</td>
          <td style="padding: 3px 8px">当前步骤</td>
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
