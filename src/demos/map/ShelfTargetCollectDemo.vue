<script setup lang="ts">
/**
 * 门店陈列目标收集 demo — FormTargetCollect 实例化验证（多照片位）
 * 陈列 schema（frontPhoto/backPhoto 2 个照片位）+ 门店清单。
 */
import { FormTargetCollect, shelfCollectionSchema } from '@/components/form-builder'
import type { TargetItem } from '@/components/form-builder'

// 示例门店清单（真实业务由接口/Excel 提供）
const targets: TargetItem[] = [
  {
    id: 3496644,
    name: '汇荣达汨罗市长乐镇姚献忠手机店',
    license: '汨罗市长乐镇姚献忠手机店',
    address: '湖南省岳阳市汨罗市长乐镇长新村6组24号',
  },
  {
    id: 3496654,
    name: '汇荣达岳阳市湘阴县文星镇新世界手机店',
    license: '湘阴县新世界手机城',
    address: '湖南省岳阳市湘阴县北正街新世界',
  },
  {
    id: 3577361,
    name: '汇荣达岳阳市岳阳县杨林街镇安泰通信店',
    license: '岳阳县安泰通信连锁杨林二店',
    address: '湖南省岳阳市岳阳县杨林街镇城山村',
  },
  {
    id: 3583293,
    name: '汇荣达宁乡市双江口镇宏音手机店',
    license: '宁乡县宏音手机店',
    address: '湖南长沙宁乡双江口镇新建街',
  },
  {
    id: 3594841,
    name: '汇荣达岳阳市平江县安定镇喜洋洋手机店',
    license: '平江县喜洋洋通信器材店',
    address: '湖南省岳阳市平江县安定镇喜洋洋手机店',
  },
  {
    id: 3652441,
    name: '汇荣达耒阳市公平圩镇会军手机店',
    license: '耒阳市公平圩镇会军电信专营店',
    address: '湖南省衡阳市耒阳市公平圩镇站上中国电信',
  },
]
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">门店陈列收集（目标收集模式）</h2>
    <p class="demo-desc">
      FormTargetCollect 多照片位实例：陈列 schema（正面/反面 2 个照片位）。 每家门店需收齐正反两张照片才算完成。
    </p>
    <FormTargetCollect :schema="shelfCollectionSchema()" :targets="targets" />
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
</style>
