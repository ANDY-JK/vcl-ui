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
    <h2>Group 统一选择组组件</h2>
    <p class="desc">合并 RadioGroup / CheckboxGroup / Switch / Rate / Slider 为一个统一组件，通过 type 切换。</p>

    <!-- Radio -->
    <section class="demo-section">
      <h3>type="radio" — 单选按钮组</h3>
      <Group type="radio" v-model="radioVal" :options="fruitOptions" direction="horizontal" aria-label="水果单选" />
      <p class="result">当前值：{{ radioVal }}</p>
    </section>

    <!-- Checkbox -->
    <section class="demo-section">
      <h3>type="checkbox" — 复选按钮组</h3>
      <Group type="checkbox" v-model="checkboxVal" :options="fruitOptions" direction="horizontal" :max="3" aria-label="水果多选" />
      <p class="result">当前值：{{ checkboxVal.join(', ') }}</p>
    </section>

    <!-- Switch -->
    <section class="demo-section">
      <h3>type="switch" — 开关</h3>
      <div style="display:flex;gap:24px;align-items:center">
        <Group type="switch" v-model="switchVal" label="默认尺寸" size="md" />
        <Group type="switch" v-model="switchVal" label="小尺寸" size="sm" />
        <Group type="switch" v-model="switchVal" label="禁用" disabled />
      </div>
      <p class="result">当前值：{{ switchVal }}</p>
    </section>

    <!-- Rate -->
    <section class="demo-section">
      <h3>type="rate" — 评分</h3>
      <div style="display:flex;gap:32px;align-items:center">
        <Group type="rate" v-model="rateVal" :rate-max="5" />
        <Group type="rate" v-model="rateVal" :rate-max="5" allow-half color="#EF4444" />
        <Group type="rate" v-model="rateVal" :rate-max="10" color="#10B981" />
      </div>
      <p class="result">当前值：{{ rateVal }}</p>
    </section>

    <!-- Slider -->
    <section class="demo-section">
      <h3>type="slider" — 滑块（单值）</h3>
      <Group type="slider" v-model="sliderVal" :min="0" :slider-max="100" :step="1" />
      <p class="result">当前值：{{ sliderVal }}</p>
    </section>

    <section class="demo-section">
      <h3>type="slider" — 滑块（范围）</h3>
      <Group type="slider" v-model="sliderRange" :min="0" :slider-max="100" :step="5" />
      <p class="result">当前值：{{ sliderRange[0] }} ~ {{ sliderRange[1] }}</p>
    </section>

    <!-- 禁用态 -->
    <section class="demo-section">
      <h3>禁用态</h3>
      <div style="display:flex;flex-direction:column;gap:16px">
        <Group type="radio" v-model="radioVal" :options="fruitOptions" disabled />
        <Group type="checkbox" v-model="checkboxVal" :options="fruitOptions" disabled />
        <Group type="rate" v-model="rateVal" disabled />
        <Group type="slider" v-model="sliderVal" disabled />
      </div>
    </section>
  </div>
</template>

<style scoped>
.demo-container { max-width: 640px; }
.demo-section { margin-bottom: 24px; padding: 16px; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.demo-section h3 { margin: 0 0 12px; font-size: 15px; }
.desc { color: var(--color-text-muted); font-size: 13px; margin-bottom: 16px; }
.result { margin: 8px 0 0; font-size: 12px; color: var(--color-primary); }
</style>
