<script setup lang="ts">
import { ref } from 'vue'
import Result from '@/components/feedback/Result.vue'
import Empty from '@/components/data/Empty.vue'
import Button from '@/components/basic/Button.vue'
import Card from '@/components/data/Card.vue'

const lastAction = ref('')
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">Result 结果页</h2>
    <p class="demo-desc">
      操作结果反馈（success / error / warning / 404 / empty）+ 空状态占位（Empty）。Result 用于完整结果页，Empty
      用于列表/面板内的简洁空占位。
    </p>

    <!-- ══════════════ Result 结果页 ══════════════ -->
    <p class="demo-desc">
      下方三个结果页的主行动按钮都会把点击回抛到 <code>@action</code>：
      <strong>最近一次点击：{{ lastAction || '（还没点过）' }}</strong>
    </p>
    <Card title="Result — 成功" style="margin-bottom: 24px">
      <Result
        status="success"
        title="操作成功"
        description="您的数据已成功提交，预计 3 个工作日内处理完成。"
        action-text="返回首页"
        @action="lastAction = '返回首页'"
      />
    </Card>

    <Card title="Result — 失败" style="margin-bottom: 24px">
      <Result
        status="error"
        title="提交失败"
        description="请检查网络连接后重试，或联系管理员。"
        action-text="重新提交"
        @action="lastAction = '重新提交'"
      />
    </Card>

    <Card title="Result — 警告" style="margin-bottom: 24px">
      <Result
        status="warning"
        title="注意"
        description="当前操作可能会影响部分用户的数据。"
        action-text="我知道了"
        @action="lastAction = '我知道了'"
      />
    </Card>

    <Card title="Result — 404 / 空状态" style="margin-bottom: 24px">
      <div style="display: flex; gap: 16px">
        <Result status="404" title="页面不存在" description="您访问的页面可能已删除或迁移。" />
        <Result status="empty" title="暂无数据" />
      </div>
    </Card>

    <!-- ══════════════ Empty 空状态（简洁占位） ══════════════ -->
    <div class="grid-2-col">
      <Card title="Empty — 图标 + 标题 + 描述">
        <Empty icon="file" title="暂无数据" description="点击上方按钮添加数据" />
      </Card>

      <Card title="Empty — 带操作按钮">
        <Empty icon="search" title="无搜索结果" description="试试更换关键词">
          <Button text="重新搜索" variant="primary" size="sm" icon="search" />
        </Empty>
      </Card>

      <Card title="Empty — 通知空">
        <Empty icon="bell" title="暂无通知" description="新消息将显示在这里" />
      </Card>

      <Card title="Empty — 网络错误">
        <Empty icon="wifi-off" title="网络连接失败" description="请检查网络设置">
          <Button text="重试" variant="outline" size="sm" icon="rotate-cw" />
        </Empty>
      </Card>
    </div>

    <!-- ══════════════ Props ══════════════ -->
    <Card title="Result Props" style="margin-top: 24px">
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
            <td><code>status</code></td>
            <td>string</td>
            <td>'empty'</td>
            <td>success | error | info | warning | 404 | empty</td>
          </tr>
          <tr>
            <td><code>title</code></td>
            <td>string</td>
            <td>—</td>
            <td>标题</td>
          </tr>
          <tr>
            <td><code>description</code></td>
            <td>string</td>
            <td>—</td>
            <td>描述文字</td>
          </tr>
          <tr>
            <td><code>actionText</code></td>
            <td>string</td>
            <td>—</td>
            <td>操作按钮文字</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <Card title="Empty Props" style="margin-top: 24px">
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
            <td><code>icon</code></td>
            <td>string</td>
            <td>'file'</td>
            <td>图标类型（IconSvg type）</td>
          </tr>
          <tr>
            <td><code>title</code></td>
            <td>string</td>
            <td>—</td>
            <td>标题</td>
          </tr>
          <tr>
            <td><code>description</code></td>
            <td>string</td>
            <td>—</td>
            <td>描述文本</td>
          </tr>
        </tbody>
      </table>
      <p style="font-size: 12px; color: var(--color-text-muted); margin-top: 8px">
        Slot: <code>default</code> — 操作按钮区域
      </p>
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
