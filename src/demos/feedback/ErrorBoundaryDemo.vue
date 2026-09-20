<script setup lang="ts">
import { defineComponent, ref } from 'vue'
import ErrorBoundary from '@/components/feedback/ErrorBoundary.vue'
import OfflineIndicator from '@/components/feedback/OfflineIndicator.vue'
import ReadOnlyOverlay from '@/components/feedback/ReadOnlyOverlay.vue'
import Button from '@/components/basic/Button.vue'
import Card from '@/components/data/Card.vue'

// 模拟会抛异常的子组件：setup 抛错由 ErrorBoundary 捕获。
// render 必须存在且不可达也要给 —— 只给 template 会因 runtime-only 构建编译不了而告警，
// 完全不提供 template/render 会触发「Component is missing template or render function」告警。
const Boom = defineComponent({
  // 显式标 void：否则 TS 把「总是 throw」的 setup 推成 never，Boom 的 props 也跟着变成 never
  setup(): void {
    throw new Error('模拟的渲染异常：Division by zero in render')
  },
  render: () => null,
})

const resetKey = ref(0)
const triggerError = ref(false)
const readonlyVisible = ref(false)

function retry() {
  triggerError.value = false
  resetKey.value++
}
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">ErrorBoundary 错误边界 + 状态指示器</h1>
    <p class="demo-desc">捕获子组件渲染异常、离线提示、只读遮罩。支持自定义 fallback slot 和重试。</p>

    <Card title="正常渲染（无异常）" title-as="h2" style="margin-bottom: 24px">
      <ErrorBoundary title="安全区域">
        <div style="padding: 20px; text-align: center; color: var(--color-text-muted)">
          这是一个正常渲染的子组件，没有异常。
        </div>
      </ErrorBoundary>
    </Card>

    <Card title="捕获异常 + 重试" title-as="h2" style="margin-bottom: 24px">
      <div style="margin-bottom: 12px">
        <Button text="触发异常" variant="danger" icon="circle-alert" @click="triggerError = true" />
        <Button text="重试" variant="outline" icon="rotate-cw" style="margin-left: 8px" @click="retry" />
      </div>

      <ErrorBoundary :key="resetKey" title="子组件崩溃" retry-text="重试加载">
        <Boom v-if="triggerError" />
        <div v-else style="padding: 20px; text-align: center; color: var(--color-text-muted)">
          点击「触发异常」按钮，子组件会抛出错误，ErrorBoundary 将捕获并展示降级 UI。
        </div>
      </ErrorBoundary>
    </Card>

    <Card title="OfflineIndicator 离线提示" title-as="h2" style="margin-bottom: 24px">
      <p style="font-size: 13px; color: var(--color-text-muted); margin-bottom: 12px">
        断网时顶部自动显示黄色横幅。你可以断开网络测试，或查看页面顶部。
      </p>
      <OfflineIndicator />
    </Card>

    <Card title="ReadOnlyOverlay 只读遮罩" title-as="h2" style="margin-bottom: 24px">
      <Button text="模拟只读模式" variant="outline" @click="readonlyVisible = true" />
      <ReadOnlyOverlay :visible="readonlyVisible" reason="系统升级维护中（2024-05-16 02:00-04:00），当前仅可查看数据" />
      <Button
        v-if="readonlyVisible"
        text="关闭遮罩"
        variant="primary"
        style="margin-top: 8px; display: block"
        @click="readonlyVisible = false"
      />
      <p style="font-size: 12px; color: var(--color-text-muted); margin-top: 12px">
        <code>ReadOnlyOverlay</code> Props: <code>visible: boolean</code> | <code>reason: string</code>（默认
        '系统维护中，当前为只读模式'）
      </p>
    </Card>

    <Card title="自定义 fallback slot" title-as="h2">
      <ErrorBoundary title="自定义错误">
        <template #fallback="{ error, retry }">
          <div style="padding: 24px; text-align: center; background: var(--color-danger-bg); border-radius: 8px">
            <p style="color: var(--color-danger); font-weight: 600; margin-bottom: 8px">🚨 自定义错误展示</p>
            <p style="font-size: 13px; color: var(--color-text-muted); margin-bottom: 12px">
              {{ error?.message }}
            </p>
            <Button text="自定义重试" variant="primary" size="sm" @click="retry" />
          </div>
        </template>
        <div style="padding: 20px; text-align: center; color: var(--color-text-muted)">这段不会出异常。</div>
      </ErrorBoundary>
    </Card>

    <Card title="Props" title-as="h2">
      <table style="width: 100%; font-size: 13px; border-collapse: collapse">
        <thead>
          <tr style="border-bottom: 2px solid var(--color-border); text-align: left">
            <th style="padding: 6px 8px">Prop</th>
            <th style="padding: 6px 8px">类型</th>
            <th style="padding: 6px 8px">默认</th>
            <th style="padding: 6px 8px">说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              <code>title</code>
            </td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">string</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">'页面出错了'</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">错误标题</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px">
              <code>retryText</code>
            </td>
            <td style="padding: 6px 8px">string</td>
            <td style="padding: 6px 8px">'重试'</td>
            <td style="padding: 6px 8px">重试按钮文字</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <Card title="Slots" title-as="h2" style="margin-top: 24px">
      <table style="width: 100%; font-size: 13px; border-collapse: collapse">
        <thead>
          <tr style="border-bottom: 2px solid var(--color-border); text-align: left">
            <th style="padding: 6px 8px">Slot</th>
            <th style="padding: 6px 8px">作用域</th>
            <th style="padding: 6px 8px">说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              <code>default</code>
            </td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">—</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">正常内容</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px">
              <code>fallback</code>
            </td>
            <td style="padding: 6px 8px">{ error, retry }</td>
            <td style="padding: 6px 8px">自定义错误 UI</td>
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
</style>
