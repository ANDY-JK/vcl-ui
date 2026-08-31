<script setup lang="ts">
import { ref } from 'vue'
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'

const dangerVisible = ref(false)
const warningVisible = ref(false)
const primaryVisible = ref(false)
const lastAction = ref('')

function onConfirm(variant: string): void {
  lastAction.value = `已确认 — ${variant}`
}

function onCancel(variant: string): void {
  lastAction.value = `已取消 — ${variant}`
}
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">ConfirmModal 确认弹窗</h2>
    <p class="demo-desc">危险/警告/确认三种变体，基于 ModalBox 封装。</p>

    <div
      v-if="lastAction"
      style="
        margin-bottom: 16px;
        padding: 8px 14px;
        background: var(--color-bg-alt);
        border-radius: 6px;
        font-size: 13px;
      "
    >
      {{ lastAction }}
    </div>

    <Card title="变体演示" style="margin-bottom: 24px">
      <div style="display: flex; gap: 12px; flex-wrap: wrap">
        <Button text="danger 危险删除" variant="danger" @click="dangerVisible = true" />
        <Button text="warning 警告提醒" variant="outline" @click="warningVisible = true" />
        <Button text="primary 普通确认" variant="primary" @click="primaryVisible = true" />
      </div>

      <ConfirmModal
        v-model:visible="dangerVisible"
        title="删除确认"
        message="确定要删除这条记录吗？此操作不可撤销。"
        variant="danger"
        confirm-text="确认删除"
        cancel-text="我再想想"
        @confirm="onConfirm('danger')"
        @cancel="onCancel('danger')"
      />

      <ConfirmModal
        v-model:visible="warningVisible"
        title="发布提醒"
        message="当前版本尚有未审核内容，确定要发布吗？"
        variant="warning"
        confirm-text="仍然发布"
        cancel-text="返回编辑"
        @confirm="onConfirm('warning')"
        @cancel="onCancel('warning')"
      />

      <ConfirmModal
        v-model:visible="primaryVisible"
        title="保存变更"
        message="有未保存的修改内容，是否保存后继续？"
        variant="primary"
        confirm-text="保存"
        cancel-text="不保存"
        @confirm="onConfirm('primary')"
        @cancel="onCancel('primary')"
      />
    </Card>

    <Card title="Props">
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
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">显示/隐藏（v-model）</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)"><code>title</code></td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">string</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">'确认操作'</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">弹窗标题</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)"><code>message</code></td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">string</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">—</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">提示内容（必填）</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              <code>confirmText</code>
            </td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">string</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">'确定'</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">确认按钮文案</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              <code>cancelText</code>
            </td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">string</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">'取消'</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">取消按钮文案</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px"><code>variant</code></td>
            <td style="padding: 6px 8px">'danger' | 'warning' | 'primary'</td>
            <td style="padding: 6px 8px">'danger'</td>
            <td style="padding: 6px 8px">确认按钮风格</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <Card title="Events" style="margin-top: 24px">
      <table style="width: 100%; font-size: 13px; border-collapse: collapse">
        <thead>
          <tr style="border-bottom: 2px solid var(--color-border); text-align: left">
            <th style="padding: 6px 8px">Event</th>
            <th style="padding: 6px 8px">说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)"><code>confirm</code></td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">点击确认按钮</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px"><code>cancel</code></td>
            <td style="padding: 6px 8px">点击取消按钮</td>
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
