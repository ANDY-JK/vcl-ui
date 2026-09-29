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
            color: var(--color-text-muted);
            margin-bottom: calc(12px * var(--vcl-scale));
          "
        >
          5 种变体 + 可关闭 + sm/md 尺寸 + 圆角
        </p>
        <div style="display: flex; gap: calc(8px * var(--vcl-scale)); flex-wrap: wrap; align-items: center">
          <Tag>默认</Tag>
          <Tag variant="primary"> Primary </Tag>
          <Tag variant="success"> Success </Tag>
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
            color: var(--color-text-muted);
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
            color: var(--color-text-muted);
            margin-bottom: calc(12px * var(--vcl-scale));
          "
        >
          <code>dot</code> 红点 | <code>text</code> 文字徽标（优先于 count）
        </p>
        <!-- ⚠️ color prop 是**实心底色**，须用 --color-*-solid 令牌。
             直接传 --color-warning/-info/-success 这类「提亮色」（本为深底上的文字/图标设计）
             会因底色过亮而压不住白字：暗色下 warning 对比度仅 1.67，等同看不见。 -->
        <div style="display: flex; gap: calc(24px * var(--vcl-scale)); align-items: center; flex-wrap: wrap">
          <Tag dot />
          <Tag dot color="var(--color-warning-solid)" />
          <Tag text="NEW" />
          <Tag text="促销" color="var(--color-warning-solid)" />
          <Tag text="v2" color="var(--color-primary-solid)" />
          <Tag text="试用" :count="9" color="var(--color-success-solid)" />
        </div>
      </Card>

      <!-- 包裹内容角标 -->
      <Card title="角标模式 — 包裹内容右上角" title-as="h2">
        <p
          style="
            font-size: calc(12px * var(--vcl-scale));
            color: var(--color-text-muted);
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
          <tr style="border-bottom: 2px solid var(--color-border); text-align: left">
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">Prop</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">类型</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">默认</th>
            <th style="padding: calc(4px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">说明</th>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--color-border-light);
              "
            >
              <code>text</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">string</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">—</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">文字内容（内联模式）</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--color-border-light);
              "
            >
              <code>variant</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">string</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">default</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              default | primary | success | danger | warning | info
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--color-border-light);
              "
            >
              <code>size</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">string</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">md</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">sm | md</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--color-border-light);
              "
            >
              <code>closable</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">boolean</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">false</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">显示关闭按钮</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--color-border-light);
              "
            >
              <code>rounded</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">boolean</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">false</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">圆角药丸形状</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--color-border-light);
              "
            >
              <code>dot</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">boolean</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">false</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">红点模式</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--color-border-light);
              "
            >
              <code>count</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">number</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">—</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">数字徽标，0 默认隐藏</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--color-border-light);
              "
            >
              <code>max</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">number</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">99</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">数字溢出上限</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--color-border-light);
              "
            >
              <code>color</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">string</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">随 variant</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">自定义背景色</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--color-border-light);
              "
            >
              <code>offset</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">[number, number]</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">—</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">角标偏移 [x, y]</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--color-border-light);
              "
            >
              <code>showZero</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">boolean</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">false</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">count=0 时仍显示</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--color-border-light);
              "
            >
              <code>hidden</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">boolean</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">false</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">强制隐藏</td>
          </tr>
          <tr>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              <code>sup</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">boolean</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">false</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              强制角标模式（包裹内容右上角）
            </td>
          </tr>
        </tbody>
      </table>
    </Card>
  </div>
</template>

<style scoped>
.demo-title {
  font-size: calc(22px * var(--vcl-scale));
  font-weight: 700;
  margin-bottom: calc(4px * var(--vcl-scale));
}
.demo-desc {
  color: var(--color-text-muted);
  margin-bottom: calc(24px * var(--vcl-scale));
  font-size: calc(14px * var(--vcl-scale));
  line-height: 1.6;
}
code {
  background: var(--color-bg-alt);
  padding: 1px calc(5px * var(--vcl-scale));
  border-radius: calc(3px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
}
</style>
