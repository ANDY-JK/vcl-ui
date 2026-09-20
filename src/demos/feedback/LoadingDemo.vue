<script setup lang="ts">
import { ref } from 'vue'
import Loading from '@/components/feedback/Loading.vue'
import Skeleton from '@/components/data/Skeleton.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'

const loading = ref(true)
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Loading 加载</h1>
    <p class="demo-desc">
      Spinner 旋转加载 + 骨架屏（Skeleton）占位。Loading 组件内置 spinner/skeleton/skeleton-text/skeleton-card
      四种变体；Skeleton 组件支持 loading 切换真实内容 + 头像占位。
    </p>

    <!-- ══════════════ Spinner ══════════════ -->
    <div class="grid-2-col">
      <Card title="Spinner — 三种尺寸" title-as="h2">
        <div style="display: flex; align-items: center; gap: 24px">
          <Loading variant="spinner" size="sm" text="小" />
          <Loading variant="spinner" size="md" text="中" />
          <Loading variant="spinner" size="lg" />
        </div>
      </Card>

      <Card title="Spinner — 带文字" title-as="h2">
        <Loading variant="spinner" size="md" text="加载中，请稍候..." />
      </Card>

      <!-- ══════════════ Loading 内置骨架 ══════════════ -->
      <Card title="Loading skeleton — 行骨架" title-as="h2">
        <Loading variant="skeleton" :rows="4" />
      </Card>

      <Card title="Loading skeleton-text — 文字骨架" title-as="h2">
        <div style="display: flex; flex-direction: column; gap: 8px">
          <Loading variant="skeleton-text" width="100%" />
          <Loading variant="skeleton-text" width="80%" />
          <Loading variant="skeleton-text" width="60%" />
        </div>
      </Card>

      <Card title="Loading skeleton-card — 卡片骨架" title-as="h2">
        <Loading variant="skeleton-card" :rows="3" />
      </Card>

      <Card title="Loading skeleton — 自定义宽高 + 间距" title-as="h2">
        <div style="display: flex; flex-direction: column; gap: 16px">
          <Loading variant="skeleton-text" width="100%" height="20px" />
          <Loading variant="skeleton-text" width="70%" height="12px" />
          <Loading variant="skeleton-text" width="40%" height="12px" />
        </div>
      </Card>
    </div>

    <!-- ══════════════ Skeleton 组件（高级骨架屏） ══════════════ -->
    <div class="grid-2-col" style="margin-top: 24px">
      <Card title="Skeleton — 加载切换（骨架 ↔ 真实内容）" title-as="h2">
        <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 16px">
          <Button size="sm" :text="loading ? '加载中…' : '显示骨架'" @click="loading = !loading" />
        </div>
        <Skeleton :loading="loading" :avatar="true" :rows="3">
          <div>
            <h2 style="font-size: 16px; margin-bottom: 6px">用户信息卡片</h2>
            <p style="font-size: 13px; color: var(--color-text-secondary); margin-bottom: 4px">
              姓名：张三 · 角色：管理员
            </p>
            <p style="font-size: 13px; color: var(--color-text-muted)">
              简介：这是加载完成后展示的真实内容，用于演示 <code>:loading</code> 切换。
            </p>
          </div>
        </Skeleton>
      </Card>

      <Card title="Skeleton — 基础骨架（默认）" title-as="h2">
        <p style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 12px">
          默认 <code>title</code> 加宽首行 + <code>rows=3</code> 文本行
        </p>
        <Skeleton />
      </Card>

      <Card title="Skeleton — 头像组合" title-as="h2">
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

      <Card title="Skeleton — 自定义" title-as="h2">
        <p style="font-size: 12px; color: var(--color-text-muted); margin-bottom: 12px">
          <code>rows=5</code> | <code>title=false</code> | <code>animated=false</code> | <code>width/height</code>
        </p>
        <div style="display: flex; flex-direction: column; gap: 20px">
          <Skeleton :rows="5" />
          <Skeleton :title="false" :rows="2" />
          <Skeleton :animated="false" :rows="2" />
          <Skeleton :rows="3" width="240px" height="90px" />
        </div>
      </Card>
    </div>

    <!-- ══════════════ Props ══════════════ -->
    <Card title="Loading Props" title-as="h2" style="margin-top: 24px">
      <table class="props-table">
        <thead>
          <tr>
            <th>Prop</th>
            <th>默认</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>variant</code></td>
            <td>'spinner'</td>
            <td>spinner | skeleton | skeleton-text | skeleton-card</td>
          </tr>
          <tr>
            <td><code>size</code></td>
            <td>'md'</td>
            <td>sm | md | lg（仅 spinner）</td>
          </tr>
          <tr>
            <td><code>text</code></td>
            <td>—</td>
            <td>加载文字（仅 spinner）</td>
          </tr>
          <tr>
            <td><code>rows</code></td>
            <td>3</td>
            <td>骨架行数</td>
          </tr>
          <tr>
            <td><code>width / height</code></td>
            <td>—</td>
            <td>自定义骨架块尺寸</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <Card title="Skeleton Props" title-as="h2" style="margin-top: 24px">
      <table class="props-table">
        <thead>
          <tr>
            <th>Prop</th>
            <th>类型</th>
            <th>默认</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>loading</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>false 时渲染默认插槽真实内容</td>
          </tr>
          <tr>
            <td><code>rows</code></td>
            <td>number</td>
            <td>3</td>
            <td>文本行数</td>
          </tr>
          <tr>
            <td><code>animated</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>流光动画</td>
          </tr>
          <tr>
            <td><code>avatar</code></td>
            <td>boolean | number | string</td>
            <td>false</td>
            <td>头像占位</td>
          </tr>
          <tr>
            <td><code>title</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>首行加宽标题</td>
          </tr>
          <tr>
            <td><code>width / height</code></td>
            <td>string</td>
            <td>—</td>
            <td>自定义骨架块尺寸</td>
          </tr>
        </tbody>
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
.props-table {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}
.props-table th {
  padding: 4px 8px;
  border-bottom: 2px solid var(--color-border);
  text-align: left;
}
.props-table td {
  padding: 3px 8px;
  border-bottom: 1px solid var(--color-border-light);
}
</style>
