<script setup lang="ts">
// InputDemo — 统一输入组件演示
// 展示 type: text | password | email | tel | number | textarea | search | url
// 日期/时间选择请用 Select 组件（type=date / date-range / time）
import { ref } from 'vue'
import Input from '@/components/form/Input.vue'
import Card from '@/components/data/Card.vue'

const textVal = ref('')
const emailVal = ref('')
const passwordVal = ref('')
const searchVal = ref('')
const numVal = ref<number | null>(0)
const taVal = ref('')

const rules = [(v: string) => (!v ? '不能为空' : undefined), (v: string) => (v.length < 3 ? '至少3个字符' : undefined)]
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Input 统一输入组件</h1>
    <p class="demo-desc">
      合并 Input + InputNumber + Textarea。<br />
      通过 <code>type</code> 切换：text | password | email | tel | number | textarea | search | url<br />
      <em style="color: var(--vcl-color-text-muted)">日期/时间选择请用 Select 组件（type=date / date-range / time）</em>
    </p>

    <div class="grid-2-col">
      <!-- 文本 -->
      <Card title="type='text' — 文本输入" title-as="h2">
        <Input v-model="textVal" label="用户名" />
        <p class="result">
          {{ textVal || '空' }}
        </p>
      </Card>

      <!-- 邮箱 -->
      <Card title="type='email' — 邮箱 + 图标" title-as="h2">
        <Input v-model="emailVal" label="邮箱" type="email" icon="mail" autocomplete="email" />
      </Card>

      <!-- 密码 + 校验 -->
      <Card title="type='password' — 密码显隐 + 校验" title-as="h2">
        <Input v-model="passwordVal" label="密码" type="password" :rules="rules" hint="至少3个字符，不能为空" />
      </Card>

      <!-- 搜索 + clearable -->
      <Card title="type='search' — 搜索 + clearable" title-as="h2">
        <Input v-model="searchVal" label="搜索" type="search" icon="search" clearable placeholder="输入关键词搜索..." />
        <p class="result">
          {{ searchVal || '空' }}
        </p>
      </Card>

      <!-- 数字步进 -->
      <Card title="type='number' + stepper — 数字步进器" title-as="h2">
        <Input v-model="numVal" label="数量" type="number" :stepper="true" :min="0" :max="100" :step="1" />
        <p class="result">
          {{ numVal }}
        </p>
      </Card>

      <!-- 纯数字（无步进） -->
      <Card title="type='number' — 纯数字输入" title-as="h2">
        <Input v-model="numVal" label="纯数字" type="number" :min="0" :max="999" clearable />
        <p class="result">
          {{ numVal }}
        </p>
      </Card>

      <!-- Textarea -->
      <Card title="type='textarea' — 多行文本" title-as="h2">
        <Input v-model="taVal" label="备注" type="textarea" :rows="4" placeholder="输入备注内容..." />
        <p class="result">
          {{ taVal || '空' }}
        </p>
      </Card>
    </div>

    <!-- 禁用态 -->
    <Card title="禁用态" title-as="h2">
      <div class="disabled-grid">
        <Input :model-value="'已禁用'" label="文本" disabled />
        <Input :model-value="42" label="数字" type="number" :stepper="true" disabled />
      </div>
    </Card>

    <!-- Props 表 -->
    <Card title="Props" title-as="h2">
      <table class="props-table">
        <tbody>
          <tr class="props-header">
            <th>Prop</th>
            <th>类型</th>
            <th>默认</th>
            <th>说明</th>
          </tr>
          <tr>
            <td><code>type</code></td>
            <td>string</td>
            <td>'text'</td>
            <td>text | password | email | tel | number | textarea | search | url</td>
          </tr>
          <tr>
            <td><code>modelValue</code></td>
            <td>string | number | null</td>
            <td>—</td>
            <td>v-model 绑定值</td>
          </tr>
          <tr>
            <td><code>label</code></td>
            <td>string</td>
            <td>—</td>
            <td>浮动标签文字</td>
          </tr>
          <tr>
            <td><code>stepper</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>数字步进按钮（type='number'）</td>
          </tr>
          <tr>
            <td><code>min / max</code></td>
            <td>number</td>
            <td>null</td>
            <td>数字模式最值</td>
          </tr>
          <tr>
            <td><code>step</code></td>
            <td>number</td>
            <td>1</td>
            <td>步进值</td>
          </tr>
          <tr>
            <td><code>rows</code></td>
            <td>number</td>
            <td>3</td>
            <td>textarea 行数</td>
          </tr>
          <tr>
            <td><code>rules</code></td>
            <td>Rule[]</td>
            <td>[]</td>
            <td>校验规则</td>
          </tr>
          <tr>
            <td><code>clearable</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>显示清除按钮</td>
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
  line-height: 1.6;
}
code {
  background: var(--vcl-color-bg-alt);
  padding: 1px calc(5px * var(--vcl-scale));
  border-radius: calc(3px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
}
.result {
  margin-top: calc(6px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
}
.grid-2-col {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(280px * var(--vcl-scale)), 1fr));
  gap: calc(16px * var(--vcl-scale));
  margin-bottom: calc(16px * var(--vcl-scale));
}
.disabled-grid {
  display: flex;
  flex-direction: column;
  gap: calc(12px * var(--vcl-scale));
}
.props-table {
  width: 100%;
  font-size: calc(13px * var(--vcl-scale));
  border-collapse: collapse;
}
.props-header {
  border-bottom: 2px solid var(--vcl-color-border);
  text-align: left;
}
.props-table th,
.props-table td {
  padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
  border-bottom: 1px solid var(--vcl-color-border-light);
}
</style>
