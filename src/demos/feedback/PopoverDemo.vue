<script setup lang="ts">
import Popover from '@/components/feedback/Popover.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Popover 气泡/提示</h2>
    <p class="demo-desc">Tooltip 文字提示 + Popover 气泡卡片。</p>

    <Card title="Tooltip 文字提示" style="margin-bottom: 24px">
      <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap">
        <Popover variant="tooltip" text="悬停提示" position="top">
          <Button text="悬停 ↑" size="sm" variant="outline" />
        </Popover>
        <Popover variant="tooltip" text="聚焦提示" position="top" trigger="focus">
          <input
            type="text"
            placeholder="点击聚焦"
            style="
              padding: 6px 12px;
              border: 1.5px solid var(--color-border);
              border-radius: var(--radius-md);
              font-size: 13px;
              outline: none;
            "
          />
        </Popover>
        <Popover variant="tooltip" text="右侧提示" position="right">
          <Button text="右 →" size="sm" variant="outline" />
        </Popover>
      </div>
      <p style="margin-top: 12px; font-size: 12px; color: var(--color-text-muted)">
        <code>trigger="hover"</code> 悬停触发（默认）| <code>trigger="focus"</code> 聚焦触发（适合表单字段提示）
      </p>
    </Card>

    <Card title="Popover 气泡卡片">
      <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap">
        <Popover title="通知中心" trigger="click">
          <p>你有 3 条新消息</p>
          <p style="color: var(--color-text-muted); font-size: 12px; margin-top: 4px">上次查看: 5 分钟前</p>
        </Popover>
        <Popover title="帮助信息" trigger="hover">
          <p>悬停即可查看帮助内容</p>
        </Popover>
      </div>
    </Card>

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
            <code>variant</code>
          </td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">popover</td>
          <td style="padding: 3px 8px">popover | tooltip</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>title</code>
          </td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">string</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">—</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">弹窗标题（popover 模式）</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>trigger</code>
          </td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">string</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">'click'</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">click | hover | focus</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            <code>position</code>
          </td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">string</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">'top'</td>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)">
            tooltip 方向：top | bottom | left | right
          </td>
        </tr>
        <tr>
          <td style="padding: 3px 8px">
            <code>text</code>
          </td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">—</td>
          <td style="padding: 3px 8px">快捷文字模式（tooltip）</td>
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
}
code {
  background: var(--color-bg-alt);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
}
</style>
