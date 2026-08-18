<script setup lang="ts">
import Flex from '@/components/layout/Flex.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Flex 弹性布局</h2>
    <p class="demo-desc">
      弹性布局容器，通过 <code>direction</code>、<code>justify</code>、<code>align</code>、<code>gap</code>、<code
        >wrap</code
      >
      等 props 快速构建布局。<br />
      <strong>已合并原 Space 组件</strong>——<code>direction</code> 同时支持 <code>'horizontal'/'vertical'</code>（Space
      语法）和 <code>'row'/'column'</code>（Flex 原生）。
    </p>

    <div class="grid-2-col" style="margin-bottom: 24px">
      <Card title="方向 — row（默认）">
        <Flex direction="row" gap="8px">
          <div class="flex-block">A</div>
          <div class="flex-block">B</div>
          <div class="flex-block">C</div>
        </Flex>
      </Card>

      <Card title="方向 — column">
        <Flex direction="column" gap="8px">
          <div class="flex-block">A</div>
          <div class="flex-block">B</div>
          <div class="flex-block">C</div>
        </Flex>
      </Card>

      <Card title="Space 兼容 — horizontal（等同 row）">
        <Flex direction="horizontal" gap="8px">
          <Button text="按钮1" variant="primary" size="sm" />
          <Button text="按钮2" variant="secondary" size="sm" />
          <Button text="按钮3" variant="outline" size="sm" />
        </Flex>
      </Card>

      <Card title="Space 兼容 — vertical（等同 column）">
        <Flex direction="vertical" gap="8px">
          <Button text="按钮1" variant="primary" block />
          <Button text="按钮2" variant="secondary" block />
          <Button text="按钮3" variant="outline" block />
        </Flex>
      </Card>

      <Card title="对齐 — justify=center, align=center">
        <Flex
          justify="center"
          align="center"
          gap="8px"
          style="height: 100px; background: var(--color-bg-alt); border-radius: 6px"
        >
          <div class="flex-block">A</div>
          <div class="flex-block">B</div>
          <div class="flex-block">C</div>
        </Flex>
      </Card>

      <Card title="对齐 — justify=between">
        <Flex
          justify="between"
          align="center"
          style="background: var(--color-bg-alt); border-radius: 6px; padding: 0 8px"
        >
          <div class="flex-block">A</div>
          <div class="flex-block">B</div>
          <div class="flex-block">C</div>
        </Flex>
      </Card>

      <Card title="间距 — 不同 gap 值">
        <Flex direction="horizontal" gap="4px" style="margin-bottom: 8px">
          <Button text="4px" variant="primary" size="sm" />
          <Button text="4px" variant="primary" size="sm" />
          <Button text="4px" variant="primary" size="sm" />
        </Flex>
        <Flex direction="horizontal" gap="12px" style="margin-bottom: 8px">
          <Button text="12px" variant="secondary" size="sm" />
          <Button text="12px" variant="secondary" size="sm" />
          <Button text="12px" variant="secondary" size="sm" />
        </Flex>
        <Flex direction="horizontal" gap="24px">
          <Button text="24px" variant="outline" size="sm" />
          <Button text="24px" variant="outline" size="sm" />
          <Button text="24px" variant="outline" size="sm" />
        </Flex>
      </Card>

      <Card title="换行 — wrap=true">
        <Flex direction="row" gap="8px" wrap>
          <Button v-for="i in 8" :key="i" :text="`按钮${i}`" variant="primary" size="sm" />
        </Flex>
      </Card>
    </div>

    <Card title="Props">
      <table style="width: 100%; font-size: 13px; border-collapse: collapse">
        <tr style="border-bottom: 2px solid var(--color-border); text-align: left">
          <th style="padding: 4px 8px">Prop</th>
          <th style="padding: 4px 8px">类型</th>
          <th style="padding: 4px 8px">默认</th>
          <th style="padding: 4px 8px">说明</th>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>direction</code>
          </td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            'row' | 'column' | 'horizontal' | 'vertical'
          </td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">'row'</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            主轴方向（horizontal/vertical 为 Space 兼容）
          </td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>justify</code>
          </td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'
          </td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">'start'</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">主轴对齐</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>align</code>
          </td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            'start' | 'center' | 'end' | 'stretch' | 'baseline'
          </td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">'stretch'</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">交叉轴对齐</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>gap</code>
          </td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">string</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">'var(--space-2)'</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">子项间距（CSS 值）</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>wrap</code>
          </td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">boolean</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">false</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">是否换行</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>flex</code>
          </td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">string</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">'1'</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">flex 属性值</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px">
            <code>inline</code>
          </td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">false</td>
          <td style="padding: 3px 8px">是否 inline-flex</td>
        </tr>
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
  line-height: 1.6;
}
code {
  background: var(--color-bg-alt);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
}
.flex-block {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  color: white;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}
</style>
