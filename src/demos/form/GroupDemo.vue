<script setup lang="ts">
// GroupDemo — 统一选择组组件演示
// 展示 radio / checkbox / switch / rate / slider 五种模式
import { ref } from 'vue'
import Group from '@/components/form/Group.vue'

const radioVal = ref('apple')
const checkboxVal = ref<string[]>(['apple', 'banana'])
const switchVal = ref(true)
const rateVal = ref(3)
const sliderVal = ref(50)
const sliderRange = ref<[number, number]>([20, 80])

const fruitOptions = [
  { value: 'apple', label: '苹果' },
  { value: 'banana', label: '香蕉' },
  { value: 'cherry', label: '樱桃' },
  { value: 'durian', label: '榴莲', disabled: true },
]

// 外部判定无效演示（invalid，#342）：Group 没有 error prop（错误文案由渲染器统一渲染），
// invalid 只翻 aria-invalid —— 选区校验（如"配送时段必选"）在提交期由父级判
const scheduleVal = ref<string[]>([])
const scheduleInvalid = ref(false)

function submitSchedule() {
  // 模拟提交期校验：一个时段都没选 → invalid；选了 → 清掉
  scheduleInvalid.value = scheduleVal.value.length === 0
}

const scheduleOptions = [
  { value: 'morning', label: '上午' },
  { value: 'afternoon', label: '下午' },
  { value: 'evening', label: '晚间' },
]
</script>

<template>
  <div class="demo-container">
    <h1>Group 统一选择组组件</h1>
    <p class="desc">合并 RadioGroup / CheckboxGroup / Switch / Rate / Slider 为一个统一组件，通过 type 切换。</p>

    <!-- Radio -->
    <section class="demo-section">
      <h2>type="radio" — 单选按钮组</h2>
      <Group v-model="radioVal" type="radio" :options="fruitOptions" direction="horizontal" aria-label="水果单选" />
      <p class="result">当前值：{{ radioVal }}</p>
    </section>

    <!-- Checkbox -->
    <section class="demo-section">
      <h2>type="checkbox" — 复选按钮组</h2>
      <Group
        v-model="checkboxVal"
        type="checkbox"
        :options="fruitOptions"
        direction="horizontal"
        :max="3"
        aria-label="水果多选"
      />
      <p class="result">当前值：{{ checkboxVal.join(', ') }}</p>
    </section>

    <!-- Switch -->
    <section class="demo-section">
      <h2>type="switch" — 开关</h2>
      <div style="display: flex; gap: calc(24px * var(--vcl-scale)); align-items: center">
        <Group v-model="switchVal" type="switch" label="默认尺寸" size="md" />
        <Group v-model="switchVal" type="switch" label="小尺寸" size="sm" />
        <Group v-model="switchVal" type="switch" label="禁用" disabled />
      </div>
      <p class="result">当前值：{{ switchVal }}</p>
    </section>

    <!-- Rate -->
    <section class="demo-section">
      <h2>type="rate" — 评分</h2>
      <div style="display: flex; gap: calc(32px * var(--vcl-scale)); align-items: center">
        <Group v-model="rateVal" type="rate" :rate-max="5" />
        <Group v-model="rateVal" type="rate" :rate-max="5" allow-half color="#EF4444" />
        <Group v-model="rateVal" type="rate" :rate-max="10" color="#10B981" />
      </div>
      <p class="result">当前值：{{ rateVal }}</p>
    </section>

    <!-- Slider -->
    <section class="demo-section">
      <h2>type="slider" — 滑块（单值）</h2>
      <Group v-model="sliderVal" type="slider" :min="0" :slider-max="100" :step="1" />
      <p class="result">当前值：{{ sliderVal }}</p>
    </section>

    <section class="demo-section">
      <h2>type="slider" — 滑块（范围）</h2>
      <Group v-model="sliderRange" type="slider" :min="0" :slider-max="100" :step="5" />
      <p class="result">当前值：{{ sliderRange[0] }} ~ {{ sliderRange[1] }}</p>
    </section>

    <!-- 外部判定无效 -->
    <section class="demo-section">
      <h2>外部判定无效 — invalid（#342）</h2>
      <p class="desc">
        Group 没有 <code>error</code> prop（错误文案由表单渲染器统一渲染）；<code>invalid</code> 只翻
        <code>aria-invalid</code>（读屏播报"无效"）—— "配送时段必选"这类提交期规则由父级判。
      </p>
      <Group
        v-model="scheduleVal"
        type="checkbox"
        :options="scheduleOptions"
        label="配送时段"
        direction="horizontal"
        :invalid="scheduleInvalid || undefined"
        aria-label="配送时段"
      />
      <p class="result">当前值：{{ scheduleVal.length ? scheduleVal.join(', ') : '未选' }}</p>
      <button
        type="button"
        style="
          padding: calc(6px * var(--vcl-scale)) calc(14px * var(--vcl-scale));
          border: 1px solid var(--vcl-color-border);
          border-radius: var(--vcl-radius-md);
          background: var(--vcl-color-bg);
          cursor: pointer;
        "
        @click="submitSchedule"
      >
        模拟提交（未选时段会标无效）
      </button>
    </section>

    <!-- 禁用态 -->
    <section class="demo-section">
      <h2>禁用态</h2>
      <div style="display: flex; flex-direction: column; gap: calc(16px * var(--vcl-scale))">
        <Group v-model="radioVal" type="radio" :options="fruitOptions" disabled />
        <Group v-model="checkboxVal" type="checkbox" :options="fruitOptions" disabled />
        <Group v-model="rateVal" type="rate" disabled />
        <Group v-model="sliderVal" type="slider" disabled />
      </div>
    </section>
  </div>
  <div class="props-demo-wrap">
    <table class="props-table">
      <tbody>
        <tr class="props-header">
          <th>Prop</th>
          <th>类型</th>
          <th>默认</th>
          <th>说明</th>
        </tr>
        <tr>
          <td><code>invalid</code></td>
          <td>boolean</td>
          <td>—</td>
          <td>
            外部判定为无效（不带文案）：挂到**组容器**的 aria-invalid。
            焦点落在组里的单个选项上，但"这题答错了"是组的语义 —— 所以挂 radiogroup / group（#342）。
          </td>
        </tr>
        <tr>
          <td><code>describedby</code></td>
          <td>string</td>
          <td>—</td>
          <td>外部错误元素的 id：挂到 aria-describedby，让读屏能回查「为什么无效」</td>
        </tr>
        <tr>
          <td><code>type</code></td>
          <td>'radio' \| 'checkbox' \| 'switch' \| 'rate' \| 'slider'</td>
          <td>'radio'</td>
          <td>统一类型：radio \| checkbox \| switch \| rate \| slider</td>
        </tr>
        <tr>
          <td><code>modelValue</code></td>
          <td>string \| number \| boolean \| (string \| number \| boolean)[] \| [number, number]</td>
          <td>—</td>
          <td>受控值：radio/switch 为单值，checkbox 为数组，rate 为数值，slider 为数值或 [起, 止]</td>
        </tr>
        <tr>
          <td><code>options</code></td>
          <td>Option[]</td>
          <td>() => []</td>
          <td>radio / checkbox 模式选项列表</td>
        </tr>
        <tr>
          <td><code>direction</code></td>
          <td>'vertical' \| 'horizontal'</td>
          <td>'vertical'</td>
          <td>radio / checkbox 排列方向</td>
        </tr>
        <tr>
          <td><code>disabled</code></td>
          <td>boolean</td>
          <td>false</td>
          <td>整组禁用</td>
        </tr>
        <tr>
          <td><code>max</code></td>
          <td>number</td>
          <td>0</td>
          <td>checkbox 最多选几项，0 = 不限</td>
        </tr>
        <tr>
          <td><code>ariaLabel</code></td>
          <td>string</td>
          <td>''</td>
          <td>分组标签（无障碍）</td>
        </tr>
        <tr>
          <td><code>label</code></td>
          <td>string</td>
          <td>—</td>
          <td>switch 标签文字</td>
        </tr>
        <tr>
          <td><code>size</code></td>
          <td>'sm' \| 'md'</td>
          <td>'md'</td>
          <td>switch 尺寸</td>
        </tr>
        <tr>
          <td><code>rateMax</code></td>
          <td>number</td>
          <td>5</td>
          <td>rate 最大值，默认 5</td>
        </tr>
        <tr>
          <td><code>allowHalf</code></td>
          <td>boolean</td>
          <td>false</td>
          <td>rate 是否允许半星</td>
        </tr>
        <tr>
          <td><code>color</code></td>
          <td>string</td>
          <td>'#F59E0B'</td>
          <td>rate 颜色</td>
        </tr>
        <tr>
          <td><code>min</code></td>
          <td>number</td>
          <td>0</td>
          <td>slider 最小值</td>
        </tr>
        <tr>
          <td><code>sliderMax</code></td>
          <td>number</td>
          <td>100</td>
          <td>slider 最大值（与 checkbox max 区分）</td>
        </tr>
        <tr>
          <td><code>step</code></td>
          <td>number</td>
          <td>1</td>
          <td>slider 步进</td>
        </tr>
        <tr>
          <td><code>showValue</code></td>
          <td>boolean</td>
          <td>true</td>
          <td>slider 显示当前值</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.demo-container {
  max-width: calc(640px * var(--vcl-scale));
}
.demo-section {
  margin-bottom: calc(24px * var(--vcl-scale));
  padding: calc(16px * var(--vcl-scale));
  border: 1px solid var(--vcl-color-border);
  border-radius: var(--vcl-radius-md);
}
.demo-section h3 {
  margin: 0 0 calc(12px * var(--vcl-scale));
  font-size: calc(15px * var(--vcl-scale));
}
.desc {
  color: var(--vcl-color-text-muted);
  font-size: calc(13px * var(--vcl-scale));
  margin-bottom: calc(16px * var(--vcl-scale));
}
.result {
  margin: calc(8px * var(--vcl-scale)) 0 0;
  font-size: calc(12px * var(--vcl-scale));
  color: var(--vcl-color-primary-on-surface);
}
</style>
