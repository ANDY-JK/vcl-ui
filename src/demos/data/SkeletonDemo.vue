<script setup lang="ts">
import { ref } from 'vue'
import Skeleton from '@/components/data/Skeleton.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'

const loading = ref(true)
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Skeleton 骨架屏</h2>
    <p class="demo-desc">
      灰阶占位 + 流光动画；<code>loading=false</code> 时切换为默认插槽的真实内容（<code>prefers-reduced-motion</code>
      下自动禁用动画）
    </p>

    <div class="grid-2-col" style="margin-bottom: 24px">
      <Card title="加载切换 — 骨架 ↔ 真实内容">
        <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 16px">
          <Button size="sm" :text="loading ? '加载中…' : '显示骨架'" @click="loading = !loading" />
        </div>
        <Skeleton :loading="loading" :avatar="true" :rows="3">
          <div>
            <h3 style="font-size: 16px; margin-bottom: 6px">用户信息卡片</h3>
            <p style="font-size: 13px; color: var(--color-text-secondary); margin-bottom: 4px">
              姓名：张三 · 角色：管理员
            </p>
            <p style="font-size: 13px; color: var(--color-text-muted)">
              简介：这是加载完成后展示的真实内容，用于演示 <code>:loading</code> 切换。
            </p>
          </div>
        </Skeleton>
      </Card>

      <Card title="基础骨架（默认）">
        <p style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 12px">
          默认 <code>title</code> 加宽首行 + <code>rows=3</code> 文本行，独立骨架使用
        </p>
        <Skeleton />
      </Card>

      <Card title="头像组合">
        <p style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 12px">
          <code>avatar</code>：true 默认 40px | 'sm'/'md'/'lg' | 任意数字或 CSS 尺寸
        </p>
        <div style="display: flex; flex-direction: column; gap: 20px">
          <Skeleton avatar="sm" :rows="2" />
          <Skeleton avatar :rows="2" />
          <Skeleton avatar="lg" :rows="3" />
          <Skeleton avatar="48" :rows="2" />
        </div>
      </Card>

      <Card title="自定义">
        <p style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 12px">
          <code>rows=5</code> | <code>title=false</code> | <code>animated=false</code> 静态 |
          <code>width/height</code> 块尺寸
        </p>
        <div style="display: flex; flex-direction: column; gap: 20px">
          <Skeleton :rows="5" />
          <Skeleton :title="false" :rows="2" />
          <Skeleton :animated="false" :rows="2" />
          <Skeleton :rows="3" width="240px" height="90px" />
        </div>
      </Card>
    </div>

    <Card title="Skeleton Props">
      <table style="width: 100%; font-size: 13px; border-collapse: collapse">
        <tr style="border-bottom: 2px solid var(--color-border); text-align: left">
          <th style="padding: 4px 8px">Prop</th>
          <th style="padding: 4px 8px">类型</th>
          <th style="padding: 4px 8px">默认</th>
          <th style="padding: 4px 8px">说明</th>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)"><code>loading</code></td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">true</td>
          <td style="padding: 3px 8px">false 时渲染默认插槽真实内容</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)"><code>rows</code></td>
          <td style="padding: 3px 8px">number</td>
          <td style="padding: 3px 8px">3</td>
          <td style="padding: 3px 8px">文本行数（title 之外）</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)"><code>animated</code></td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">true</td>
          <td style="padding: 3px 8px">流光动画</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)"><code>avatar</code></td>
          <td style="padding: 3px 8px">boolean | number | string</td>
          <td style="padding: 3px 8px">false</td>
          <td style="padding: 3px 8px">头像：true 40px | 数字 px | 'sm'|'md'|'lg' | CSS 尺寸</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px; border-bottom: 1px solid var(--color-border-light)"><code>title</code></td>
          <td style="padding: 3px 8px">boolean</td>
          <td style="padding: 3px 8px">true</td>
          <td style="padding: 3px 8px">首行加宽标题</td>
        </tr>
        <tr>
          <td style="padding: 3px 8px"><code>width / height</code></td>
          <td style="padding: 3px 8px">string</td>
          <td style="padding: 3px 8px">—</td>
          <td style="padding: 3px 8px">自定义骨架块尺寸</td>
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
</style>
