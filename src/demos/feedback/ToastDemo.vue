<script setup lang="ts">
import { ref } from 'vue'
import Toast from '@/components/feedback/Toast.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'

const toastRef = ref<InstanceType<typeof Toast>>()

function showToast(type: 'info' | 'success' | 'warning' | 'error') {
  toastRef.value?.show(
    type === 'error'
      ? '删除失败，请重试'
      : type === 'success'
        ? '操作成功！'
        : type === 'warning'
          ? '请注意检查数据'
          : '这是一条提示消息',
    type,
    type === 'error' ? 5000 : 3000,
    type === 'success' ? { undoText: '撤销', onUndo: () => {} } : undefined,
  )
}
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Toast 通知</h2>
    <p class="demo-desc">内联提示 + 顶部通知条，四种类型。</p>

    <Card title="Toast 内联提示 (variant=&quot;inline&quot;)" style="margin-bottom: 24px">
      <div style="display: flex; flex-direction: column; gap: 8px">
        <Toast variant="inline" type="circle-alert" message="这是一条普通信息提示" />
        <Toast variant="inline" type="success" message="操作成功！数据已保存" title="成功" />
        <Toast variant="inline" type="warning" message="您的存储空间即将不足，请及时清理" :closable="true" />
        <Toast variant="inline" type="error" message="提交失败，请检查网络连接后重试" title="错误" :closable="true" />
      </div>
    </Card>

    <Card title="Toast 通知提示">
      <div style="display: flex; gap: 8px; flex-wrap: wrap">
        <Button text="信息提示" size="sm" @click="showToast('info')" />
        <Button text="成功提示" variant="primary" size="sm" @click="showToast('success')" />
        <Button text="警告提示" variant="secondary" size="sm" @click="showToast('warning')" />
        <Button text="错误提示" variant="danger" size="sm" @click="showToast('error')" />
        <p style="font-size: 12px; color: var(--color-text-muted); margin-top: 4px; width: 100%">
          点击按钮查看顶部通知
        </p>
      </div>
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
            <code>variant</code>
          </td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">toast</td>
          <td style="padding: 3px 8px">toast | inline</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>type</code>
          </td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">info</td>
          <td style="padding: 3px 8px">info | success | warning | error</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>title</code>
          </td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">—</td>
          <td style="padding: 3px 8px">标题（inline 模式）</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px">
            <code>closable</code>
          </td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">false</td>
          <td style="padding: 3px 8px">显示关闭按钮（inline 模式）</td>
        </tr>
      </tbody>
      </table>
    </Card>
  </div>

  <Toast ref="toastRef" />
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
