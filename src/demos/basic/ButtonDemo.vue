<script setup lang="ts">
import { ref } from 'vue'
import Button from '@/components/basic/Button.vue'
import Card from '@/components/data/Card.vue'

const loading = ref(false)

function simulateLoading() {
  loading.value = true
  setTimeout(() => {
    loading.value = false
  }, 1500)
}
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Button 按钮</h1>
    <p class="demo-desc">五种变体 + 三种尺寸 + 加载/禁用/图标/箭头状态。</p>

    <!-- 变体 -->
    <Card title="按钮变体 (Variants)" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div class="demo-row">
        <Button text="Primary 主按钮" variant="primary" />
        <Button text="Secondary 次按钮" variant="secondary" />
        <Button text="Outline 描边" variant="outline" />
        <Button text="Danger 危险" variant="danger" />
        <Button text="Ghost 幽灵" variant="ghost" />
      </div>
    </Card>

    <!-- 尺寸 -->
    <Card title="按钮尺寸 (Sizes)" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div class="demo-row">
        <Button text="Small 小" size="sm" variant="primary" />
        <Button text="Medium 中" size="md" variant="primary" />
        <Button text="Large 大" size="lg" variant="primary" />
      </div>
    </Card>

    <!-- 状态组合 -->
    <Card title="状态组合" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div class="demo-row">
        <Button text="带图标" variant="primary" icon="plus" />
        <Button text="带箭头" variant="outline" show-arrow />
        <Button text="通栏宽度" variant="primary" block />
        <Button text="加载中..." variant="primary" :loading="loading" @click="simulateLoading" />
        <Button text="禁用状态" variant="primary" disabled />
        <Button icon="trash" variant="danger" size="sm" />
        <Button text="仅图标+文字" variant="secondary" icon="settings" />
      </div>
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
            <td><code>text</code></td>
            <td>string</td>
            <td>—</td>
            <td>按钮文字（与 default 插槽二选一，插槽优先）</td>
          </tr>
          <tr>
            <td><code>variant</code></td>
            <td>'primary' \| 'secondary' \| 'outline' \| 'danger' \| 'ghost'</td>
            <td>'primary'</td>
            <td>语义形态：primary 实心主色 \| secondary 实心次色 \| outline 描边 \| danger 危险 \| ghost 幽灵</td>
          </tr>
          <tr>
            <td><code>size</code></td>
            <td>'sm' \| 'md' \| 'lg'</td>
            <td>'md'</td>
            <td>尺寸档位（默认 'md'）</td>
          </tr>
          <tr>
            <td><code>icon</code></td>
            <td>string</td>
            <td>—</td>
            <td>前置图标（IconSvg 图标名）</td>
          </tr>
          <tr>
            <td><code>disabled</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>禁用</td>
          </tr>
          <tr>
            <td><code>loading</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>加载态（转圈 + 禁点，不改变宽度）</td>
          </tr>
          <tr>
            <td><code>block</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>块级（撑满整行）</td>
          </tr>
          <tr>
            <td><code>showArrow</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>文字后显示箭头（「下一步」类场景）</td>
          </tr>
        </tbody>
      </table>
    </Card>
  </div>
</template>

<style scoped>
.demo {
}
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
.demo-row {
  display: flex;
  flex-wrap: wrap;
  gap: calc(10px * var(--vcl-scale));
  align-items: center;
}
</style>
