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

    <h2 class="demo-h2" style="margin-top: calc(24px * var(--vcl-scale))">
      折角丝带（corner）— 右上角 45° 折角标，装饰性三角
    </h2>
    <div class="grid-2-col">
      <Card title="新款上线" corner="NEW">
        <p style="color: var(--vcl-color-text-secondary)">corner=&quot;NEW&quot;（默认主色）。</p>
      </Card>
      <Card title="热卖商品" corner="热" corner-color="danger">
        <p style="color: var(--vcl-color-text-secondary)">corner-color=&quot;danger&quot;。</p>
      </Card>
      <Card title="限时优惠" corner="荐" corner-color="warning">
        <p style="color: var(--vcl-color-text-secondary)">corner-color=&quot;warning&quot;。</p>
      </Card>
      <Card title="已通过" corner="过" corner-color="success">
        <p style="color: var(--vcl-color-text-secondary)">corner-color=&quot;success&quot;。</p>
      </Card>
    </div>

    <h2 class="demo-h2" style="margin-top: calc(24px * var(--vcl-scale))">
      角标形态（corner-variant）— 透明胶囊悬浮不遮挡 / 状态圆点带脉冲
    </h2>
    <p class="demo-hint">
      <code>corner-variant="pill"</code>：透明浅底胶囊（-bg 底 + -text 字，悬浮不遮挡内容）；
      <code>corner-variant="dot"</code>：状态圆点 + 脉冲扩散环（文字读屏可读）；
      <code>corner-position</code>：四角可选，悬浮定位不占布局空间。
    </p>
    <div class="grid-2-col">
      <Card title="透明胶囊 · 四角" corner-variant="pill">
        <div style="position: relative; min-height: calc(72px * var(--vcl-scale))">
          <Card
            corner="运行中"
            corner-variant="pill"
            corner-position="top-left"
            corner-color="info"
            style="margin-bottom: calc(8px * var(--vcl-scale))"
          >
            <p style="color: var(--vcl-color-text-muted); font-size: calc(12px * var(--vcl-scale))">top-left · info</p>
          </Card>
          <Card corner="已就绪" corner-variant="pill" corner-position="top-right" corner-color="success">
            <p style="color: var(--vcl-color-text-muted); font-size: calc(12px * var(--vcl-scale))">
              top-right · success
            </p>
          </Card>
        </div>
      </Card>
      <Card title="状态圆点 · 底部角" corner-variant="dot">
        <div style="position: relative; min-height: calc(72px * var(--vcl-scale))">
          <Card
            corner="同步中"
            corner-variant="dot"
            corner-position="bottom-right"
            corner-color="warning"
            style="margin-bottom: calc(8px * var(--vcl-scale))"
          >
            <p style="color: var(--vcl-color-text-muted); font-size: calc(12px * var(--vcl-scale))">
              bottom-right · warning
            </p>
          </Card>
          <Card corner="异常" corner-variant="dot" corner-position="bottom-left" corner-color="danger">
            <p style="color: var(--vcl-color-text-muted); font-size: calc(12px * var(--vcl-scale))">
              bottom-left · danger
            </p>
          </Card>
        </div>
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
            <td><code>type</code></td>
            <td>'grid' \| 'stat'</td>
            <td>'grid'</td>
            <td>模式：grid 内容卡片（默认）\| stat 统计卡片</td>
          </tr>
          <tr>
            <td><code>title</code></td>
            <td>string</td>
            <td>—</td>
            <td>卡片标题（grid 模式）</td>
          </tr>
          <tr>
            <td><code>titleAs</code></td>
            <td>'h1' \| 'h2' \| 'h3' \| 'h4' \| 'h5' \| 'h6' \| 'div'</td>
            <td>'h3'</td>
            <td>
              title 的标题标签级。默认 h3：卡片通常是「页标题(h1) → 区块(h2) → 卡片」的第三级。
              硬编码某一级会在宿主层级不同时跳级（axe heading-order），故把选择权交给调用方； 传 'div'
              表示纯展示标题（卡片不承担文档结构职责时用）。
            </td>
          </tr>
          <tr>
            <td><code>highlight</code></td>
            <td>boolean</td>
            <td>—</td>
            <td>高亮描边（强调当前选中/活动卡片）</td>
          </tr>
          <tr>
            <td><code>summary</code></td>
            <td>boolean</td>
            <td>—</td>
            <td>摘要形态：压缩内边距的紧凑布局</td>
          </tr>
          <tr>
            <td><code>overflowVisible</code></td>
            <td>boolean</td>
            <td>—</td>
            <td>允许内容溢出卡片边界（用于包含下拉/弹出组件的场景）</td>
          </tr>
          <tr>
            <td><code>accent</code></td>
            <td>'primary' \| 'success' \| 'warning' \| 'danger' \| 'info'</td>
            <td>—</td>
            <td>
              卡片头部标题左侧的状态竖条颜色（accent bar）。不传 = 无竖条。
              常用于列表/看板里按状态给卡片分类着色（2026-10-04 用户需求）。
            </td>
          </tr>
          <tr>
            <td><code>corner</code></td>
            <td>string</td>
            <td>—</td>
            <td>
              角标文案（如「NEW」「热」「异常」）。传入即渲染；dot 形态下文字视觉隐藏、读屏仍读。
              折角形态属装饰性几何三角；语义三角（排序/涨跌/警告）请用 IconSvg。 依赖卡片 overflow:hidden 裁切——与
              overflowVisible 同用时丝带两端会露出卡外。
            </td>
          </tr>
          <tr>
            <td><code>cornerColor</code></td>
            <td>'primary' \| 'success' \| 'warning' \| 'danger' \| 'info'</td>
            <td>'primary'</td>
            <td>角标底色（语义色，默认 primary）</td>
          </tr>
          <tr>
            <td><code>cornerVariant</code></td>
            <td>'ribbon' \| 'pill' \| 'dot'</td>
            <td>'ribbon'</td>
            <td>
              角标形态：ribbon 45° 折角丝带（实心底，装饰三角）\| pill 透明浅底胶囊（-bg 底 + -text 字，
              悬浮不遮挡内容）\| dot 状态圆点（-solid 饱和点 + pulse 扩散环，文字读屏可读）。默认 ribbon。
            </td>
          </tr>
          <tr>
            <td><code>cornerPosition</code></td>
            <td>'top-right' \| 'top-left' \| 'bottom-right' \| 'bottom-left'</td>
            <td>'top-right'</td>
            <td>角标位置（默认 top-right）。悬浮定位不占布局空间。</td>
          </tr>
          <tr>
            <td><code>value</code></td>
            <td>string \| number</td>
            <td>—</td>
            <td>统计数值</td>
          </tr>
          <tr>
            <td><code>label</code></td>
            <td>string</td>
            <td>—</td>
            <td>数值下方的标签文案</td>
          </tr>
          <tr>
            <td><code>icon</code></td>
            <td>string</td>
            <td>'circle-alert'</td>
            <td>统计图标（IconSvg 图标名）</td>
          </tr>
          <tr>
            <td><code>color</code></td>
            <td>string</td>
            <td>—</td>
            <td>数值/图标语义色（CSS 颜色值或令牌名）</td>
          </tr>
          <tr>
            <td><code>trend</code></td>
            <td>number \| string</td>
            <td>—</td>
            <td>
              趋势：数字或 '12%' 类字符串；正=上涨箭头、负=下跌箭头、0/非法值=持平。 非有限值（如分母为 0 得到的
              Infinity）与不可解析的字符串（'1,234'/'12px'）一律按持平处理——
              它们不能变成「Infinity%」或一个看起来正常的错数（第 169 轮）。
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
  line-height: 1.6;
}
code {
  background: var(--vcl-color-bg-alt);
  padding: 1px calc(5px * var(--vcl-scale));
  border-radius: calc(3px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
}
</style>
