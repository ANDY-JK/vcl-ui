<script setup lang="ts">
// CarouselDemo — 轮播
// 重点：密排形态（不高、圆点不占行高）、键盘可翻页、减弱动效下不自动播放
import { ref } from 'vue'
import Carousel from '@/components/data/Carousel.vue'

const idx = ref(0)
const notices = [
  { title: '系统维护通知', body: '本周日 02:00–04:00 停机升级，期间下单接口不可用。' },
  { title: '新版本发布', body: 'v2.0 已上线：字体标尺、滚动软化、验证码输入。' },
  { title: '安全提醒', body: '检测到你的账号在新设备登录，如非本人请立即改密。' },
]
</script>

<template>
  <div class="demo-container">
    <h1>Carousel 轮播</h1>
    <p class="desc">
      用 CSS <code>scroll-snap</code> 实现：吸附、触屏滑动、RTL、等比缩放都交给浏览器， 组件只做箭头 / 圆点 /
      键盘。子元素即页，不需要 <code>items</code> 数组。
    </p>

    <section class="demo-section">
      <h2>公告轮播（受控 + 自动播放 4s）</h2>
      <p class="hint">悬停或聚焦时暂停；<strong>系统开了「减弱动效」时不会自动播</strong>。方向键可翻页。</p>
      <Carousel
        v-model="idx"
        :count="notices.length"
        :autoplay="4000"
        height="calc(120px * var(--vcl-scale))"
        aria-label="系统公告"
      >
        <div v-for="n in notices" :key="n.title" class="notice">
          <strong class="notice-title">{{ n.title }}</strong>
          <span class="notice-body">{{ n.body }}</span>
        </div>
      </Carousel>
      <p class="result">当前第 {{ idx + 1 }} / {{ notices.length }} 条</p>
    </section>

    <section class="demo-section">
      <h2>不循环（末页停住）</h2>
      <Carousel :count="2" :loop="false" height="calc(90px * var(--vcl-scale))" aria-label="两步引导">
        <div class="step">第一步：选择数据源</div>
        <div class="step">第二步：绑定字段后保存</div>
      </Carousel>
    </section>

    <section class="demo-section">
      <h2>Props</h2>
      <table class="props-table" data-component="Carousel">
        <tbody>
          <tr class="props-header">
            <th>Prop</th>
            <th>类型</th>
            <th>默认</th>
            <th>说明</th>
          </tr>
          <tr>
            <td><code>count</code></td>
            <td>number</td>
            <td>—</td>
            <td>页数（= 直接子元素个数）。用于圆点/箭头/循环判定</td>
          </tr>
          <tr>
            <td><code>modelValue</code></td>
            <td>number</td>
            <td>—</td>
            <td>受控当前页（可选）；不传则内部自管</td>
          </tr>
          <tr>
            <td><code>autoplay</code></td>
            <td>number</td>
            <td>0</td>
            <td>自动播放间隔（毫秒）。0 = 不自动播放；减弱动效下不启动</td>
          </tr>
          <tr>
            <td><code>loop</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>是否循环（末页→首页）</td>
          </tr>
          <tr>
            <td><code>arrows</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>显示左右箭头</td>
          </tr>
          <tr>
            <td><code>dots</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>显示底部圆点</td>
          </tr>
          <tr>
            <td><code>height</code></td>
            <td>string</td>
            <td>''</td>
            <td>轨道高度（CSS 长度；不传则 180px 等比）</td>
          </tr>
          <tr>
            <td><code>ariaLabel</code></td>
            <td>string</td>
            <td>''</td>
            <td>无障碍名：读屏念「名字，轮播」</td>
          </tr>
        </tbody>
      </table>
      <p class="hint">
        事件：<code>update:modelValue</code> · <code>change(index, total)</code><br />
        实例方法：<code>next()</code> / <code>prev()</code> / <code>goTo(i)</code>
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
.notice {
  display: flex;
  flex-direction: column;
  gap: calc(6px * var(--vcl-scale));
  padding: calc(14px * var(--vcl-scale));
}
.notice-title {
  font-size: var(--vcl-text-subtitle-size);
  line-height: var(--vcl-text-subtitle-line);
}
.notice-body {
  font-size: var(--vcl-text-body-size);
  line-height: var(--vcl-text-body-line);
  color: var(--vcl-color-text-secondary);
}
.step {
  display: flex;
  align-items: center;
  padding: calc(14px * var(--vcl-scale));
  font-size: var(--vcl-text-body-size);
  line-height: var(--vcl-text-body-line);
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
