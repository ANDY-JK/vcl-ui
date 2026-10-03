<script setup lang="ts">
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'

const stats = [
  { value: '12,847', label: '总用户数', icon: 'user', trend: 12 },
  { value: '¥89,400', label: '本月收入', icon: 'star', trend: 8, color: 'var(--vcl-color-success)' },
  { value: '342', label: '订单数', icon: 'package', trend: -3 },
  { value: '98.5%', label: '系统可用率', icon: 'shield', trend: 0.5, color: 'var(--vcl-color-success)' },
]
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Card 卡片</h1>
    <p class="demo-desc">
      <code>type="stat"</code> 统计数值卡片 | <code>type="grid"</code> 通用容器卡片（默认）。 支持
      <code>highlight</code>、<code>summary</code>、header/body/footer 三段结构。
    </p>

    <!-- stat 模式 -->
    <h2
      style="font-size: calc(16px * var(--vcl-scale)); font-weight: 600; margin-bottom: calc(16px * var(--vcl-scale))"
    >
      stat — 统计卡片
    </h2>
    <Card
      v-for="s in stats"
      :key="s.label"
      type="stat"
      :value="s.value"
      :label="s.label"
      :icon="s.icon"
      :trend="s.trend"
      :color="s.color"
      style="margin-bottom: calc(12px * var(--vcl-scale))"
    />

    <div
      style="
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(calc(220px * var(--vcl-scale)), 1fr));
        gap: calc(16px * var(--vcl-scale));
        margin-bottom: calc(32px * var(--vcl-scale));
      "
    >
      <Card type="stat" value="12,847" label="总用户数" icon="user" trend="12" />
      <Card type="stat" value="¥89,400" label="本月收入" icon="star" trend="8" color="var(--vcl-color-success)" />
      <Card type="stat" value="342" label="订单数" icon="box" trend="-3" />
      <Card type="stat" value="98.5%" label="系统可用率" icon="shield" trend="0.5" color="var(--vcl-color-success)" />
    </div>

    <!-- grid 模式 -->
    <h2
      style="font-size: calc(16px * var(--vcl-scale)); font-weight: 600; margin-bottom: calc(16px * var(--vcl-scale))"
    >
      grid — 通用容器卡片
    </h2>
    <div class="grid-2-col">
      <Card title="基础卡片" title-as="h2">
        <p style="color: var(--vcl-color-text-secondary)">带 header + body + footer 三段结构。</p>
        <template #footer>
          <div style="display: flex; justify-content: flex-end; gap: calc(8px * var(--vcl-scale))">
            <Button text="取消" variant="ghost" size="sm" />
            <Button text="保存" variant="primary" size="sm" />
          </div>
        </template>
      </Card>

      <Card title="高亮卡片" highlight>
        <p style="color: var(--vcl-color-text-secondary)">蓝色边框高亮，用于重点区域。</p>
      </Card>

      <Card title="汇总模式" summary>
        <p style="color: var(--vcl-color-text); font-weight: 600">总金额: ¥128,400</p>
        <p style="color: var(--vcl-color-text-muted); font-size: calc(12px * var(--vcl-scale))">
          summary 模式：蓝色浅底，无边框
        </p>
      </Card>

      <Card>
        <p style="color: var(--vcl-color-text-muted)">无 title 模式：纯内容，无 header。</p>
      </Card>
    </div>

    <h2 class="demo-h2" style="margin-top: calc(24px * var(--vcl-scale))">
      状态竖条（accent）— 标题左侧 3px 竖条标识卡片状态
    </h2>
    <div class="grid-2-col">
      <Card title="主色竖条" accent="primary">
        <p style="color: var(--vcl-color-text-secondary)">accent=&quot;primary&quot;：常规强调。</p>
      </Card>
      <Card title="成功竖条" accent="success">
        <p style="color: var(--vcl-color-text-secondary)">accent=&quot;success&quot;：通过/正常状态。</p>
      </Card>
      <Card title="警告竖条" accent="warning">
        <p style="color: var(--vcl-color-text-secondary)">accent=&quot;warning&quot;：需要注意。</p>
      </Card>
      <Card title="危险竖条" accent="danger">
        <p style="color: var(--vcl-color-text-secondary)">accent=&quot;danger&quot;：异常/失败状态。</p>
      </Card>
    </div>

    <Card title="Props" title-as="h2" style="margin-top: calc(24px * var(--vcl-scale))">
      <table style="width: 100%; font-size: calc(13px * var(--vcl-scale)); border-collapse: collapse">
        <tbody>
          <tr style="border-bottom: 2px solid var(--vcl-color-border); text-align: left">
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">Prop</th>
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
              <code>type</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              grid
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              grid | stat
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>title</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              —
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              卡片标题（grid 模式）
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>highlight</code>
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
              高亮边框
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>summary</code>
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
              汇总模式
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>icon</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              —
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              图标名（stat 模式）
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>label</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              —
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              标签文字（stat 模式）
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>color</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              —
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              图标颜色（stat 模式）
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>value</code>
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              —
            </td>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              统计数值（stat 模式）
            </td>
          </tr>
          <tr>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              <code>trend</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">—</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">趋势百分比（stat 模式）</td>
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
</style>
