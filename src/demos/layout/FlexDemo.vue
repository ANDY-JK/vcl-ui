<script setup lang="ts">
import Flex from '@/components/layout/Flex.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Flex 弹性布局</h1>
    <p class="demo-desc">
      弹性布局容器，通过 <code>direction</code>、<code>justify</code>、<code>align</code>、<code>gap</code>、<code
        >wrap</code
      >
      等 props 快速构建布局。<br />
      <strong>已合并原 Space 组件</strong>——<code>direction</code> 同时支持 <code>'horizontal'/'vertical'</code>（Space
      语法）和 <code>'row'/'column'</code>（Flex 原生）。
    </p>

    <div class="grid-2-col" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <Card title="方向 — row（默认）" title-as="h2">
        <Flex direction="row" gap="8px">
          <div class="flex-block">A</div>
          <div class="flex-block">B</div>
          <div class="flex-block">C</div>
        </Flex>
      </Card>

      <Card title="方向 — column" title-as="h2">
        <Flex direction="column" gap="8px">
          <div class="flex-block">A</div>
          <div class="flex-block">B</div>
          <div class="flex-block">C</div>
        </Flex>
      </Card>

      <Card title="Space 兼容 — horizontal（等同 row）" title-as="h2">
        <Flex direction="horizontal" gap="8px">
          <Button text="按钮1" variant="primary" size="sm" />
          <Button text="按钮2" variant="secondary" size="sm" />
          <Button text="按钮3" variant="outline" size="sm" />
        </Flex>
      </Card>

      <Card title="Space 兼容 — vertical（等同 column）" title-as="h2">
        <Flex direction="vertical" gap="8px">
          <Button text="按钮1" variant="primary" block />
          <Button text="按钮2" variant="secondary" block />
          <Button text="按钮3" variant="outline" block />
        </Flex>
      </Card>

      <Card title="对齐 — justify=center, align=center" title-as="h2">
        <Flex
          justify="center"
          align="center"
          gap="8px"
          style="
            height: calc(100px * var(--vcl-scale));
            background: var(--vcl-color-bg-alt);
            border-radius: calc(6px * var(--vcl-scale));
          "
        >
          <div class="flex-block">A</div>
          <div class="flex-block">B</div>
          <div class="flex-block">C</div>
        </Flex>
      </Card>

      <Card title="对齐 — justify=between" title-as="h2">
        <Flex
          justify="between"
          align="center"
          style="
            background: var(--vcl-color-bg-alt);
            border-radius: calc(6px * var(--vcl-scale));
            padding: 0 calc(8px * var(--vcl-scale));
          "
        >
          <div class="flex-block">A</div>
          <div class="flex-block">B</div>
          <div class="flex-block">C</div>
        </Flex>
      </Card>

      <Card title="间距 — 不同 gap 值" title-as="h2">
        <Flex direction="horizontal" gap="4px" style="margin-bottom: calc(8px * var(--vcl-scale))">
          <Button text="4px" variant="primary" size="sm" />
          <Button text="4px" variant="primary" size="sm" />
          <Button text="4px" variant="primary" size="sm" />
        </Flex>
        <Flex direction="horizontal" gap="12px" style="margin-bottom: calc(8px * var(--vcl-scale))">
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

      <Card title="换行 — wrap=true" title-as="h2">
        <Flex direction="row" gap="8px" wrap>
          <Button v-for="i in 8" :key="i" :text="`按钮${i}`" variant="primary" size="sm" />
        </Flex>
      </Card>
    </div>

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
              <code>direction</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              'row' | 'column' | 'horizontal' | 'vertical'
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              'row'
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              主轴方向（horizontal/vertical 为 Space 兼容）
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>justify</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              'start'
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              主轴对齐
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>align</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              'start' | 'center' | 'end' | 'stretch' | 'baseline'
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              'stretch'
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              交叉轴对齐
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>gap</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              string
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              'var(--vcl-space-2)'
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              子项间距（CSS 值）
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>wrap</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              boolean
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              false
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              是否换行
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>flex</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              string
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              '1'
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              flex 属性值
            </td>
          </tr>
          <tr>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              <code>inline</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">boolean</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">false</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">是否 inline-flex</td>
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
.flex-block {
  width: calc(36px * var(--vcl-scale));
  height: calc(36px * var(--vcl-scale));
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vcl-color-primary);
  color: white;
  border-radius: calc(6px * var(--vcl-scale));
  font-size: calc(14px * var(--vcl-scale));
  font-weight: 600;
  flex-shrink: 0;
}
</style>
