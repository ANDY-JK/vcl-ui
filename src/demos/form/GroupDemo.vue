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
  color: var(--vcl-color-primary);
}
</style>
