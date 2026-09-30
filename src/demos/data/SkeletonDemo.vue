<script setup lang="ts">
import { ref } from 'vue'
import Skeleton from '@/components/data/Skeleton.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'

const loading = ref(true)
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Skeleton 骨架屏</h1>
    <p class="demo-desc">
      灰阶占位 + 流光动画；<code>loading=false</code> 时切换为默认插槽的真实内容（<code>prefers-reduced-motion</code>
      下自动禁用动画）
    </p>

    <div class="grid-2-col" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <Card title="加载切换 — 骨架 ↔ 真实内容" title-as="h2">
        <div
          style="
            display: flex;
            gap: calc(12px * var(--vcl-scale));
            align-items: center;
            margin-bottom: calc(16px * var(--vcl-scale));
          "
        >
          <Button size="sm" :text="loading ? '加载中…' : '显示骨架'" @click="loading = !loading" />
        </div>
        <Skeleton :loading="loading" :avatar="true" :rows="3">
          <div>
            <h2 style="font-size: calc(16px * var(--vcl-scale)); margin-bottom: calc(6px * var(--vcl-scale))">
              用户信息卡片
            </h2>
            <p
              style="
                font-size: calc(13px * var(--vcl-scale));
                color: var(--vcl-color-text-secondary);
                margin-bottom: calc(4px * var(--vcl-scale));
              "
            >
              姓名：张三 · 角色：管理员
            </p>
            <p style="font-size: calc(13px * var(--vcl-scale)); color: var(--vcl-color-text-muted)">
              简介：这是加载完成后展示的真实内容，用于演示 <code>:loading</code> 切换。
            </p>
          </div>
        </Skeleton>
      </Card>

      <Card title="基础骨架（默认）" title-as="h2">
        <p
          style="
            font-size: calc(12px * var(--vcl-scale));
            color: var(--vcl-color-text-muted);
            margin-bottom: calc(12px * var(--vcl-scale));
          "
        >
          默认 <code>title</code> 加宽首行 + <code>rows=3</code> 文本行，独立骨架使用
        </p>
        <Skeleton />
      </Card>

      <Card title="头像组合" title-as="h2">
        <p
          style="
            font-size: calc(12px * var(--vcl-scale));
            color: var(--vcl-color-text-muted);
            margin-bottom: calc(12px * var(--vcl-scale));
          "
        >
          <code>avatar</code>：true 默认 40px | 'sm'/'md'/'lg' | 任意数字或 CSS 尺寸
        </p>
        <div style="display: flex; flex-direction: column; gap: calc(20px * var(--vcl-scale))">
          <Skeleton avatar="sm" :rows="2" />
          <Skeleton avatar :rows="2" />
          <Skeleton avatar="lg" :rows="3" />
          <Skeleton avatar="48" :rows="2" />
          <Skeleton :avatar="64" :rows="2" />
        </div>
      </Card>

      <Card title="自定义" title-as="h2">
        <p
          style="
            font-size: calc(12px * var(--vcl-scale));
            color: var(--vcl-color-text-muted);
            margin-bottom: calc(12px * var(--vcl-scale));
          "
        >
          <code>rows=5</code> | <code>title=false</code> | <code>animated=false</code> 静态 |
          <code>width/height</code> 块尺寸
        </p>
        <div style="display: flex; flex-direction: column; gap: calc(20px * var(--vcl-scale))">
          <Skeleton :rows="5" />
          <Skeleton :title="false" :rows="2" />
          <Skeleton :animated="false" :rows="2" />
          <Skeleton :rows="3" width="240px" height="90px" />
        </div>
      </Card>
    </div>

    <Card title="Skeleton Props" title-as="h2">
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
              <code>loading</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">boolean</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">true</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              false 时渲染默认插槽真实内容
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>rows</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">number</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">3</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">文本行数（title 之外）</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>animated</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">boolean</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">true</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">流光动画</td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>avatar</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              boolean | number | string
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">false</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              头像：true 40px | 数字 px | 'sm'|'md'|'lg' | CSS 尺寸
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
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">boolean</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">true</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">首行加宽标题</td>
          </tr>
          <tr>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              <code>width / height</code>
            </td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">string</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">—</td>
            <td style="padding: calc(3px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">自定义骨架块尺寸</td>
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
