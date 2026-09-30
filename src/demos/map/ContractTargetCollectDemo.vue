<script setup lang="ts">
/**
 * 门店合同目标收集 demo — FormTargetCollect 实例化验证（柜机协议）
 * 合同 schema（contractPhoto 1 个照片位）+ 门店清单。
 * 与手写版 ContractCollectionDemo（写死 49 家）不同：门店数据由宿主注入，可换接口/Excel。
 */
import { FormTargetCollect, contractCollectionSchema } from '@/components/form-builder'
import type { TargetItem } from '@/components/form-builder'

// 示例门店清单（真实业务由接口/Excel 提供，如合同 demo 的 49 家）
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
    id: 3594844,
    name: '汇荣达岳阳市岳阳县月田镇金巧巧手机店',
    license: '岳阳县金巧巧移动专营店',
    address: '湖南省岳阳市岳阳县月田镇金巧巧移动店',
  },
  {
    id: 3652441,
    name: '汇荣达耒阳市公平圩镇会军手机店',
    license: '耒阳市公平圩镇会军电信专营店',
    address: '湖南省衡阳市耒阳市公平圩镇站上中国电信',
  },
  {
    id: 3667942,
    name: '汇荣达宁乡市花明楼镇杨俊通讯店',
    license: '宁乡县花明楼镇杨俊通讯经营部',
    address: '湖南省长沙市宁乡市花明楼镇幸福大道',
  },
]
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">门店合同收集（目标收集模式）</h1>
    <p class="demo-desc">
      FormTargetCollect 实例：合同 schema（柜机协议 1 个照片位）。 门店清单由宿主注入（此处示例 8 家，可换完整 49
      家或接口数据）。
    </p>
    <FormTargetCollect :schema="contractCollectionSchema()" :targets="targets" />
  </div>
</template>

<style scoped>
.demo-title {
  font-size: var(--vcl-fs-20);
  font-weight: 700;
  margin-bottom: calc(4px * var(--vcl-scale));
}
.demo-desc {
  color: var(--vcl-color-text-muted);
  margin-bottom: calc(24px * var(--vcl-scale));
  font-size: calc(14px * var(--vcl-scale));
  line-height: 1.6;
}
</style>
