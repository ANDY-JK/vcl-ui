<script setup lang="ts">
import { ref } from 'vue'
import Tag from '@/components/basic/Tag.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'

const showCloseTag = ref(true)
const showHidden = ref(true)
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Tag 标签 + 徽标</h1>
    <p class="demo-desc">
      标签与徽标合一。内联标签（多变体/可关闭/圆角）+ 角标模式（数字/红点/文字，包裹内容右上角定位）。
    </p>

    <div class="grid-2-col" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <!-- 内联标签 -->
      <Card title="内联标签 — 多变体" title-as="h2">
        <p
          style="
            font-size: calc(12px * var(--vcl-scale));
            color: var(--vcl-color-text-muted);
            margin-bottom: calc(12px * var(--vcl-scale));
          "
        >
          5 种变体 + 可关闭 + sm/md 尺寸 + 圆角
        </p>
        <div style="display: flex; gap: calc(8px * var(--vcl-scale)); flex-wrap: wrap; align-items: center">
          <Tag>默认</Tag>
          <Tag variant="primary"> Primary </Tag>
          <Tag variant="success"> Success </Tag>
          <Tag variant="info"> Info </Tag>
          <Tag variant="danger"> Danger </Tag>
          <Tag variant="warning"> Warning </Tag>
          <Tag v-if="showCloseTag" closable @close="showCloseTag = false"> 可关闭 </Tag>
          <Tag variant="primary" size="sm" rounded> 小号圆角 </Tag>
        </div>
      </Card>

      <!-- 数字徽标 -->
      <Card title="数字徽标" title-as="h2">
        <p
          style="
            font-size: calc(12px * var(--vcl-scale));
            color: var(--vcl-color-text-muted);
            margin-bottom: calc(12px * var(--vcl-scale));
          "
        >
          <code>count</code> 数字 | <code>max=99</code> 溢出 99+ | count=0 默认隐藏，<code>show-zero</code> 显示
        </p>
        <div style="display: flex; gap: calc(24px * var(--vcl-scale)); align-items: center; flex-wrap: wrap">
          <Tag :count="5" />
          <Tag :count="100" />
          <Tag :count="12" :max="10" />
          <Tag :count="0" />
          <Tag :count="0" show-zero />
          <Tag v-if="showHidden" :count="3" hidden />
          <Button size="sm" variant="outline" text="切换 hidden" @click="showHidden = !showHidden" />
        </div>
      </Card>

      <!-- 红点 / 文字徽标 -->
      <Card title="红点 / 文字徽标" title-as="h2">
        <p
          style="
            font-size: calc(12px * var(--vcl-scale));
            color: var(--vcl-color-text-muted);
            margin-bottom: calc(12px * var(--vcl-scale));
          "
        >
          <code>dot</code> 红点 | <code>text</code> 文字徽标（优先于 count）
        </p>
        <!-- ⚠️ color prop 是**实心底色**，须用 --color-*-solid 令牌。
             直接传 --vcl-color-warning/-info/-success 这类「提亮色」（本为深底上的文字/图标设计）
             会因底色过亮而压不住白字：暗色下 warning 对比度仅 1.67，等同看不见。 -->
        <div style="display: flex; gap: calc(24px * var(--vcl-scale)); align-items: center; flex-wrap: wrap">
          <Tag dot />
          <Tag dot color="var(--vcl-color-warning-solid)" />
          <Tag text="NEW" />
          <Tag text="促销" color="var(--vcl-color-warning-solid)" />
          <Tag text="v2" color="var(--vcl-color-primary-solid)" />
          <Tag text="试用" :count="9" color="var(--vcl-color-success-solid)" />
        </div>
      </Card>

      <!-- 包裹内容角标 -->
      <Card title="角标模式 — 包裹内容右上角" title-as="h2">
        <p
          style="
            font-size: calc(12px * var(--vcl-scale));
            color: var(--vcl-color-text-muted);
            margin-bottom: calc(12px * var(--vcl-scale));
          "
        >
          默认骑在内容右上角（<code>offset</code> 可微调），超出边界对半跨出、不被裁剪
        </p>
        <div style="display: flex; gap: calc(40px * var(--vcl-scale)); align-items: center; flex-wrap: wrap">
          <Tag :count="3">
            <span style="font-size: calc(22px * var(--vcl-scale))">🔔</span>
          </Tag>
          <Tag :count="120">
            <span style="font-size: calc(22px * var(--vcl-scale))">📧</span>
          </Tag>
          <Tag dot>
            <span style="font-size: calc(22px * var(--vcl-scale))">📦</span>
          </Tag>
          <Tag :count="8" :offset="[3, 3]">
            <span style="font-size: calc(22px * var(--vcl-scale))">💬</span>
          </Tag>
        </div>
      </Card>
    </div>

    <Card title="Tag Props" title-as="h2">
      <table style="width: 100%; font-size: calc(13px * var(--vcl-scale)); border-collapse: collapse">
        <tbody>
          <tr style="border-bottom: 2px solid var(--vcl-color-border); text-align: left">
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">Prop</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">类型</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">默认</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">说明</th>
          </tr>
          <tr>
            <td><code>text</code></td>
            <td>string</td>
            <td>—</td>
            <td>文字内容（内联模式）</td>
          </tr>
          <tr>
            <td><code>variant</code></td>
            <td>'default' \| 'primary' \| 'success' \| 'danger' \| 'warning' \| 'info'</td>
            <td>'default'</td>
            <td>变体颜色</td>
          </tr>
          <tr>
            <td><code>size</code></td>
            <td>'sm' \| 'md'</td>
            <td>'md'</td>
            <td>尺寸</td>
          </tr>
          <tr>
            <td><code>closable</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>可关闭</td>
          </tr>
          <tr>
            <td><code>rounded</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>圆角药丸</td>
          </tr>
          <tr>
            <td><code>dot</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>纯圆点模式</td>
          </tr>
          <tr>
            <td><code>max</code></td>
            <td>number</td>
            <td>99</td>
            <td>数字溢出上限，如 99 → 99+，仅当 text 为纯数字或 count 生效时生效</td>
          </tr>
          <tr>
            <td><code>count</code></td>
            <td>number</td>
            <td>—</td>
            <td>数字徽标：显示数量；与 text 同时传入时 text 优先</td>
          </tr>
          <tr>
            <td><code>color</code></td>
            <td>string</td>
            <td>—</td>
            <td>自定义背景色（CSS 颜色或变量，默认随 variant）</td>
          </tr>
          <tr>
            <td><code>offset</code></td>
            <td>[number, number]</td>
            <td>—</td>
            <td>角标偏移 [x, y]：正 x 向右、正 y 向下（仅 sup 角标模式生效）</td>
          </tr>
          <tr>
            <td><code>showZero</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>count=0 时仍显示（默认 count=0 隐藏）</td>
          </tr>
          <tr>
            <td><code>hidden</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>强制隐藏</td>
          </tr>
          <tr>
            <td><code>sup</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>角标模式：包裹内容时角标定位在右上角（原 Badge 的核心功能）</td>
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
