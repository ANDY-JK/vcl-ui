<script setup lang="ts">
import Popover from '@/components/feedback/Popover.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Popover 气泡/提示</h1>
    <p class="demo-desc">Tooltip 文字提示 + Popover 气泡卡片。</p>

    <Card title="Tooltip 文字提示" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div style="display: flex; gap: calc(16px * var(--vcl-scale)); align-items: center; flex-wrap: wrap">
        <Popover variant="tooltip" text="悬停提示" position="top">
          <Button text="悬停" icon="arrow-up" size="sm" variant="outline" />
        </Popover>
        <Popover variant="tooltip" text="聚焦提示" position="top" trigger="focus">
          <input
            type="text"
            placeholder="点击聚焦"
            style="
              padding: calc(6px * var(--vcl-scale)) calc(12px * var(--vcl-scale));
              border: 1.5px solid var(--vcl-color-border);
              border-radius: var(--vcl-radius-md);
              font-size: calc(13px * var(--vcl-scale));
              outline: none;
            "
          />
        </Popover>
        <Popover variant="tooltip" text="右侧提示" position="right">
          <Button text="右" icon="arrow-right" size="sm" variant="outline" />
        </Popover>
        <Popover variant="tooltip" text="下方提示" position="bottom">
          <Button text="下" icon="arrow-down" size="sm" variant="outline" />
        </Popover>
        <Popover variant="tooltip" text="左侧提示" position="left">
          <Button text="左" icon="arrow-left" size="sm" variant="outline" />
        </Popover>
      </div>
      <p
        style="
          margin-top: calc(12px * var(--vcl-scale));
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
        "
      >
        <code>trigger="hover"</code> 悬停触发（默认）| <code>trigger="focus"</code> 聚焦触发（适合表单字段提示）
      </p>
    </Card>

    <Card title="Popover 气泡卡片" title-as="h2">
      <div style="display: flex; gap: calc(16px * var(--vcl-scale)); align-items: center; flex-wrap: wrap">
        <Popover title="通知中心" trigger="click" position="right" arrow>
          <template #trigger>
            <button type="button" class="pop-trigger" title="通知中心" aria-label="通知中心">
              <IconSvg type="bell" size="sm" />
            </button>
          </template>
          <p>你有 3 条新消息（arrow 开：带指向三角）</p>
          <p
            style="
              color: var(--vcl-color-text-muted);
              font-size: calc(12px * var(--vcl-scale));
              margin-top: calc(4px * var(--vcl-scale));
            "
          >
            上次查看: 5 分钟前
          </p>
        </Popover>
        <Popover title="帮助信息" trigger="hover" position="right">
          <template #trigger>
            <button type="button" class="pop-trigger" title="帮助信息" aria-label="帮助信息">
              <IconSvg type="help-circle" size="sm" />
            </button>
          </template>
          <p>悬停即可查看帮助内容</p>
        </Popover>
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
            <td><code>variant</code></td>
            <td>'popover' \| 'tooltip'</td>
            <td>'popover'</td>
            <td>'popover' 卡片弹层 \| 'tooltip' 文字气泡</td>
          </tr>
          <tr>
            <td><code>title</code></td>
            <td>string</td>
            <td>—</td>
            <td>浮层标题（popover 模式非空时展示标题行）</td>
          </tr>
          <tr>
            <td><code>trigger</code></td>
            <td>'click' \| 'hover' \| 'focus'</td>
            <td>'click'</td>
            <td>'click' \| 'hover' \| 'focus' — tooltip 模式（有 text）时强制 hover</td>
          </tr>
          <tr>
            <td><code>text</code></td>
            <td>string</td>
            <td>—</td>
            <td>纯文字快捷模式 → tooltip 行为</td>
          </tr>
          <tr>
            <td><code>position</code></td>
            <td>'top' \| 'bottom' \| 'left' \| 'right'</td>
            <td>'top'</td>
            <td>tooltip 方向</td>
          </tr>
          <tr>
            <td><code>zIndex</code></td>
            <td>number \| string</td>
            <td>—</td>
            <td>浮层 z-index（数字或 CSS 变量字符串）；默认走 --vcl-z-dropdown 变量</td>
          </tr>
          <tr>
            <td><code>arrow</code></td>
            <td>boolean</td>
            <td>—</td>
            <td>
              指向三角（箭头）：浮层贴触发器一侧渲染 45° 菱形三角并自动对准触发器中心。 默认 false——2026-10-02
              定案气泡无箭头；此开关为需要强指向场景的可选项。
            </td>
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
/* 气泡卡片案例的图标触发器：32×32 描边图标按钮（默认 circle-alert 与「通知/帮助」语义不符） */
.pop-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(32px * var(--vcl-scale));
  height: calc(32px * var(--vcl-scale));
  padding: 0;
  border: 1px solid var(--vcl-color-border);
  border-radius: var(--vcl-radius-md);
  background: var(--vcl-color-surface);
  color: var(--vcl-color-text-secondary);
  cursor: pointer;
  transition: all var(--vcl-transition-fast);
}
.pop-trigger:hover {
  color: var(--vcl-color-primary-on-surface);
  border-color: var(--vcl-color-primary);
}
</style>
