<script setup lang="ts">
// InputOTPDemo — 验证码分格输入
// 重点演示边界交互：逐位自动前进、粘贴整串落位、退格跨格回退
import { ref } from 'vue'
import InputOTP from '@/components/form/InputOTP.vue'

const code = ref('')
const alnum = ref('')
const done = ref('—')

function onComplete(v: string) {
  done.value = v
}
</script>

<template>
  <div class="demo-container">
    <h1>InputOTP 验证码输入</h1>
    <p class="desc">
      分段格子、整串一个值。<code>粘贴</code> 会整串落位，<code>退格</code> 跨格回退， 方向键在格间移动。对外只暴露
      <code>modelValue: string</code>。
    </p>

    <section class="demo-section">
      <h2>基础（6 位数字）</h2>
      <InputOTP v-model="code" aria-label="短信验证码" @complete="onComplete" />
      <p class="result">
        当前值：<code>{{ code || '（空）' }}</code> —— 输满回调：<code>{{ done }}</code>
      </p>
    </section>

    <section class="demo-section">
      <h2>字母数字（8 位，统一大写）</h2>
      <p class="hint">TOTP 类场景：允许字母，输入自动转大写。</p>
      <InputOTP v-model="alnum" :length="8" type="alphanumeric" aria-label="动态口令" />
      <p class="result">
        当前值：<code>{{ alnum || '（空）' }}</code>
      </p>
    </section>

    <section class="demo-section">
      <h2>禁用 / 只读</h2>
      <p><InputOTP model-value="123456" disabled aria-label="禁用的验证码" /></p>
      <p><InputOTP model-value="654321" readonly aria-label="只读的验证码" /></p>
      <p class="hint">只读仍可聚焦、可复制 —— 后台查看工单时常用。</p>
    </section>

    <section class="demo-section">
      <h2>Props</h2>
      <table class="props-table" data-component="InputOTP">
        <tbody>
          <tr class="props-header">
            <th>Prop</th>
            <th>类型</th>
            <th>默认</th>
            <th>说明</th>
          </tr>
          <tr>
            <td><code>modelValue</code></td>
            <td>string</td>
            <td>—</td>
            <td>整串值：不足 length 位时右侧留空（不补占位符）</td>
          </tr>
          <tr>
            <td><code>length</code></td>
            <td>number</td>
            <td>6</td>
            <td>位数（短信码 4~6、TOTP 6、部分平台 8）</td>
          </tr>
          <tr>
            <td><code>type</code></td>
            <td>'numeric' | 'alphanumeric'</td>
            <td>'numeric'</td>
            <td>numeric 只收数字；alphanumeric 收数字+字母并统一大写</td>
          </tr>
          <tr>
            <td><code>disabled</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>整组禁用</td>
          </tr>
          <tr>
            <td><code>readonly</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>只读（可聚焦可复制，不可改）</td>
          </tr>
          <tr>
            <td><code>ariaLabel</code></td>
            <td>string</td>
            <td>''</td>
            <td>无障碍名：读屏念「名字，第 N 位」</td>
          </tr>
          <tr>
            <td><code>autofocus</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>是否自动聚焦第一格（模态里通常要）</td>
          </tr>
        </tbody>
      </table>
      <p class="hint">
        事件：<code>update:modelValue</code>（每敲一位）· <code>complete</code>（输满时抛一次）<br />
        实例方法：<code>focusFirstEmpty()</code>（模态打开/校验失败后聚焦到第一个空格）
      </p>
    </section>
  </div>
</template>

<style scoped>
.hint {
  font-size: var(--vcl-text-caption-size);
  line-height: var(--vcl-text-caption-line);
  color: var(--vcl-color-text-muted);
}
.props-table {
  width: 100%;
  border-collapse: collapse;
}
.props-table th,
.props-table td {
  text-align: left;
  padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
  border-bottom: 1px solid var(--vcl-color-border-light);
  font-size: var(--vcl-text-label-size);
  line-height: var(--vcl-text-label-line);
}
.props-header th {
  color: var(--vcl-color-text-muted);
  font-weight: 600;
}
</style>
