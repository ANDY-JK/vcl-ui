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
    <h1 class="demo-title">ConfirmModal 确认弹窗</h1>
    <p class="demo-desc">危险/警告/确认三种变体，基于 ModalBox 封装。</p>

    <div
      v-if="lastAction"
      style="
        margin-bottom: calc(16px * var(--vcl-scale));
        padding: calc(8px * var(--vcl-scale)) calc(14px * var(--vcl-scale));
        background: var(--vcl-color-bg-alt);
        border-radius: calc(6px * var(--vcl-scale));
        font-size: calc(13px * var(--vcl-scale));
      "
    >
      {{ lastAction }}
    </div>

    <Card title="变体演示" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div style="display: flex; gap: calc(12px * var(--vcl-scale)); flex-wrap: wrap">
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

    <Card title="Props" title-as="h2">
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
            <td><code>visible</code></td>
            <td>boolean</td>
            <td>—</td>
            <td>显隐（v-model:visible）</td>
          </tr>
          <tr>
            <td><code>title</code></td>
            <td>string</td>
            <td>—</td>
            <td>弹窗标题（空串用内置 i18n，语言切换实时跟随）</td>
          </tr>
          <tr>
            <td><code>message</code></td>
            <td>string</td>
            <td>—</td>
            <td>正文消息</td>
          </tr>
          <tr>
            <td><code>confirmText</code></td>
            <td>string</td>
            <td>—</td>
            <td>确认按钮文字（空串用内置 i18n）</td>
          </tr>
          <tr>
            <td><code>cancelText</code></td>
            <td>string</td>
            <td>—</td>
            <td>取消按钮文字（空串用内置 i18n）</td>
          </tr>
          <tr>
            <td><code>variant</code></td>
            <td>'danger' \| 'warning' \| 'primary'</td>
            <td>'danger'</td>
            <td>语义色：danger 危险操作（默认）\| warning 谨慎 \| primary 常规确认</td>
          </tr>
          <tr>
            <td><code>loading</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>确认按钮 loading（等待宿主异步操作期间防重复提交）</td>
          </tr>
          <tr>
            <td><code>closable</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>显示右上角关闭按钮（默认开）</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <Card title="Events" title-as="h2" style="margin-top: calc(24px * var(--vcl-scale))">
      <table style="width: 100%; font-size: calc(13px * var(--vcl-scale)); border-collapse: collapse">
        <thead>
          <tr style="border-bottom: 2px solid var(--vcl-color-border); text-align: left">
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">Event</th>
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
              <code>confirm</code>
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              点击确认按钮
            </td>
          </tr>
          <tr>
            <td style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))"><code>cancel</code></td>
            <td style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">点击取消按钮</td>
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
