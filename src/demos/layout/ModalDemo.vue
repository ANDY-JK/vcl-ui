<script setup lang="ts">
import { ref } from 'vue'
import ModalBox from '@/components/layout/ModalBox.vue'
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import Button from '@/components/basic/Button.vue'
import Card from '@/components/data/Card.vue'

// ---- ModalBox 模式 ----
const visibleDefault = ref(false)
const visibleConfirm = ref(false)
const visibleDetail = ref(false)
const visibleSelect = ref(false)
const visibleForm = ref(false)
const confirmLoading = ref(false)

function onConfirmDelete() {
  confirmLoading.value = true
  setTimeout(() => {
    confirmLoading.value = false
    visibleConfirm.value = false
  }, 1500)
}

const detailItems = [
  { label: '订单编号', value: 'ORD-20240516-0012', mono: true },
  { label: '创建时间', value: '2024-05-16 14:30:00' },
  { label: '订单金额', value: '¥1,299.00' },
  { label: '状态', value: '已完成' },
  { label: '收货地址', value: '北京市朝阳区xxx街道xxx号' },
]

const selectItems: { value: string | number; label: string; desc?: string }[] = [
  { value: 1, label: '选项 A', desc: '这是选项 A 的描述' },
  { value: 2, label: '选项 B', desc: '这是选项 B 的描述' },
  { value: 3, label: '选项 C', desc: '这是选项 C 的描述' },
]

const formData = ref({ name: '', email: '' })

// ---- ConfirmModal 变体 ----
const dangerVisible = ref(false)
const warningVisible = ref(false)
const primaryVisible = ref(false)
const lastAction = ref('')

function onConfirm(variant: string) { lastAction.value = `已确认 — ${variant}` }
function onCancel(variant: string) { lastAction.value = `已取消 — ${variant}` }
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Modal 弹窗</h2>
    <p class="demo-desc">
      通用模态框 ModalBox（default / confirm / detail / select / form 五种模式）+ 确认弹窗 ConfirmModal（danger / warning / primary 三种变体，基于 ModalBox 封装）。
    </p>

    <!-- ══════════════ ModalBox 模式 ══════════════ -->
    <Card title="ModalBox — 点击按钮查看各种模式" style="margin-bottom:24px">
      <div class="demo-row">
        <Button text="默认弹窗" variant="primary" @click="visibleDefault = true" />
        <Button text="确认删除" variant="danger" @click="visibleConfirm = true" />
        <Button text="查看详情" variant="secondary" @click="visibleDetail = true" />
        <Button text="选择项" variant="outline" @click="visibleSelect = true" />
        <Button text="表单弹窗" variant="secondary" @click="visibleForm = true" />
      </div>
    </Card>

    <!-- 默认 -->
    <ModalBox v-model:visible="visibleDefault" title="默认弹窗">
      <p style="color:var(--color-text-secondary);">这是默认插槽内容，可以放任意 HTML。</p>
    </ModalBox>

    <!-- 确认（ModalBox confirm 模式） -->
    <ModalBox
      v-model:visible="visibleConfirm"
      modalType="confirm"
      title="确认删除"
      confirmMessage="确定要删除此项吗？此操作不可撤销。"
      confirmVariant="danger"
      :confirmDanger="true"
      :confirmLoading="confirmLoading"
      @confirm="onConfirmDelete"
      @cancel="visibleConfirm = false"
    />

    <!-- 详情 -->
    <ModalBox
      v-model:visible="visibleDetail"
      modalType="detail"
      title="订单详情"
      :detailItems="detailItems"
    />

    <!-- 选择 -->
    <ModalBox
      v-model:visible="visibleSelect"
      modalType="select"
      title="请选择"
      :selectItems="selectItems"
      @select-confirm="(v) => console.log('选中:', v)"
    />

    <!-- 表单 -->
    <ModalBox
      v-model:visible="visibleForm"
      modalType="form"
      title="编辑信息"
      @form-submit="visibleForm = false"
    >
      <div style="display:flex;flex-direction:column;gap:12px;">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">
          姓名
          <input v-model="formData.name" style="height:36px;padding:0 10px;border:1px solid var(--color-border);border-radius:6px;" placeholder="请输入" />
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">
          邮箱
          <input v-model="formData.email" style="height:36px;padding:0 10px;border:1px solid var(--color-border);border-radius:6px;" placeholder="请输入" />
        </label>
      </div>
    </ModalBox>

    <!-- ══════════════ ConfirmModal 独立变体 ══════════════ -->
    <Card title="ConfirmModal — danger / warning / primary 三种变体" style="margin-bottom:24px">
      <div v-if="lastAction" style="margin-bottom:16px;padding:8px 14px;background:var(--color-bg-alt);border-radius:6px;font-size:13px;">
        {{ lastAction }}
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
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

    <!-- ══════════════ Props ══════════════ -->
    <Card title="ModalBox Props">
      <table class="props-table">
        <thead><tr><th>Prop</th><th>类型</th><th>默认</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><code>visible</code></td><td>boolean</td><td>—</td><td>显示/隐藏（v-model）</td></tr>
          <tr><td><code>title</code></td><td>string</td><td>''</td><td>弹窗标题</td></tr>
          <tr><td><code>modalType</code></td><td>string</td><td>'default'</td><td>default | confirm | form | detail | select</td></tr>
          <tr><td><code>size</code></td><td>string</td><td>'md'</td><td>sm | md | lg | xl</td></tr>
          <tr><td><code>closable</code></td><td>boolean</td><td>true</td><td>显示关闭按钮</td></tr>
          <tr><td><code>maskClosable</code></td><td>boolean</td><td>true</td><td>点击遮罩关闭</td></tr>
        </tbody>
      </table>
      <p style="font-size:12px;color:var(--color-text-muted);margin-top:8px;">
        Events: <code>@confirm</code> | <code>@cancel</code> | <code>@select-confirm</code> | <code>@form-submit</code> | <code>@close</code>
      </p>
    </Card>

    <Card title="ConfirmModal Props" style="margin-top:24px">
      <table class="props-table">
        <thead><tr><th>Prop</th><th>类型</th><th>默认</th><th>说明</th></tr></thead>
        <tbody>
          <tr><td><code>visible</code></td><td>boolean</td><td>—</td><td>显示/隐藏（v-model）</td></tr>
          <tr><td><code>title</code></td><td>string</td><td>'确认操作'</td><td>弹窗标题</td></tr>
          <tr><td><code>message</code></td><td>string</td><td>—</td><td>提示内容（必填）</td></tr>
          <tr><td><code>confirmText</code></td><td>string</td><td>'确定'</td><td>确认按钮文案</td></tr>
          <tr><td><code>cancelText</code></td><td>string</td><td>'取消'</td><td>取消按钮文案</td></tr>
          <tr><td><code>variant</code></td><td>string</td><td>'danger'</td><td>danger | warning | primary</td></tr>
        </tbody>
      </table>
      <p style="font-size:12px;color:var(--color-text-muted);margin-top:8px;">
        Events: <code>@confirm</code> | <code>@cancel</code>
      </p>
    </Card>
  </div>
</template>

<style scoped>
.demo-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
.demo-desc { color: var(--color-text-muted); margin-bottom: 24px; font-size: 14px; }
code { background: var(--color-bg-alt); padding: 1px 5px; border-radius: 3px; font-size: 12px; }
.demo-row { display: flex; flex-wrap: wrap; gap: 10px; }
.props-table { width: 100%; font-size: 13px; border-collapse: collapse; }
.props-table th { padding: 6px 8px; border-bottom: 2px solid var(--color-border); text-align: left; }
.props-table td { padding: 6px 8px; border-bottom: 1px solid var(--color-border-light); }
</style>
