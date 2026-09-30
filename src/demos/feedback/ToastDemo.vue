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
    <h1 class="demo-title">Toast 通知</h1>
    <p class="demo-desc">内联提示 + 顶部通知条，四种类型。</p>

    <Card title="Toast 内联提示 (variant='inline')" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div style="display: flex; flex-direction: column; gap: calc(8px * var(--vcl-scale))">
        <Toast variant="inline" type="circle-alert" message="这是一条普通信息提示" />
        <Toast variant="inline" type="success" message="操作成功！数据已保存" title="成功" />
        <Toast variant="inline" type="warning" message="您的存储空间即将不足，请及时清理" :closable="true" />
        <Toast variant="inline" type="error" message="提交失败，请检查网络连接后重试" title="错误" :closable="true" />
      </div>
    </Card>

    <Card title="Toast 通知提示" title-as="h2">
      <div style="display: flex; gap: calc(8px * var(--vcl-scale)); flex-wrap: wrap">
        <Button text="信息提示" size="sm" @click="showToast('info')" />
        <Button text="成功提示" variant="primary" size="sm" @click="showToast('success')" />
        <Button text="警告提示" variant="secondary" size="sm" @click="showToast('warning')" />
        <Button text="错误提示" variant="danger" size="sm" @click="showToast('error')" />
        <p
          style="
            font-size: calc(12px * var(--vcl-scale));
            color: var(--vcl-color-text-muted);
            margin-top: calc(4px * var(--vcl-scale));
            width: 100%;
          "
        >
          点击按钮查看顶部通知
        </p>
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
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>variant</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">string</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">toast</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">toast | inline</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>type</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">string</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">info</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              info | success | warning | error
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>title</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">string</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">—</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">标题（inline 模式）</td>
          </tr>
          <tr>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              <code>closable</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">boolean</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">false</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              显示关闭按钮（inline 模式）
            </td>
          </tr>
        </tbody>
      </table>
    </Card>
  </div>

  <Toast ref="toastRef" />
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
code {
  background: var(--vcl-color-bg-alt);
  padding: 1px calc(5px * var(--vcl-scale));
  border-radius: calc(3px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
}
</style>
